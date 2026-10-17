-- Additive target-aware cache and durable abuse boundary. Do not edit the bootstrap.
ALTER TABLE public.loopline_snapshots
  ADD COLUMN invalidated_at timestamptz,
  ADD COLUMN sync_error_code text CHECK (length(sync_error_code) <= 80),
  ADD COLUMN sync_error_message text CHECK (length(sync_error_message) <= 500);
CREATE INDEX loopline_snapshots_owner_target_time
  ON public.loopline_snapshots(owner_id, project_id, pr_number, checked_at DESC, id DESC);

-- One bounded row per user, deliberately independent of connections so reconnect cannot reset it.
CREATE TABLE public.loopline_sync_budgets (
  owner_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  recent_attempts timestamptz[] NOT NULL DEFAULT ARRAY[]::timestamptz[]
    CHECK (cardinality(recent_attempts) <= 6 AND array_position(recent_attempts, NULL) IS NULL),
  lease_token uuid,
  lease_until timestamptz,
  lease_project_id uuid,
  lease_repository text CHECK (length(lease_repository) BETWEEN 3 AND 140),
  lease_pull_number integer CHECK (lease_pull_number > 0)
);
CREATE TABLE public.loopline_source_state (
  id smallint PRIMARY KEY CHECK (id = 1),
  blocked_until timestamptz NOT NULL DEFAULT '-infinity'::timestamptz
);
INSERT INTO public.loopline_source_state(id) VALUES (1);
ALTER TABLE public.loopline_sync_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loopline_source_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.loopline_sync_budgets, public.loopline_source_state FROM PUBLIC, anon, authenticated;

-- Pure policy helper permits read-only verification of the real SQL budget without test users.
CREATE FUNCTION public.loopline_sync_window(p_attempts timestamptz[], p_now timestamptz, p_lease_until timestamptz)
RETURNS TABLE(recent_attempts timestamptz[], retry_after_seconds integer, reason text)
LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path = pg_catalog, public, pg_temp
AS $window$
BEGIN
  IF p_now IS NULL OR p_attempts IS NULL OR cardinality(p_attempts) > 6 THEN RAISE EXCEPTION 'LL_INVALID_PAYLOAD'; END IF;
  SELECT coalesce(array_agg(attempted_at ORDER BY attempted_at), ARRAY[]::timestamptz[]) INTO recent_attempts
    FROM unnest(p_attempts) AS attempts(attempted_at) WHERE attempted_at > p_now - interval '10 minutes';
  IF p_lease_until > p_now THEN
    retry_after_seconds := ceil(extract(epoch FROM p_lease_until - p_now))::integer;
    reason := 'lease';
  ELSE
    retry_after_seconds := greatest(0, ceil(extract(epoch FROM recent_attempts[cardinality(recent_attempts)] + interval '10 seconds' - p_now))::integer);
    IF cardinality(recent_attempts) >= 6 THEN
      retry_after_seconds := greatest(retry_after_seconds, ceil(extract(epoch FROM recent_attempts[1] + interval '10 minutes' - p_now))::integer);
      reason := 'budget';
    ELSE reason := 'minimum_interval';
    END IF;
  END IF;
  RETURN NEXT;
