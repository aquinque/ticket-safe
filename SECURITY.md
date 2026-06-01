# Ticket Safe — Security Policy

Last review: 2026-05-26

Ticket Safe handles two categories of data that demand a high bar:
- **Personal data** of verified students (name, university email, profile, messages).
- **Payment-adjacent data** that flows through Stripe (we never store cards ourselves).

This document is the single source of truth for what we do to protect them. The layout follows the OWASP ASVS structure (V2 Auth, V3 Sessions, V4 Access Control, V5 Validation, V7 Crypto, V8 Data Protection, V9 Network, V10 Configuration, V11 Logging) so a reviewer can audit category by category.

---

## V2. Authentication

| Control | Implementation |
|---|---|
| Password policy | 12+ chars, must include upper / lower / number / special. Enforced both client-side ([Auth.tsx](src/pages/Auth.tsx)) and via the password schema in [ResetPassword.tsx](src/pages/ResetPassword.tsx). |
| Brute-force protection | DB-backed account lockout after a small number of failed logins: `check_account_lockout` + `increment_failed_login` RPCs are called on every sign-in attempt. Cooldown ≈ 15 minutes. |
| University email gate | Sign-up rejects any address that is not on the verified-domain list (`verified_university_domains` table). Currently `@edu.escp.eu` only. |
| Auth email delivery | All Supabase auth emails (signup confirm, password reset, magic link, email change, invite, reauthentication) are routed through our **Send Email Hook** ([supabase/functions/send-auth-email](supabase/functions/send-auth-email/index.ts)) and signed via Standard Webhooks. Branded HTML, links built against `SUPABASE_URL/auth/v1/verify` and forwarded to `/auth/confirm` for verifyOtp — works cross-browser/cross-device. |
| Password reset link safety | Reset emails do not include the password; the link is single-use and expires in 1 hour. After exchange via `verifyOtp` the session is "recovery" scoped and only allows `auth.updateUser({password})`. |
| Re-authentication | Sensitive actions can be gated behind Supabase's `reauthentication` flow which uses the same Send Email Hook. |

## V3. Session Management

| Control | Implementation |
|---|---|
| Session storage | `sessionStorage` for tab-scoped secrets (encryption key for `secureStore`), `localStorage` for Supabase session (refreshable JWT). Both are wiped on logout. |
| Encryption at rest (client) | Anything written via `secureStore()` in [src/lib/security.ts](src/lib/security.ts) is AES-GCM-encrypted with a 256-bit key generated per session and held in `sessionStorage`. Closing the tab makes prior writes unrecoverable. |
| PKCE for OAuth | Supabase client is configured with `flowType: 'pkce'` ([src/integrations/supabase/client.ts](src/integrations/supabase/client.ts)). |
| Open-redirect protection | `?next=` parameters on `/auth` and `/auth/confirm` are validated to start with `/` and not `//`. |
| Clickjacking | `X-Frame-Options: DENY` and `frame-ancestors 'none'` in CSP ([public/_headers](public/_headers)). |

## V4. Access Control

| Control | Implementation |
|---|---|
| Row Level Security | RLS enabled on every public table that holds user data: `profiles`, `tickets`, `transactions`, `event_orders`, `event_tickets`, `event_tiers`, `organizer_profiles`, `messages`, `conversations`, `offers`, `audit_log`, `rate_limits`, `stripe_accounts`, `stripe_webhook_events`. |
| Admin role | Roles live in `user_roles` (enum `app_role`). Admin grant is required for `/admin/*` pages and for write access to `organizer_profiles.status`. |
| Append-only audit log | `audit_log` has no UPDATE/DELETE policies and INSERT is revoked from `authenticated` and `anon`; only the service role can write (via the `audit_record` SECURITY DEFINER RPC). |
| Studio-specific gates | `studio-create-checkout` validates that the event status = `published`, the organizer status = `approved`, the tier is `is_active`, and `stripe_accounts.charges_enabled = true` before creating a Checkout Session. |

## V5. Input Validation, Output Encoding

