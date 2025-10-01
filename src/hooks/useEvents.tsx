import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Event } from "@/integrations/supabase/types/events";

export const useEvents = () => {
  return useQuery({
    queryKey: ["events"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("*")
        .eq("is_active", true)
        .gte("date", new Date().toISOString())
        .order("date", { ascending: true });

      if (error) throw error;
      return data as Event[];
    },
  });
};
