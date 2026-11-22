-- Studio buyer service fee in euros: 4 % + €0.60 per ticket (at least €0.70); pounds unchanged (4 % + £0.70, at
-- least £0.60); no maximum; nothing on a free ticket; a negotiated override wins.
--
-- The €0.60 fixed part was set on production directly (it replaced the €0.80 of 20261101120000) and is the
-- intended price. This file is the on-disk twin of the live function, read on 2026-11-22; the site's wording
-- (src/lib/studioFee.ts) follows it.

CREATE OR REPLACE FUNCTION public.get_studio_commission_cents(p_price_cents integer, p_override_cents integer DEFAULT NULL::integer, p_currency text DEFAULT 'EUR'::text)
 RETURNS integer
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN p_price_cents IS NULL OR p_price_cents <= 0 THEN 0
    WHEN p_override_cents IS NOT NULL THEN GREATEST(0, p_override_cents)
    WHEN upper(coalesce(p_currency, 'EUR')) = 'GBP'
      THEN GREATEST(60, 70 + ROUND(p_price_cents * 0.04)::integer)
    ELSE GREATEST(70, 60 + ROUND(p_price_cents * 0.04)::integer)
  END;
$function$;
