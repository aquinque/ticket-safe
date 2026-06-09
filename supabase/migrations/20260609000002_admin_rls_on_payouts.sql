-- The /admin/payouts page was showing "Export batch (0)" because RLS on
-- organizer_payouts and seller_payouts only let the owner see their own
-- rows. Admins running the SEPA queue had zero visibility on other
-- people's payouts. Adding admin SELECT + UPDATE on both tables.
--
-- (Applied to production via MCP. This file is the on-disk twin.)

DROP POLICY IF EXISTS org_payouts_admin_select ON public.organizer_payouts;
CREATE POLICY org_payouts_admin_select ON public.organizer_payouts
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS org_payouts_admin_update ON public.organizer_payouts;
CREATE POLICY org_payouts_admin_update ON public.organizer_payouts
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS seller_payouts_admin_select ON public.seller_payouts;
CREATE POLICY seller_payouts_admin_select ON public.seller_payouts
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS seller_payouts_admin_update ON public.seller_payouts;
CREATE POLICY seller_payouts_admin_update ON public.seller_payouts
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));
