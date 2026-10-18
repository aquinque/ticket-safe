import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Service fee per ticket, read from the database function that every checkout
 * uses (get_studio_commission_cents: 4 % + 0,80 €, min 0,70 €, max 3,50 €, or
 * the event's negotiated fee). The site never computes a fee itself; these
 * hooks only show what the server will charge. null while loading.
 */

/** Fee for one ticket of an existing tier (negotiated fee included). */
export function useTierServiceFee(tierId: string | null): number | null {
  const { data } = useQuery({
    queryKey: ["tier-service-fee", tierId],
    enabled: !!tierId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_studio_commission_for_tier", { p_tier_id: tierId! });
      if (error) throw error;
      return typeof data === "number" ? data : null;
    },
    staleTime: 60_000,
  });
  return data ?? null;
}

/** Fee for one ticket at a price being typed (Studio), before the tier exists. */
export function useServiceFeeForPrice(priceCents: number | null): number | null {
  const valid = priceCents !== null && Number.isFinite(priceCents) && priceCents >= 0;
  const { data } = useQuery({
    queryKey: ["service-fee-for-price", priceCents],
    enabled: valid,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_studio_commission_cents", { p_price_cents: priceCents! });
      if (error) throw error;
      return typeof data === "number" ? data : null;
    },
    staleTime: 10 * 60_000,
    placeholderData: (previous) => previous,
  });
  return data ?? null;
}
