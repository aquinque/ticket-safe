-- ============================================================================
-- Ticket Safe — Security infrastructure: audit_log + server-side rate limits
-- ============================================================================
-- This migration adds two security primitives:
--
--   1. `audit_log` — append-only record of sensitive actions
--      (auth events, organizer approvals, payment lifecycle, admin overrides).
--      Used to trace abuse and answer "who did what, when?".
--
--   2. `rate_limits` — server-side counter for sensitive endpoints
--      (auth, checkout creation, organizer applications). Protects against
--      brute force, scraping and cost-of-service attacks. Used by the
--      _shared/rateLimit.ts edge helper.
--
-- Both tables are write-protected via RLS — only the service role can mutate
-- them. Admins can read audit_log; nobody else can.
-- ============================================================================

-- ------------------------------------------------------------------------ AUDIT
CREATE TABLE IF NOT EXISTS public.audit_log (
  id           BIGSERIAL    PRIMARY KEY,
  occurred_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  actor_id     UUID         REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email  TEXT,
  action       TEXT         NOT NULL CHECK (length(action) BETWEEN 1 AND 80),
  target_kind  TEXT         CHECK (target_kind IS NULL OR length(target_kind) <= 40),
  target_id    TEXT         CHECK (target_id IS NULL OR length(target_id) <= 120),
  ip           INET,
  user_agent   TEXT         CHECK (user_agent IS NULL OR length(user_agent) <= 400),
  meta         JSONB        NOT NULL DEFAULT '{}'::jsonb,
  -- Defense in depth: the JSON payload is capped at 8 KB so a runaway
  -- caller cannot flood the table with megabyte logs.
  CONSTRAINT audit_log_meta_size CHECK (octet_length(meta::text) <= 8192)
);

CREATE INDEX IF NOT EXISTS audit_log_occurred_at_idx ON public.audit_log (occurred_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_actor_id_idx    ON public.audit_log (actor_id);
CREATE INDEX IF NOT EXISTS audit_log_action_idx      ON public.audit_log (action);
CREATE INDEX IF NOT EXISTS audit_log_target_idx      ON public.audit_log (target_kind, target_id);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Nobody can insert / update / delete via the anon or authenticated role —
-- writes go through the service role (edge functions). Updates and deletes
-- are not granted to anyone (append-only by design).
DROP POLICY IF EXISTS "audit_log_admin_read" ON public.audit_log;
CREATE POLICY "audit_log_admin_read"
  ON public.audit_log FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
  ));

REVOKE INSERT, UPDATE, DELETE ON public.audit_log FROM authenticated, anon;

-- Convenience RPC used by edge functions. SECURITY DEFINER so it inserts
-- with the function's privileges even when called from a user-scoped client.
CREATE OR REPLACE FUNCTION public.audit_record(
  p_action      TEXT,
  p_target_kind TEXT DEFAULT NULL,
  p_target_id   TEXT DEFAULT NULL,
  p_meta        JSONB DEFAULT '{}'::jsonb,
  p_actor_id    UUID  DEFAULT NULL,
  p_actor_email TEXT  DEFAULT NULL,
  p_ip          INET  DEFAULT NULL,
  p_user_agent  TEXT  DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.audit_log (
    actor_id, actor_email, action, target_kind, target_id,
    ip, user_agent, meta
  )
  VALUES (
    COALESCE(p_actor_id, auth.uid()),
    p_actor_email,
    p_action,
    p_target_kind,
    p_target_id,
    p_ip,
    p_user_agent,
    COALESCE(p_meta, '{}'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.audit_record FROM PUBLIC, anon, authenticated;
-- Only the service role (edge functions) can audit.
GRANT EXECUTE ON FUNCTION public.audit_record TO service_role;

-- ---------------------------------------------------------------- RATE LIMITS
CREATE TABLE IF NOT EXISTS public.rate_limits (
  bucket       TEXT        NOT NULL CHECK (length(bucket) BETWEEN 1 AND 80),
  key          TEXT        NOT NULL CHECK (length(key) BETWEEN 1 AND 200),
  window_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  hits         INTEGER     NOT NULL DEFAULT 1 CHECK (hits >= 0),
  PRIMARY KEY (bucket, key, window_start)
);

CREATE INDEX IF NOT EXISTS rate_limits_window_idx
  ON public.rate_limits (window_start);

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

-- Nobody can read/write through anon or authenticated. Service role only.
REVOKE ALL ON public.rate_limits FROM authenticated, anon, PUBLIC;

-- Atomic "consume one token from this bucket+key over the given window".
-- Returns true if the request fits within the budget, false if the caller
-- should be rejected.
CREATE OR REPLACE FUNCTION public.rate_limit_consume(
  p_bucket     TEXT,
  p_key        TEXT,
  p_max_hits   INTEGER,
  p_window_sec INTEGER
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window_start TIMESTAMPTZ;
  v_current      INTEGER;
BEGIN
  -- Quantise the window so all hits inside the same period share a row.
  v_window_start := date_trunc('second', now())
                  - (extract(epoch FROM now())::INTEGER % p_window_sec) * INTERVAL '1 second';

  INSERT INTO public.rate_limits (bucket, key, window_start, hits)
  VALUES (p_bucket, p_key, v_window_start, 1)
  ON CONFLICT (bucket, key, window_start)
  DO UPDATE SET hits = public.rate_limits.hits + 1
  RETURNING hits INTO v_current;

  -- Best-effort cleanup of stale rows older than 1 day.
  DELETE FROM public.rate_limits WHERE window_start < now() - INTERVAL '1 day';

  RETURN v_current <= p_max_hits;
END;
$$;

REVOKE ALL ON FUNCTION public.rate_limit_consume FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rate_limit_consume TO service_role;
