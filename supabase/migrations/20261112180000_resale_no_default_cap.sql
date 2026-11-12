-- Resale: no default price cap (2026-11-12).
--
-- Decision of Ticket Safe: a resold ticket has no maximum price by default.
-- billing_settings.resale_default_markup_bps is now nullable; NULL means no
-- default cap. An organizer can still set a maximum per event or per ticket
-- type (events / event_tiers.resale_max_price_cents), which still applies.
-- Setting the column back to a number (0 = face value, 2000 = +20 %) brings a
-- default cap back without a code change.

ALTER TABLE public.billing_settings ALTER COLUMN resale_default_markup_bps DROP NOT NULL;
ALTER TABLE public.billing_settings ALTER COLUMN resale_default_markup_bps DROP DEFAULT;
UPDATE public.billing_settings SET resale_default_markup_bps = NULL;

CREATE OR REPLACE FUNCTION public.resale_price_cap(p_event_id uuid, p_tier_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(cap_cents integer, source text, face_value_cents integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH tier AS (
    SELECT t.resale_max_price_cents, t.price_cents, lower(t.currency) AS currency
    FROM public.event_tiers t
    WHERE p_tier_id IS NOT NULL AND t.id = p_tier_id AND t.event_id = p_event_id
  ),
  ev AS (
    SELECT e.resale_max_price_cents FROM public.events e WHERE e.id = p_event_id
  ),
  markup AS (
    SELECT (SELECT b.resale_default_markup_bps FROM public.billing_settings b LIMIT 1) AS bps
  ),
  face AS (
    SELECT CASE WHEN tier.currency = 'eur' AND tier.price_cents > 0 THEN tier.price_cents END AS cents FROM tier
  )
  SELECT
    COALESCE(
      (SELECT resale_max_price_cents FROM tier),
      (SELECT resale_max_price_cents FROM ev),
      (SELECT ROUND(face.cents * (10000 + markup.bps) / 10000.0)::integer FROM face, markup WHERE face.cents IS NOT NULL AND markup.bps IS NOT NULL)
    ) AS cap_cents,
    CASE
      WHEN (SELECT resale_max_price_cents FROM tier) IS NOT NULL THEN 'organizer_tier'
      WHEN (SELECT resale_max_price_cents FROM ev) IS NOT NULL THEN 'organizer_event'
      WHEN (SELECT cents FROM face) IS NOT NULL AND (SELECT bps FROM markup) IS NOT NULL THEN 'face_value_markup'
      ELSE 'none'
    END AS source,
    (SELECT cents FROM face) AS face_value_cents;
$function$;
