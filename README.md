# Ticket Safe

Secure student-ticket marketplace — buy, sell, and resell event tickets with verified QR codes, nominative tickets, and door scanning. Payments and seller/organizer payouts are handled server-side via Stripe.

**Stack:** Vite + React 18 + TypeScript + TailwindCSS + shadcn/ui · Supabase (PostgreSQL + Auth + Edge Functions) · Stripe.

---

## Local development

Requires Node.js 20+ and npm.

```sh
npm install
cp .env.example .env   # then fill in the VITE_ values (see below)
npm run dev            # http://localhost:5173
```

Other scripts:

```sh
npm run build          # production build → dist/
npm run preview        # serve the production build locally
npm run lint           # eslint
npm test               # vitest (run once)
```

---

## Environment variables

### Frontend (`.env` — bundled into the browser, must be public-safe)

| Variable | Required | Notes |
|---|---|---|
| `VITE_SUPABASE_URL` | ✅ | `https://<project-ref>.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | ✅ | Supabase anon key (safe to expose) |
| `VITE_SITE_URL` | ✅ (prod) | Canonical URL for auth redirect links, e.g. `https://ticket-safe.eu` |
| `VITE_SENTRY_DSN` | optional | Enables Sentry error reporting; blank = console fallback |

See [.env.example](.env.example) for the full template.

### Backend (Supabase Edge Function secrets — server-side only)

These are **NOT** in `.env`. Set them in the Supabase Dashboard → Project Settings → Edge Functions → Secrets (or `supabase secrets set KEY=value`). **The site is not operational until these are set** — without them, payments and emails fail silently.

| Secret | Used by | If missing |
|---|---|---|
| `STRIPE_SECRET_KEY` | all `stripe-*`, `cancel-event` | No payments / refunds |
| `STRIPE_WEBHOOK_SECRET` | `stripe-webhook` | Webhooks 400 → orders never finalize (listing stuck `reserved`) |
| `RESEND_API_KEY` | auth + order + cancellation emails | No emails sent (signup, password reset, receipts) |
| `TICKET_SIGNING_SECRET` | `generate-secure-ticket`, `stripe-webhook` | Secure QR signing disabled (insecure fallback) — `openssl rand -base64 32` |
| `SEND_EMAIL_HOOK_SECRET` | `send-auth-email` | Auth emails (signup, reset) silently fail |
| `SITE_URL` | redirect targets | Wrong post-checkout/onboarding URLs |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | all functions | Auto-injected by Supabase |

After setting `SEND_EMAIL_HOOK_SECRET`, also configure **Supabase Dashboard → Authentication → Hooks → Send Email Hook** to point at the `send-auth-email` function (see [RUNBOOK.md](RUNBOOK.md)).

---

## Deployment

### Frontend → GitHub Pages (automatic)

Pushing to `main` triggers [.github/workflows/deploy.yml](.github/workflows/deploy.yml), which builds the SPA and publishes it to GitHub Pages.

Optional repository secrets (Settings → Secrets and variables → Actions) override the baked-in defaults: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`.

### Edge Functions → Supabase (automatic, once configured)

The same workflow has a `deploy-functions` job that runs `supabase functions deploy` on every push to `main`. It **skips cleanly** until you add this repository secret:

- `SUPABASE_ACCESS_TOKEN` — create at https://supabase.com/dashboard/account/tokens
- `SUPABASE_PROJECT_REF` — optional; defaults to the project ref in the workflow

To deploy functions manually instead:

```sh
supabase functions deploy --project-ref <project-ref>
```

Per-function settings (e.g. `verify_jwt = false` for the public `stripe-webhook`) live in [supabase/config.toml](supabase/config.toml).

---

## Pre-launch checklist

- [ ] All Edge Function secrets set (table above)
- [ ] Send Email Hook configured in Supabase Auth → Hooks
- [ ] Stripe webhook endpoint added in Stripe Dashboard, deliveries green
- [ ] `SUPABASE_ACCESS_TOKEN` set in GitHub Actions (for auto function deploy)
- [ ] `VITE_SITE_URL` points at the production domain
- [ ] End-to-end smoke test: signup → login → password reset → buy → receive email → scan at door
- [ ] `npx tsc --noEmit` and `npm test` pass

See [RUNBOOK.md](RUNBOOK.md) for operational procedures and [SECURITY.md](SECURITY.md) for the security checklist.
