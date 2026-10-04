-- Server-side enforcement that only an approved organizer can create a new
-- Studio event — not just a client-side gate (StudioAccessGate.tsx, added
-- alongside this migration).
--
-- Why a TRIGGER and not a tightened RLS policy: Postgres RLS policies are
-- permissive and OR'd together per command. We could not safely audit the
-- events table's existing write policy from this session (no DB/MCP
-- access to read live policy definitions — the events-table write policy
-- isn't in any committed migration either, see the comment in
-- 20260604000001_round1_security_advisor_fixes.sql for the same gap noted
-- on an earlier pass). Adding a new, MORE RESTRICTIVE named policy would do
-- nothing if a more permissive one already exists live, since RLS grants
-- access if ANY applicable policy passes. A BEFORE INSERT trigger runs
-- unconditionally regardless of which policies exist, so it's the only way
-- to guarantee this check from here without blind, risky changes to
-- policies we cannot inspect.
--
-- Scoped to INSERT only (new event creation) — not UPDATE — to avoid any
-- risk of this trigger interfering with service_role operations on
-- existing events (cancel-event, admin tooling, etc.). The practical risk
-- this closes is a pending/rejected/suspended organizer creating and
-- publishing a brand new event from Studio; editing an event they already
-- created before losing approval is a narrower, lower-stakes residual gap
-- (flagged in the handoff notes, not fixed here to limit blast radius on a
-- live table with real financial data).
--
-- service_role is explicitly exempt (admin tooling, imports, etc. run as
-- service_role and must not be affected by this organizer-facing check).

CREATE OR REPLACE FUNCTION public.check_organizer_approved_for_event_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status TEXT;
BEGIN
  -- service_role (edge functions, admin tooling) always bypasses this check.
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF NEW.organizer_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT status INTO v_status FROM public.organizer_profiles WHERE id = NEW.organizer_id;

  IF v_status IS DISTINCT FROM 'approved' THEN
    RAISE EXCEPTION 'Organizer is not approved (status: %). Cannot create events until Studio access is approved.', COALESCE(v_status, 'unknown')
      USING ERRCODE = '42501'; -- insufficient_privilege
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_organizer_approved_on_event_insert ON public.events;
CREATE TRIGGER trg_check_organizer_approved_on_event_insert
  BEFORE INSERT ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.check_organizer_approved_for_event_insert();

REVOKE ALL ON FUNCTION public.check_organizer_approved_for_event_insert() FROM PUBLIC, anon, authenticated;