| Control | Implementation |
|---|---|
| Client-side sanitization | All free-text inputs flow through `sanitizeInput()` ([src/lib/security.ts](src/lib/security.ts)) — DOMPurify with no allowed tags, whitespace normalization, zero-width / bidi-override stripping, length cap. |
| Server-side validation | Every edge function re-validates inputs (UUID regex, price bounds, quantity bounds, currency whitelist). The browser is treated as adversarial. |
| Output encoding | All user-visible strings rendered through React (auto-escapes); emails escape values via `escapeHtml()` before string-interpolating into HTML. |
| Image uploads | Limited to 5 MB at the client; Supabase Storage bucket `organizer-assets` has size + mime-type policies and per-user write paths (`{userId}/...`). |

## V7. Cryptography

| Control | Implementation |
|---|---|
| Card data | **Never touches our servers.** Stripe Checkout (hosted) collects card numbers; we receive a tokenized PaymentIntent ID and Checkout Session ID. PCI-DSS responsibility stays with Stripe. |
| QR ticket tokens | `event_tickets.qr_token` = 56-character cryptographic random string generated server-side in the webhook; secure-ticket flow uses HMAC-signed tokens via `TICKET_SIGNING_SECRET`. |
| Webhook signature verification | Stripe webhook verified with `stripe.webhooks.constructEventAsync` using Web Crypto API (no Node crypto). Send Email Hook from Supabase Auth verified via the Standard Webhooks library. |
| Random tokens | `crypto.getRandomValues` / `crypto.randomUUID` everywhere. Math.random() is not used for security. |
| Transport | HSTS with 2-year `max-age`, `includeSubDomains`, `preload`. `upgrade-insecure-requests` in CSP. |

## V8. Data Protection

| Control | Implementation |
|---|---|
| Storage at rest | Supabase encrypts the underlying Postgres data at rest (AES-256 via cloud provider). Backups inherit the same protection. |
| Stripe Connect destination charges | Funds settle directly on the organizer's Connect account; the platform takes a 5% `application_fee_amount`. We never hold buyer funds beyond the payment intent. |
| GDPR data deletion | `privacy-request` edge function handles right-to-erasure requests by anonymizing user records and revoking the Supabase auth row. |
| Minimal logs | The `redactForLog()` helper in [supabase/functions/_shared/security.ts](supabase/functions/_shared/security.ts) masks emails, IBANs, API keys and tokens before any `console.log`. Edge function logs are retained for 24h. |
| Data minimization | The schema only collects what's strictly needed: name, university email, university, campus. No address, no phone, no DOB. Banking data lives in Stripe. |

## V9. Communications

| Control | Implementation |
|---|---|
| CSP | `default-src 'self'`. Script-src allows self + `js.stripe.com` only — no `unsafe-eval`, no external CDNs. Style-src allows self + Google Fonts only. Frame-src restricted to Stripe Checkout/JS. Connect-src restricted to Supabase + Stripe. Auth pages get an even stricter override (no third-party script). See [public/_headers](public/_headers). |
| HSTS | `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`. |
| MIME sniffing | `X-Content-Type-Options: nosniff`. |
| Referrer policy | `strict-origin-when-cross-origin`. |
| Permissions policy | Camera, microphone disabled by default. Geolocation + payment limited to `self`. |
| CORS | Allow-list on every edge function. `Access-Control-Allow-Origin` is `*` only for endpoints meant for public callers; sensitive endpoints additionally check origin. |

## V10. Configuration

| Control | Implementation |
|---|---|
| Secrets in env only | No hardcoded keys in the bundle (verified by grep + bundle audit). `VITE_*` env vars are explicitly the *public* ones. |
| Removed dependencies | Revolut SDK was deleted entirely; the `VITE_REVOLUT_API_KEY` env var no longer ships in any bundle. |
| Edge function secrets | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `SEND_EMAIL_HOOK_SECRET`, `RESEND_API_KEY`, `TICKET_SIGNING_SECRET` live in Supabase Edge Function secrets, server-side only. |
| Dependency hygiene | `npm audit` runs in CI; high-severity findings block merges (Dependabot enabled on the GitHub repo). |
| Configuration headers | Sensitive pages (`/auth/*`) get `Cache-Control: no-store, no-cache, must-revalidate, private` and a tighter CSP. |