END;
$window$;
REVOKE ALL ON FUNCTION public.loopline_sync_window(timestamptz[], timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.loopline_sync_window(timestamptz[], timestamptz, timestamptz) TO project_admin;

-- Preserve historical evidence, but mark previously failed/interrupted observations non-current.
UPDATE public.loopline_snapshots s SET invalidated_at = clock_timestamp(),
  sync_error_code = coalesce(p.last_error_code, 'SYNC_INTERRUPTED'),
  sync_error_message = coalesce(p.last_error_message, 'A previous sync did not complete. Sync again to verify this target.')
FROM public.loopline_projects p WHERE p.id = s.project_id AND p.owner_id = s.owner_id
  AND (p.last_error_code IS NOT NULL OR p.last_attempted_at > p.last_synced_at);

-- Keep the already-applied atomic snapshot writer as an internal, admin-only helper.
ALTER FUNCTION public.loopline_admin(text, uuid, uuid, jsonb) RENAME TO loopline_admin_base;
REVOKE ALL ON FUNCTION public.loopline_admin_base(text, uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.loopline_admin(
  p_action text, p_owner_id uuid, p_project_id uuid DEFAULT NULL, p_payload jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_project public.loopline_projects%ROWTYPE;
  v_budget public.loopline_sync_budgets%ROWTYPE;
  v_snapshot public.loopline_snapshots%ROWTYPE;
  v_attempts timestamptz[];
  v_now timestamptz := clock_timestamp();
  v_blocked_until timestamptz;
  v_retry integer;
  v_target integer;
  v_repository text;
  v_token uuid;
  v_result jsonb;
  v_window record;
BEGIN
  IF p_payload IS NULL OR octet_length(p_payload::text) > 262144 THEN RAISE EXCEPTION 'LL_INVALID_PAYLOAD'; END IF;
  IF p_action = 'rate_limit' THEN
    v_retry := (p_payload->>'retryAfterSeconds')::integer;
    IF v_retry IS NULL OR v_retry NOT BETWEEN 1 AND 3600 THEN RAISE EXCEPTION 'LL_INVALID_PAYLOAD'; END IF;
    UPDATE public.loopline_source_state SET blocked_until = greatest(blocked_until, v_now + make_interval(secs => v_retry)) WHERE id = 1;
    RETURN jsonb_build_object('success', true);
  ELSIF p_action = 'source_state' THEN
    SELECT blocked_until INTO v_blocked_until FROM public.loopline_source_state WHERE id = 1;
    RETURN jsonb_build_object('limited', v_blocked_until > v_now,
      'retryAfterSeconds', greatest(0, ceil(extract(epoch FROM v_blocked_until - v_now)))::integer);
  END IF;
  IF p_owner_id IS NULL THEN RAISE EXCEPTION 'LL_INVALID_PAYLOAD'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_owner_id::text, 0));
  v_now := clock_timestamp();
  IF p_project_id IS NOT NULL THEN
    SELECT * INTO v_project FROM public.loopline_projects WHERE id = p_project_id AND owner_id = p_owner_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'LL_NOT_FOUND'; END IF;
  END IF;
  IF p_action = 'disconnect' AND p_project_id IS NOT NULL THEN
    -- Budget and any active lease deliberately survive disconnect.
    RETURN public.loopline_admin_base(p_action, p_owner_id, p_project_id, p_payload);
  END IF;

  IF p_action IN ('claim_connect', 'claim_sync') THEN
    SELECT blocked_until INTO v_blocked_until FROM public.loopline_source_state WHERE id = 1;
    IF v_blocked_until > v_now THEN
      RETURN jsonb_build_object('claimed', false, 'cached', false, 'code', 'GITHUB_RATE_LIMITED',
        'retryAfterSeconds', ceil(extract(epoch FROM v_blocked_until - v_now))::integer);
    END IF;
    IF p_action = 'claim_connect' AND p_project_id IS NULL THEN
      v_repository := lower(p_payload->>'repository');
      IF v_repository IS NULL OR length(v_repository) NOT BETWEEN 3 AND 140 THEN RAISE EXCEPTION 'LL_INVALID_PAYLOAD'; END IF;
      SELECT * INTO v_project FROM public.loopline_projects WHERE owner_id = p_owner_id AND repository_key = v_repository;
      IF FOUND THEN RETURN jsonb_build_object('claimed', false, 'existing', true, 'projectId', v_project.id); END IF;
      IF (SELECT count(*) FROM public.loopline_projects WHERE owner_id = p_owner_id) >= 5 THEN RAISE EXCEPTION 'LL_PROJECT_LIMIT'; END IF;
      v_target := NULL;
    ELSIF p_action = 'claim_sync' AND p_project_id IS NOT NULL THEN
      v_repository := v_project.repository_key;
      v_target := (p_payload->>'pullNumber')::integer;
      IF v_target IS NOT NULL AND v_target <= 0 THEN RAISE EXCEPTION 'LL_INVALID_PAYLOAD'; END IF;
      -- A successful read of ANY conclusion may be reused, but only for the exact target.
      SELECT * INTO v_snapshot FROM public.loopline_snapshots
        WHERE owner_id = p_owner_id AND project_id = p_project_id AND pr_number IS NOT DISTINCT FROM v_target
        ORDER BY checked_at DESC, id DESC LIMIT 1;
      IF FOUND AND v_snapshot.invalidated_at IS NULL AND v_snapshot.checked_at > v_now - interval '10 minutes' THEN
        RETURN jsonb_build_object('claimed', false, 'cached', true, 'projectId', p_project_id, 'snapshotId', v_snapshot.id);
      END IF;
    ELSE RAISE EXCEPTION 'LL_INVALID_ACTION';
    END IF;

    INSERT INTO public.loopline_sync_budgets(owner_id) VALUES (p_owner_id) ON CONFLICT (owner_id) DO NOTHING;
    SELECT * INTO v_budget FROM public.loopline_sync_budgets WHERE owner_id = p_owner_id FOR UPDATE;
    SELECT * INTO v_window FROM public.loopline_sync_window(v_budget.recent_attempts, v_now, v_budget.lease_until);
    IF v_window.retry_after_seconds > 0 THEN
      RETURN jsonb_build_object('claimed', false, 'cached', false, 'code', 'SYNC_COOLDOWN',
        'reason', v_window.reason, 'retryAfterSeconds', v_window.retry_after_seconds);
    END IF;
    v_attempts := v_window.recent_attempts;
    v_token := gen_random_uuid();
    UPDATE public.loopline_sync_budgets SET recent_attempts = array_append(v_attempts, v_now), lease_token = v_token,
      lease_until = v_now + interval '2 minutes', lease_project_id = p_project_id, lease_repository = v_repository,
      lease_pull_number = v_target WHERE owner_id = p_owner_id;
    IF p_project_id IS NOT NULL THEN
      UPDATE public.loopline_projects SET last_attempted_at = v_now, sync_token = v_token,
        sync_lease_until = v_now + interval '2 minutes' WHERE id = p_project_id AND owner_id = p_owner_id;
      UPDATE public.loopline_snapshots SET invalidated_at = v_now, sync_error_code = 'SYNC_IN_PROGRESS',
        sync_error_message = 'A new read of this target has not completed; retained evidence is not current.'
        WHERE project_id = p_project_id AND owner_id = p_owner_id AND pr_number IS NOT DISTINCT FROM v_target;
    END IF;
    RETURN jsonb_build_object('claimed', true, 'token', v_token);
  END IF;

  SELECT * INTO v_budget FROM public.loopline_sync_budgets WHERE owner_id = p_owner_id FOR UPDATE;
  IF NOT FOUND OR v_budget.lease_token IS NULL OR v_budget.lease_token IS DISTINCT FROM (p_payload->>'token')::uuid
    OR v_budget.lease_project_id IS DISTINCT FROM p_project_id THEN RAISE EXCEPTION 'LL_LEASE_LOST'; END IF;
  IF p_project_id IS NOT NULL AND v_budget.lease_repository IS DISTINCT FROM v_project.repository_key THEN RAISE EXCEPTION 'LL_LEASE_LOST'; END IF;

  IF p_action = 'fail_sync' THEN
    IF p_project_id IS NOT NULL THEN
      UPDATE public.loopline_projects SET sync_token = NULL, sync_lease_until = NULL,
        last_error_code = left(p_payload->>'code', 80), last_error_message = left(p_payload->>'message', 500)
        WHERE id = p_project_id AND owner_id = p_owner_id;
      UPDATE public.loopline_snapshots SET invalidated_at = v_now,
        sync_error_code = left(p_payload->>'code', 80), sync_error_message = left(p_payload->>'message', 500)
        WHERE project_id = p_project_id AND owner_id = p_owner_id AND pr_number IS NOT DISTINCT FROM v_budget.lease_pull_number;
    END IF;
    v_result := jsonb_build_object('success', true);
  ELSIF p_action = 'persist' THEN
    IF v_budget.lease_until IS NULL OR v_budget.lease_until <= v_now
      OR v_budget.lease_repository IS DISTINCT FROM lower(p_payload->'project'->>'full_name')
      OR v_budget.lease_pull_number IS DISTINCT FROM (p_payload->'snapshot'->>'pr_number')::integer THEN
      RAISE EXCEPTION 'LL_LEASE_LOST';
    END IF;
    v_result := public.loopline_admin_base('persist', p_owner_id, p_project_id, p_payload);
    IF (v_result->>'saved')::boolean IS DISTINCT FROM true THEN RAISE EXCEPTION 'LL_LEASE_LOST'; END IF;
  ELSE RAISE EXCEPTION 'LL_INVALID_ACTION';
  END IF;
  -- Same transaction as the snapshot write/failure marker. Attempts are never refunded.
  UPDATE public.loopline_sync_budgets SET lease_token = NULL, lease_until = NULL, lease_project_id = NULL,
    lease_repository = NULL, lease_pull_number = NULL WHERE owner_id = p_owner_id;
  RETURN v_result;
END;
$function$;
REVOKE ALL ON FUNCTION public.loopline_admin(text, uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.loopline_admin(text, uuid, uuid, jsonb) TO project_admin;
