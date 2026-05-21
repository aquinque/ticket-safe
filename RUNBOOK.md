# TicketSafe — Incident Runbook

Short, actionable steps for when something is on fire. Keep this open in a tab on event nights.

---

## Contacts & dashboards

| What | Where |
|------|-------|
| Supabase project | https://supabase.com/dashboard/project/lgmnatfvdzzjzyxlenry |
| Stripe dashboard | https://dashboard.stripe.com |
| Production site | https://ticket-safe.eu |
| GitHub repo | https://github.com/aquinque/ticket-safe |
| Resend (transactional email) | https://resend.com/emails |

---

## 1. "The site is down"

**Check in this order:**

1. **Is it just you?** Try in a private window + a phone on cellular. If it works there, your browser/cache.
2. **Vercel/host status?** Check the deploy dashboard for failed builds. Most "outages" are a bad deploy.
3. **Supabase project status?** Dashboard → top right shows a green/red dot. If red, https://status.supabase.com
4. **Stripe status?** https://status.stripe.com — if Stripe is down, payments fail but the rest of the site works.

**If a bad deploy is the cause:** Vercel → Deployments → previous green deploy → "Promote to Production". <2 min rollback.

---

## 2. "Students are saying they can't buy tickets"

1. Open Stripe dashboard → Payments → filter last 1h. Are PaymentIntents being created?
   - **No** → the `stripe-create-checkout` edge function is broken. Check Supabase → Edge Functions → Logs.
   - **Yes, but `requires_payment_method`** → cards being declined. Probably user error, not yours.
   - **Yes, `succeeded` but listing still says available** → the webhook is broken. See #3.

2. Check the `transactions` table for `status='pending'` older than 30 min. Those are orphaned reservations.

---

## 3. "Tickets sold via Stripe but the site still shows them as available"

This means the **webhook isn't firing or isn't processing**.

1. Stripe dashboard → Developers → Webhooks → click your endpoint → "Recent deliveries".
   - Red 5xx? Edge function is throwing. Logs in Supabase.
   - Red 4xx? Signature verification is failing. Check `STRIPE_WEBHOOK_SECRET` env var.
   - All green but DB not updated? Stuck retries — click "Resend" on the affected event.

2. To manually fix a stuck transaction:
   ```sql
   -- Mark a transaction completed (replace IDs)
   UPDATE transactions SET status = 'completed' WHERE id = '<tx_id>';
   UPDATE tickets SET status = 'sold', buyer_id = '<buyer_id>' WHERE id = '<listing_id>';
   ```
   Run via Supabase SQL editor.

---

## 4. "A student needs a refund"

Until we build the admin refund button:

1. Stripe → Payments → find the PaymentIntent → "Refund payment".
2. The `charge.refunded` webhook fires automatically, sets transaction → `refunded` and listing back to `available`.
3. If the webhook didn't fire, run manually:
   ```sql
   UPDATE transactions SET status = 'refunded' WHERE id = '<tx_id>';
   UPDATE tickets SET status = 'available' WHERE id = '<listing_id>';
   ```

---

## 5. "Event was cancelled — refund 200 buyers"

Right now this is manual. Steps:

1. SQL to list every buyer for an event:
   ```sql
   SELECT t.id as tx_id, t.amount, p.email, t.payment_intent_id
   FROM transactions t
   JOIN tickets ti ON ti.id = t.ticket_id
   JOIN profiles p ON p.id = t.buyer_id
   WHERE ti.event_id = '<event_id>' AND t.status = 'completed';
   ```
2. For each row, Stripe → search by PaymentIntent ID → Refund.
3. Send a notice email to all buyers (use Resend bulk).

**TODO:** Build this as a single "Cancel event" admin button. Month 3.

---

## 6. "The chat is broken / messages aren't sending"

1. Check Supabase → Realtime → is it green?
2. Check the `messages` table — are recent rows being inserted?
3. Check the `conversations` RLS — common cause: a policy change blocking inserts.
4. Email notifications run through the `notify-new-message` edge function — check its logs and `RESEND_API_KEY`.

---

## 6b. "Password-reset / signup confirmation emails point to localhost"

All Supabase auth emails are sent by the **`send-auth-email`** edge function
(Auth → Send Email Hook). Built-in Supabase auth templates are no longer used.

**One-time setup (Supabase Dashboard):**

1. **Authentication → URL Configuration**
   - Site URL: `https://ticket-safe.eu`
   - Redirect URLs: add `https://ticket-safe.eu/**` (also `http://localhost:5173/**` for dev)
2. **Authentication → Hooks → Send Email hook → Enable**
   - URL: `https://lgmnatfvdzzjzyxlenry.supabase.co/functions/v1/send-auth-email`
   - Copy the generated signing secret (starts with `v1,whsec_...`)
3. **Edge Functions → Secrets** — set:
   - `SEND_EMAIL_HOOK_SECRET` = the secret from step 2
   - `RESEND_API_KEY` = your Resend key (already set if message emails work)
   - `SITE_URL` = `https://ticket-safe.eu`
4. **Deploy the function:**
   ```sh
   supabase functions deploy send-auth-email
   ```
5. Trigger a password reset to a real inbox to confirm the branded email arrives.

**If emails still don't arrive:**
- Edge Function logs → `send-auth-email` for signature / Resend errors.
- Resend dashboard → Logs → check the destination and bounce status.
- Resend domain `ticket-safe.eu` must be verified (DKIM/SPF/DMARC green).

---

## 7. Common SQL snippets

```sql
-- Today's revenue
SELECT SUM(amount) FROM transactions
WHERE status = 'completed' AND created_at >= CURRENT_DATE;

-- Top sellers this week
SELECT seller_id, count(*) AS sales, sum(selling_price) AS revenue
FROM tickets WHERE status = 'sold' AND created_at >= now() - interval '7 days'
GROUP BY seller_id ORDER BY revenue DESC LIMIT 10;

-- Failed Stripe webhook events (after idempotency table is live)
SELECT event_type, count(*) FROM stripe_webhook_events
WHERE processed_at >= now() - interval '24 hours'
GROUP BY event_type;
```

---

## 8. Before every EBS drop

- [ ] Stripe dashboard open
- [ ] Supabase logs tab open
- [ ] This runbook open
- [ ] Phone available (in case Vercel deploy is needed)
- [ ] Test purchase with a real card 1h before doors open
- [ ] Sanity-check `ticket_tiers.sold_qty < total_qty` for the event
