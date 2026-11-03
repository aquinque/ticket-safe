# Revolut (legacy)

**Resale: legacy, only for withdrawing old wallet balances.**

Resale sales are paid through Stripe (`stripe-connect-resale-checkout`, completed by
`stripe-connect-webhook`, seller paid to their bank after the event by
`stripe-connect-payout-cron`). No resale payment goes through Revolut any more.

What is left on the resale side:

- Sales paid through Revolut before the Stripe switch were credited to the seller's
  wallet (`seller_earnings` view). Sellers withdraw that balance from
  `/settings/listings` via `request-seller-payout`: IBAN + amount, 5% fee at
  withdrawal, wired manually by SEPA.
- `revolut-resale-checkout` and `src/lib/revolutPayment.ts` are still in the repo but
  not called by the site. `revolut-resale-checkout` applies the same resale price cap
  as the Stripe checkout in case it is called directly.

Outside resale, Revolut is still live for:

- listing boosts (`revolut-boost-checkout`, `revolut-boost-confirm`, from `/settings/listings`);
- Studio events whose `payment_provider` is not `stripe` (`revolut-create-checkout`,
  completed by `revolut-webhook`).
