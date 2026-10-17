-- Additive bootstrap. InsForge wraps this migration in a transaction.
CREATE TABLE public.loopline_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL CHECK (length(full_name) BETWEEN 3 AND 140),
  repository_key text GENERATED ALWAYS AS (lower(full_name)) STORED,
  description text CHECK (length(description) <= 4096),
  default_branch text NOT NULL CHECK (length(default_branch) BETWEEN 1 AND 255),
  html_url text NOT NULL CHECK (html_url = 'https://github.com/' || full_name),
  require_testsprite boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_synced_at timestamptz,
  last_attempted_at timestamptz,
  last_pull_number integer CHECK (last_pull_number > 0),
  last_error_code text CHECK (length(last_error_code) <= 80),
  last_error_message text CHECK (length(last_error_message) <= 500),
  sync_token uuid,
  sync_lease_until timestamptz,
  pull_requests jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(pull_requests) = 'array' AND jsonb_array_length(pull_requests) <= 20
      AND octet_length(pull_requests::text) <= 32768),
  UNIQUE (owner_id, repository_key),
  UNIQUE (id, owner_id)
);

CREATE TABLE public.loopline_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  owner_id uuid NOT NULL,
  head_sha text NOT NULL CHECK (head_sha ~ '^[0-9a-f]{40}$'),
  ref_name text NOT NULL CHECK (length(ref_name) BETWEEN 1 AND 255),
  pr_number integer CHECK (pr_number > 0),
  pr_title text CHECK (length(pr_title) <= 500),
  html_url text NOT NULL CHECK (html_url LIKE 'https://github.com/%' AND length(html_url) <= 2048),
  conclusion text NOT NULL CHECK (conclusion IN ('ready', 'blocked', 'running', 'unverified')),
  checked_at timestamptz NOT NULL DEFAULT now(),
  total integer NOT NULL CHECK (total BETWEEN 0 AND 100),
  passed integer NOT NULL CHECK (passed BETWEEN 0 AND total),
  failed integer NOT NULL CHECK (failed BETWEEN 0 AND total),
  pending integer NOT NULL CHECK (pending BETWEEN 0 AND total),
  reason text NOT NULL CHECK (length(reason) BETWEEN 1 AND 1500),
  evidence_complete boolean NOT NULL,
  CHECK (passed + failed + pending <= total),
  FOREIGN KEY (project_id, owner_id) REFERENCES public.loopline_projects(id, owner_id) ON DELETE CASCADE,
  UNIQUE (id, owner_id, head_sha)
);

CREATE TABLE public.loopline_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id uuid NOT NULL,
  owner_id uuid NOT NULL,
  head_sha text NOT NULL,
  source_id text NOT NULL CHECK (length(source_id) BETWEEN 1 AND 100),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 255),
  provider text NOT NULL CHECK (length(provider) BETWEEN 1 AND 150),
  provider_key text NOT NULL CHECK (length(provider_key) BETWEEN 1 AND 150),
  app_id bigint,
  verified_testsprite boolean NOT NULL DEFAULT false,
  status text NOT NULL CHECK (status IN ('queued', 'in_progress', 'completed', 'unknown')),
  conclusion text CHECK (conclusion IN ('success', 'failure', 'pending', 'neutral', 'skipped',
    'cancelled', 'timed_out', 'action_required', 'startup_failure', 'stale', 'unknown')),
  html_url text CHECK (html_url ~ '^https://[^/[:space:]@]+/' AND length(html_url) <= 2048),
  completed_at timestamptz,
  FOREIGN KEY (snapshot_id, owner_id, head_sha)
    REFERENCES public.loopline_snapshots(id, owner_id, head_sha) ON DELETE CASCADE,
  UNIQUE (snapshot_id, provider_key, name)
);

CREATE INDEX loopline_projects_owner_created ON public.loopline_projects(owner_id, created_at DESC);
CREATE INDEX loopline_snapshots_owner_project_time ON public.loopline_snapshots(owner_id, project_id, checked_at DESC, id DESC);
CREATE INDEX loopline_snapshots_project_owner ON public.loopline_snapshots(project_id, owner_id);
CREATE INDEX loopline_checks_owner_snapshot ON public.loopline_checks(owner_id, snapshot_id);
CREATE INDEX loopline_checks_snapshot_owner_sha ON public.loopline_checks(snapshot_id, owner_id, head_sha);

