-- AI management columns for the site-management bot.
--
-- Adds three columns to public.tickets:
--   ai_score        — integer 0-100, overall confidence the ticket is authentic
--   ai_assessment   — jsonb structured breakdown (signals, model, reasoning)
--   ai_reviewed_at  — timestamptz of last AI evaluation
--
-- Score semantics:
--   >= 80  → high confidence (eligible for auto-approval)
--   60-79  → needs admin review
--   <  60  → likely fraud signal, recommend reject
--
-- The column is advisory only — the final approve/reject decision still
-- flows through admin-review-ticket. We never auto-reject; we only
-- auto-approve high scores when explicitly enabled by the admin function.

ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS ai_score        INTEGER,
  ADD COLUMN IF NOT EXISTS ai_assessment   JSONB,
  ADD COLUMN IF NOT EXISTS ai_reviewed_at  TIMESTAMPTZ;

ALTER TABLE public.tickets
  DROP CONSTRAINT IF EXISTS tickets_ai_score_range;
ALTER TABLE public.tickets
  ADD CONSTRAINT tickets_ai_score_range
  CHECK (ai_score IS NULL OR (ai_score >= 0 AND ai_score <= 100));

CREATE INDEX IF NOT EXISTS idx_tickets_ai_score
  ON public.tickets (ai_score)
  WHERE ai_score IS NOT NULL;

COMMENT ON COLUMN public.tickets.ai_score IS
  'AI confidence score 0-100 that the ticket is authentic. Advisory.';
COMMENT ON COLUMN public.tickets.ai_assessment IS
  'JSON breakdown of AI signals: duplicate, nominative, visual, summary.';
COMMENT ON COLUMN public.tickets.ai_reviewed_at IS
  'Timestamp of last AI evaluation run via ai-ticket-score.';
