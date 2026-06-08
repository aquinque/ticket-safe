-- Resale webhook (stripe-webhook v31) writes payment_intent_id on the
-- transactions row when a checkout.session.completed comes back paid.
-- The column was missing in the deployed schema so every resale completion
-- was bouncing with 42703 and the listing stayed reserved.
--
-- (Applied to production via MCP. This file is the on-disk twin.)

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS payment_intent_id TEXT;

CREATE INDEX IF NOT EXISTS transactions_payment_intent_idx
  ON public.transactions(payment_intent_id);
