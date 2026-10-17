-- An inactive backoff needs a finite sentinel: PostgreSQL cannot subtract infinite timestamps.
-- This preserves all active rate limits and changes no user data or historical evidence.
UPDATE public.loopline_source_state SET blocked_until = 'epoch'::timestamptz
  WHERE blocked_until = '-infinity'::timestamptz;
ALTER TABLE public.loopline_source_state ALTER COLUMN blocked_until SET DEFAULT 'epoch'::timestamptz;
ALTER TABLE public.loopline_source_state ADD CONSTRAINT loopline_source_state_finite CHECK (isfinite(blocked_until));