ALTER TABLE public.loopline_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loopline_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loopline_checks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.loopline_projects, public.loopline_snapshots, public.loopline_checks FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.loopline_projects, public.loopline_snapshots, public.loopline_checks TO authenticated;
CREATE POLICY loopline_projects_owner_read ON public.loopline_projects FOR SELECT TO authenticated
  USING (owner_id = (SELECT auth.uid()));
CREATE POLICY loopline_snapshots_owner_read ON public.loopline_snapshots FOR SELECT TO authenticated
  USING (owner_id = (SELECT auth.uid()));
CREATE POLICY loopline_checks_owner_read ON public.loopline_checks FOR SELECT TO authenticated
  USING (owner_id = (SELECT auth.uid()));

-- Only project_admin has EXECUTE; no SECURITY DEFINER or RLS policy joins are needed.
CREATE FUNCTION public.loopline_admin(
  p_action text, p_owner_id uuid, p_project_id uuid DEFAULT NULL, p_payload jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_project public.loopline_projects%ROWTYPE;
  v_snapshot_id uuid;
  v_snapshot jsonb;
  v_check jsonb;
  v_now timestamptz := clock_timestamp();
  v_retry integer;
BEGIN
  IF p_owner_id IS NULL OR octet_length(p_payload::text) > 262144 THEN
    RAISE EXCEPTION 'LL_INVALID_PAYLOAD';
  END IF;
  -- Serialize quota/connect races for one owner; no lock is held across network calls.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_owner_id::text, 0));
  IF p_project_id IS NOT NULL THEN
    SELECT * INTO v_project FROM public.loopline_projects
      WHERE id = p_project_id AND owner_id = p_owner_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'LL_NOT_FOUND'; END IF;
  END IF;

  IF p_action = 'disconnect' AND p_project_id IS NOT NULL THEN
    DELETE FROM public.loopline_projects WHERE id = v_project.id AND owner_id = p_owner_id;
    RETURN jsonb_build_object('success', true);
  ELSIF p_action = 'claim_sync' AND p_project_id IS NOT NULL THEN
    IF v_project.sync_lease_until > v_now THEN
      RETURN jsonb_build_object('claimed', false, 'cached', false, 'retryAfterSeconds', 120);
    END IF;
    v_retry := greatest(0, ceil(extract(epoch FROM v_project.last_attempted_at + interval '10 minutes' - v_now))::integer);
    IF v_retry > 0 THEN
      RETURN jsonb_build_object('claimed', false, 'cached',
        v_project.last_synced_at IS NOT NULL AND v_project.last_error_code IS NULL
        AND v_project.last_synced_at >= v_project.last_attempted_at
        AND v_project.last_pull_number IS NOT DISTINCT FROM (p_payload->>'pullNumber')::integer,
        'retryAfterSeconds', v_retry);
    END IF;
    UPDATE public.loopline_projects SET last_attempted_at = v_now,
      sync_token = gen_random_uuid(), sync_lease_until = v_now + interval '2 minutes'
      WHERE id = v_project.id AND owner_id = p_owner_id RETURNING * INTO v_project;
    RETURN jsonb_build_object('claimed', true, 'token', v_project.sync_token);
  ELSIF p_action = 'fail_sync' AND p_project_id IS NOT NULL THEN
    IF v_project.sync_token IS DISTINCT FROM (p_payload->>'token')::uuid THEN
      RAISE EXCEPTION 'LL_LEASE_LOST';
    END IF;
    UPDATE public.loopline_projects SET sync_token = NULL, sync_lease_until = NULL,
      last_error_code = left(p_payload->>'code', 80), last_error_message = left(p_payload->>'message', 500)
      WHERE id = v_project.id AND owner_id = p_owner_id;
    RETURN jsonb_build_object('success', true);
  ELSIF p_action <> 'persist' THEN
    RAISE EXCEPTION 'LL_INVALID_ACTION';
  END IF;

  v_snapshot := p_payload->'snapshot';
  IF jsonb_typeof(v_snapshot) IS DISTINCT FROM 'object'
    OR jsonb_typeof(v_snapshot->'checks') IS DISTINCT FROM 'array'
    OR jsonb_array_length(v_snapshot->'checks') > 100
    OR jsonb_array_length(v_snapshot->'checks') <> (v_snapshot->'summary'->>'total')::integer
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_snapshot->'checks') c
      WHERE c->>'head_sha' IS DISTINCT FROM v_snapshot->>'head_sha') THEN
    RAISE EXCEPTION 'LL_INVALID_EVIDENCE';
  END IF;
  IF p_project_id IS NULL THEN
    SELECT * INTO v_project FROM public.loopline_projects
      WHERE owner_id = p_owner_id AND repository_key = lower(p_payload->'project'->>'full_name') FOR UPDATE;
    IF FOUND THEN
      IF v_project.sync_lease_until > v_now THEN RAISE EXCEPTION 'LL_LEASE_LOST'; END IF;
      IF v_project.last_attempted_at > v_now - interval '10 minutes' THEN
        IF v_project.require_testsprite IS DISTINCT FROM (p_payload->'project'->>'require_testsprite')::boolean THEN
          RAISE EXCEPTION 'LL_COOLDOWN';
        END IF;
        RETURN jsonb_build_object('projectId', v_project.id, 'saved', false);
      END IF;
    ELSE
      IF (SELECT count(*) FROM public.loopline_projects WHERE owner_id = p_owner_id) >= 5 THEN
        RAISE EXCEPTION 'LL_PROJECT_LIMIT';
      END IF;
      INSERT INTO public.loopline_projects(owner_id, full_name, description, default_branch, html_url, require_testsprite)
        VALUES (p_owner_id, p_payload->'project'->>'full_name', p_payload->'project'->>'description',
          p_payload->'project'->>'default_branch', p_payload->'project'->>'html_url',
          (p_payload->'project'->>'require_testsprite')::boolean) RETURNING * INTO v_project;
    END IF;
  ELSIF v_project.sync_token IS DISTINCT FROM (p_payload->>'token')::uuid
    OR v_project.sync_lease_until <= v_now THEN
    RAISE EXCEPTION 'LL_LEASE_LOST';
  END IF;
  IF v_project.repository_key <> lower(p_payload->'project'->>'full_name') THEN
    RAISE EXCEPTION 'LL_INVALID_PAYLOAD';
  END IF;

  INSERT INTO public.loopline_snapshots(project_id, owner_id, head_sha, ref_name, pr_number, pr_title,
    html_url, conclusion, checked_at, total, passed, failed, pending, reason, evidence_complete)
  VALUES (v_project.id, p_owner_id, v_snapshot->>'head_sha', v_snapshot->>'ref_name',
    (v_snapshot->>'pr_number')::integer, v_snapshot->>'pr_title', v_snapshot->>'html_url',
    v_snapshot->>'conclusion', v_now, (v_snapshot->'summary'->>'total')::integer,
    (v_snapshot->'summary'->>'passed')::integer, (v_snapshot->'summary'->>'failed')::integer,
    (v_snapshot->'summary'->>'pending')::integer, v_snapshot->>'reason',
    (v_snapshot->>'evidence_complete')::boolean) RETURNING id INTO v_snapshot_id;
  FOR v_check IN SELECT * FROM jsonb_array_elements(v_snapshot->'checks') LOOP
    INSERT INTO public.loopline_checks(snapshot_id, owner_id, head_sha, source_id, name, provider,
      provider_key, app_id, verified_testsprite, status, conclusion, html_url, completed_at)
    VALUES (v_snapshot_id, p_owner_id, v_check->>'head_sha', v_check->>'id', v_check->>'name',
      v_check->>'provider', v_check->>'provider_key', (v_check->>'app_id')::bigint,
      (v_check->>'verified_testsprite')::boolean, v_check->>'status', v_check->>'conclusion',
      v_check->>'html_url', (v_check->>'completed_at')::timestamptz);
  END LOOP;
  UPDATE public.loopline_projects SET description = p_payload->'project'->>'description',
    default_branch = p_payload->'project'->>'default_branch',
    require_testsprite = (p_payload->'project'->>'require_testsprite')::boolean,
    last_synced_at = v_now, last_attempted_at = v_now,
    last_pull_number = (v_snapshot->>'pr_number')::integer,
    last_error_code = NULL, last_error_message = NULL, sync_token = NULL, sync_lease_until = NULL,
    pull_requests = p_payload->'pullRequests'
    WHERE id = v_project.id AND owner_id = p_owner_id;
  DELETE FROM public.loopline_snapshots WHERE project_id = v_project.id AND owner_id = p_owner_id
    AND id IN (SELECT id FROM public.loopline_snapshots WHERE project_id = v_project.id AND owner_id = p_owner_id
      ORDER BY checked_at DESC, id DESC OFFSET 10);
  RETURN jsonb_build_object('projectId', v_project.id, 'snapshotId', v_snapshot_id, 'saved', true);
END;
$function$;
REVOKE ALL ON FUNCTION public.loopline_admin(text, uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.loopline_admin(text, uuid, uuid, jsonb) TO project_admin;
