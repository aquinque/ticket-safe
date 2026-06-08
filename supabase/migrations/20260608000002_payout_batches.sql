-- Batch SEPA payouts so admins can pay everyone (Studio + resale) in one
-- bank upload instead of doing them one by one.
--
-- (Applied to production via MCP. This file is the on-disk twin.)

CREATE TABLE IF NOT EXISTS public.payout_batches (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES public.profiles(id),
  status TEXT NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing','sent','cancelled')),
  total_cents BIGINT NOT NULL DEFAULT 0,
  num_payouts INTEGER NOT NULL DEFAULT 0,
  sent_at TIMESTAMPTZ,
  notes TEXT
);

ALTER TABLE public.seller_payouts
  ADD COLUMN IF NOT EXISTS batch_id TEXT REFERENCES public.payout_batches(id);

ALTER TABLE public.organizer_payouts
  ADD COLUMN IF NOT EXISTS batch_id TEXT REFERENCES public.payout_batches(id);

CREATE INDEX IF NOT EXISTS seller_payouts_batch_idx ON public.seller_payouts(batch_id);
CREATE INDEX IF NOT EXISTS organizer_payouts_batch_idx ON public.organizer_payouts(batch_id);

ALTER TABLE public.payout_batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payout_batches_admin_all ON public.payout_batches;
CREATE POLICY payout_batches_admin_all ON public.payout_batches
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));
