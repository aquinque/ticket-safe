-- Schedule stripe-connect-payout-cron with pg_cron + pg_net.
--
-- Until now nothing invoked the function, so organizer payouts were never
-- sent: the function schedules a payout job (event end + billing_settings.
-- stripe_payout_delay_days) and pays the jobs whose time has come, but only
-- when something calls it. Hourly is plenty: a job becomes due at most one
-- hour late.
--
-- The function accepts the call without a JWT (verify_jwt = false) and, if
-- the Edge secret STRIPE_PAYOUT_CRON_SECRET is set, requires the same value
-- in the x-cron-secret header. Store that value in Vault under
-- 'stripe_payout_cron_secret' so it never sits in cron.job in clear:
--   select vault.create_secret('<value>', 'stripe_payout_cron_secret');
-- When no Vault secret exists the header is sent empty, which the function
-- accepts as long as its own secret is unset.

create extension if not exists pg_net with schema extensions;

select cron.unschedule(jobid)
from cron.job
where jobname = 'stripe-connect-payout-cron-hourly';

select cron.schedule(
  'stripe-connect-payout-cron-hourly',
  '15 * * * *',
  $$
  select net.http_post(
    url := 'https://lgmnatfvdzzjzyxlenry.supabase.co/functions/v1/stripe-connect-payout-cron',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', coalesce(
        (select decrypted_secret from vault.decrypted_secrets where name = 'stripe_payout_cron_secret' limit 1),
        ''
      )
    ),
    body := '{"source":"pg_cron"}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
