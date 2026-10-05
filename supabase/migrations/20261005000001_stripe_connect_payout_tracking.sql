-- Follow-up to 20261005000000: tracks which resale transactions have
-- already been included in a reseller payout job, so the cron's "what do
-- we owe this seller" sum never double-counts a transaction across runs.
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS payout_job_id uuid REFERENCES public.stripe_connect_payout_jobs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS transactions_payout_job_idx ON public.transactions (payout_job_id) WHERE payout_job_id IS NULL;
