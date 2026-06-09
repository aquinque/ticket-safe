-- Revolut Business API integration columns. Track the API-side ids on
-- each payout so poll-revolut-batch can sync state back without guesswork.
--
-- (Applied to production via MCP. This file is the on-disk twin.)

ALTER TABLE public.organizer_payouts
  ADD COLUMN IF NOT EXISTS revolut_transfer_id TEXT,
  ADD COLUMN IF NOT EXISTS revolut_counterparty_id TEXT,
  ADD COLUMN IF NOT EXISTS revolut_state TEXT;

ALTER TABLE public.seller_payouts
  ADD COLUMN IF NOT EXISTS revolut_transfer_id TEXT,
  ADD COLUMN IF NOT EXISTS revolut_counterparty_id TEXT,
  ADD COLUMN IF NOT EXISTS revolut_state TEXT;

ALTER TABLE public.payout_batches
  ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'xml'
    CHECK (provider IN ('xml','revolut_api'));

CREATE INDEX IF NOT EXISTS organizer_payouts_revolut_tx_idx
  ON public.organizer_payouts(revolut_transfer_id);
CREATE INDEX IF NOT EXISTS seller_payouts_revolut_tx_idx
  ON public.seller_payouts(revolut_transfer_id);
