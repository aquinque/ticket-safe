-- Configurable policy for whether refunding a Stripe Connect direct-charge
-- order also refunds TicketSafe's own application fee. Default true: when
-- we refund a buyer, we don't keep our cut of a sale that didn't happen.
-- Used by cancel-event and admin-refund-order, additively (see those
-- files' comments) — does not affect Revolut refunds at all.
ALTER TABLE public.billing_settings
  ADD COLUMN IF NOT EXISTS refund_application_fee_on_refund boolean NOT NULL DEFAULT true;
