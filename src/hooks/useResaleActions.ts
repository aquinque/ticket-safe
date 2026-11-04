import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { getOrCreateConversation } from "@/hooks/useChat";
import { authPathHere } from "@/lib/returnTo";
import type { ResaleListing } from "@/lib/resaleListings";

/** What a buyer can do with a listing: buy it, or open a chat with the seller to make an offer. */
export function useResaleActions() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [offerBusy, setOfferBusy] = useState(false);

  const buy = useCallback(
    (l: ResaleListing) => {
      navigate(`/checkout?listing_id=${l.id}`);
    },
    [navigate],
  );

  const offer = useCallback(
    async (l: ResaleListing) => {
      if (!user) {
        navigate(authPathHere());
        return;
      }
      if (l.isOwn) {
        toast.error("You can't make an offer on your own ticket.");
        return;
      }
      setOfferBusy(true);
      try {
        const conversationId = await getOrCreateConversation(l.id);
        navigate(`/messages/${conversationId}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : "";
        toast.error(
          message.includes("OWN_LISTING")
            ? "You can't make an offer on your own ticket."
            : message.includes("LISTING_NOT_AVAILABLE")
              ? "This ticket is no longer available."
              : "Couldn't start the conversation.",
        );
      } finally {
        setOfferBusy(false);
      }
    },
    [navigate, user],
  );

  return { buy, offer, offerBusy };
}
