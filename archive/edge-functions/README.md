# Retired edge functions

Supabase edge functions retired on 2026-11-02. They had no caller in the web app, in the other
functions or in the database (cron jobs, triggers, SQL functions). Each folder keeps the exact code that
was running in production just before retirement; for the functions that only ever existed in
production, this folder is the only copy.

This directory is outside `supabase/functions/`, so nothing here is deployed.

| Function | Last live version | verify_jwt | What it was |
|---|---|---|---|
| `setup-admins` | 34 | false | One-off admin bootstrap. Public with no check: every call reset the two admin roles and returned every user's email. Neutralized first. Production only. |
| `revolut-test` | 17 | false | Revolut Merchant debug helper (test orders, webhook registration) using the live key. Production only. |
| `stripe-webhook` | 56 | false | Platform webhook from before Stripe Connect. No Stripe destination pointed at it. |
| `stripe-create-checkout` | 53 | false | Resale checkout charged on the platform's Stripe account (resale goes through Revolut). |
| `stripe-onboard-seller` | 35 | true | Old Stripe onboarding for resale sellers. |
| `stripe-account-status` | 35 | true | Old Stripe account status for resale sellers. |
| `stripe-express-dashboard` | 25 | false | Old Express dashboard link (the Studio uses `stripe-connect-onboard-organizer`). |
| `release-payout` | 20 | true | Old per-order Stripe transfers to organizers (replaced by `stripe-connect-payout-cron`). |
| `studio-create-checkout` | 37 | false | Old Studio Stripe checkout, already marked dormant. |
| `stripe-connect-request-payout` | 5 | true | Organizer payout request; cash-outs go through `stripe-connect-onboard-organizer`. Production only. |
| `claim-free-ticket` | 23 | true | Beta flow for free tickets (the checkout handles free tiers). Production only. |
| `resend-resale-emails` | 11 | false | One-off admin tool to resend resale emails. Production only. |
| `generate-secure-ticket` | 11 | true | Old signed ticket tokens. |
| `validate-scan` | 11 | true | Old door scan validation. |
| `generate-ticket-download-url` | 11 | true | Old signed download links for ticket files. |
| `validate-ticket-submission` | 32 | true | Old resale ticket submission check. |

`stripe-npm-probe` (a one-off test of the Stripe SDK import, created and retired the same day) is not
archived.

Each folder has a `RETIRED.json` with the last version, the gateway JWT setting, the entrypoint and,
per file, whether it was identical to the repository copy at retirement.

## State in production

Each function was replaced by a stub that answers 404 with `verify_jwt = true` (the gateway answers 401
without a JWT), then deleted by hand from the Supabase dashboard.

## Restoring one

Copy the folder back to `supabase/functions/<slug>/` (shared files go to `supabase/functions/_shared/`,
check them against the current versions first), add its `[functions.<slug>]` block to
`supabase/config.toml` if `verify_jwt` was false, and deploy it.