## V11. Logging & Monitoring

| Control | Implementation |
|---|---|
| Audit log | `public.audit_log` (append-only, admin-readable only). Recorded actions include: failed logins, password resets, organizer approval/rejection, event publish/unpublish, Studio checkout creation, Stripe webhook receipt, admin overrides. The schema is in [migrations/20260526000001_audit_log_and_rate_limits.sql](supabase/migrations/20260526000001_audit_log_and_rate_limits.sql). |
| Server-side rate limits | `rate_limits` table + `rate_limit_consume` RPC. Edge functions call the `rateLimit()` helper before sensitive operations (auth, checkout, application submission). 100% open-fail: a DB outage does not lock users out. |
| Stripe idempotency | `stripe_webhook_events` uniqueness guard on `event_id` prevents double-processing on retries. |
| Realtime monitoring | Edge function logs surfaced via Supabase Dashboard → Logs. Stripe webhook deliveries visible at https://dashboard.stripe.com → Developers → Webhooks. |

---

## Threat Model — what we explicitly defend against

| Threat | Defense |
|---|---|
| Credential stuffing / brute force on login | Account lockout (DB), server-side rate limit on auth endpoint, password complexity rule |
| Cross-site scripting (XSS) | DOMPurify on input, React auto-escape on output, strict CSP (no `unsafe-eval`, allow-listed script sources), `X-XSS-Protection: 1; mode=block` |
| Cross-site request forgery (CSRF) | Supabase JWT in Authorization header (not a cookie), CSRF token helper in `src/lib/security.ts` for any future cookie-based flows, `form-action 'self'` in CSP |
| SQL injection | Supabase client parameterizes all queries; no raw SQL on user input; `isSqlSafe` defense-in-depth helper available |
| Clickjacking | `X-Frame-Options: DENY` + `frame-ancestors 'none'` |
| Open redirect | `next=` allowlist (relative paths only); auth confirm validates `next` before navigating |
| Payment fraud (double-spend) | Atomic `reserve_tier` RPC before checkout session creation; `stripe_webhook_events` idempotency on `event_id`; tier inventory only flips `reserved → sold` on `payment_status = paid` |
| MITM / downgrade | HSTS preload, `upgrade-insecure-requests` in CSP, Supabase + Stripe both pinned to HTTPS |
| Session hijacking | Short-lived JWT + refresh tokens, tab-scoped encryption key for `secureStore`, sign-out clears local + session storage |
| Webhook spoofing | Stripe signature verification on every webhook; Send Email Hook verifies Standard Webhooks signature |

## Out of scope (handled by upstream providers)

- PCI-DSS Level 1 of card networks — handled by Stripe.
- Email deliverability + DMARC/DKIM — handled by Resend on the `ticket-safe.eu` domain.
- Cloud infrastructure security (Postgres, Storage) — handled by Supabase.
- DDoS mitigation at the edge — handled by Cloudflare (Supabase CDN).

---

## Responsible Disclosure

We welcome reports of security issues. Please email **ticketsafe.friendly@gmail.com** with:

- a clear, technical description of the issue,
- steps to reproduce,
- the impact you believe it has,
- your contact details.

We commit to acknowledging your report within 48 hours and to fixing severe issues in production within 7 days. We never pursue good-faith security researchers who follow this policy and avoid:
- accessing data that isn't yours,
- degrading the service,
- exfiltrating any data beyond what's strictly necessary to demonstrate the issue.

---

## Operational checklist (run before every release)

- [ ] `npm audit` — no high/critical vulnerabilities open
- [ ] `npx tsc --noEmit` passes
- [ ] No `VITE_*` env vars with secrets (only public keys)
- [ ] CSP header still tight (no new `unsafe-eval`, no new external CDN)
- [ ] All new edge functions go through `requireUser()` if they touch user data
- [ ] All new edge functions call `rateLimit()` if they cost money or send email
- [ ] All new edge functions call `audit()` for any state-changing privileged action
- [ ] All new tables enable RLS with policies for `authenticated` + `service_role` only
- [ ] Stripe webhook + Send Email Hook secrets still match Dashboard values
