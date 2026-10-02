import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * "Tickets sold safely" trust counter — shown on both Home and Footer
 * (rendered on nearly every page). Shared + cached via react-query so the
 * two consumers issue one network request instead of two identical ones
 * on every page load.
 */
export function useTicketsSoldCount(): number | null {
  const { data } = useQuery({
    queryKey: ["tickets-sold-count"],
    queryFn: async () => {
      const { count } = await supabase
        .from("transactions")
        .select("id", { count: "exact", head: true })
        .eq("status", "completed");
      return count ?? 0;
    },
    staleTime: 5 * 60_000,
  });
  return data && data >= 10 ? data : null;
}
