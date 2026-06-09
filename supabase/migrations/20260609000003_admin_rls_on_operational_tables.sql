-- Admin SELECT on operational tables for AdminDebug + future audit.
-- Without these the admin dashboard health snapshot is blind to webhook
-- deliveries, stuck transactions, and orders the admin doesn't own.
--
-- (Applied to production via MCP. This file is the on-disk twin.)

DROP POLICY IF EXISTS stripe_webhook_events_admin_select ON public.stripe_webhook_events;
CREATE POLICY stripe_webhook_events_admin_select ON public.stripe_webhook_events
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS event_orders_admin_select ON public.event_orders;
CREATE POLICY event_orders_admin_select ON public.event_orders
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS event_tickets_admin_select ON public.event_tickets;
CREATE POLICY event_tickets_admin_select ON public.event_tickets
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS transactions_admin_select ON public.transactions;
CREATE POLICY transactions_admin_select ON public.transactions
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));
