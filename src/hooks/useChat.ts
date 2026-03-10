import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
}

export interface Offer {
  id: string;
  conversation_id: string;
  proposer_id: string;
  price: number;
  status: "pending" | "accepted" | "rejected" | "expired";
  created_at: string;
  responded_at: string | null;
}

export interface Conversation {
  id: string;
  ticket_id: string;
  buyer_id: string;
  seller_id: string;
  last_message_at: string;
  created_at: string;
  ticket: {
    id: string;
    selling_price: number;
    quantity: number;
    event: { id: string; title: string; date: string; image_url: string | null; category: string } | null;
  } | null;
  buyer: { full_name: string } | null;
  seller: { full_name: string } | null;
}

/** Fetch all conversations for the current user */
export function useConversations() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const { data } = await supabase
      .from("conversations")
      .select(
        `id, ticket_id, buyer_id, seller_id, last_message_at, created_at,
         ticket:tickets(id, selling_price, quantity, event:events(id, title, date, image_url, category)),
         buyer:profiles!conversations_buyer_id_fkey(full_name),
         seller:profiles!conversations_seller_id_fkey(full_name)`
      )
      .or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`)
      .order("last_message_at", { ascending: false });

    setConversations((data as unknown as Conversation[]) ?? []);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { conversations, loading, refresh: fetch };
}

/** Get or create a conversation for a specific ticket + buyer */
export async function getOrCreateConversation(
  ticketId: string,
  buyerId: string,
  sellerId: string
): Promise<string> {
  // Check if conversation already exists
  const { data: existing } = await supabase
    .from("conversations")
    .select("id")
    .eq("ticket_id", ticketId)
    .eq("buyer_id", buyerId)
    .maybeSingle();

  if (existing) return existing.id;

  // Create new conversation
  const { data: created, error } = await supabase
    .from("conversations")
    .insert({ ticket_id: ticketId, buyer_id: buyerId, seller_id: sellerId })
    .select("id")
    .single();

  if (error) throw error;
  return created.id;
}

/** Real-time messages + offers for a conversation */
export function useChatRoom(conversationId: string | null) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);

  // Initial fetch
  useEffect(() => {
    if (!conversationId) return;
    setLoading(true);

    Promise.all([
      supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true }),
      supabase
        .from("offers")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true }),
    ]).then(([msgRes, offerRes]) => {
      setMessages((msgRes.data as Message[]) ?? []);
      setOffers((offerRes.data as Offer[]) ?? []);
      setLoading(false);
    });
  }, [conversationId]);

  // Realtime subscriptions
  useEffect(() => {
    if (!conversationId) return;

    const channel = supabase
      .channel(`chat:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const newMsg = payload.new as Message;
          setMessages((prev) => {
            // Replace optimistic message or skip if already present
            const hasOptimistic = prev.some(
              (m) =>
                m.sender_id === newMsg.sender_id &&
                m.content === newMsg.content &&
                m.id !== newMsg.id &&
                Math.abs(new Date(m.created_at).getTime() - new Date(newMsg.created_at).getTime()) < 5000
            );
            if (hasOptimistic) {
              return prev.map((m) =>
                m.sender_id === newMsg.sender_id &&
                m.content === newMsg.content &&
                m.id !== newMsg.id &&
                Math.abs(new Date(m.created_at).getTime() - new Date(newMsg.created_at).getTime()) < 5000
                  ? newMsg
                  : m
              );
            }
            // Skip exact duplicates
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "offers",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setOffers((prev) => [...prev, payload.new as Offer]);
          } else if (payload.eventType === "UPDATE") {
            setOffers((prev) =>
              prev.map((o) => (o.id === (payload.new as Offer).id ? (payload.new as Offer) : o))
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId]);

  // Send a message
  const sendMessage = useCallback(
    async (content: string): Promise<boolean> => {
      if (!user || !conversationId || !content.trim()) return false;

      // Optimistic update — add message immediately
      const optimisticId = crypto.randomUUID();
      const optimisticMsg: Message = {
        id: optimisticId,
        conversation_id: conversationId,
        sender_id: user.id,
        content: content.trim(),
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, optimisticMsg]);

      const { error } = await supabase.from("messages").insert({
        conversation_id: conversationId,
        sender_id: user.id,
        content: content.trim(),
      });

      if (error) {
        console.error("sendMessage error:", error);
        // Remove optimistic message on failure
        setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
        toast.error("Failed to send message");
        return false;
      }

      // Fire-and-forget: notify recipient by email
      supabase.auth.getSession().then(({ data }) => {
        const token = data.session?.access_token;
        if (!token) return;
        fetch(
          `${import.meta.env.VITE_SUPABASE_URL ?? "https://lgmnatfvdzzjzyxlenry.supabase.co"}/functions/v1/notify-new-message`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ conversationId, senderId: user.id }),
          }
        ).catch(() => {});
      });

      return true;
    },
    [user, conversationId]
  );

  // Send a counter-offer
  const sendOffer = useCallback(
    async (price: number): Promise<boolean> => {
      if (!user || !conversationId || price <= 0) return false;
      // Expire any existing pending offers in this conversation
      await supabase
        .from("offers")
        .update({ status: "expired", responded_at: new Date().toISOString() })
        .eq("conversation_id", conversationId)
        .eq("status", "pending");

      const { error: offerErr } = await supabase.from("offers").insert({
        conversation_id: conversationId,
        proposer_id: user.id,
        price,
      });

      if (offerErr) {
        console.error("sendOffer error:", offerErr);
        toast.error("Failed to send offer");
        return false;
      }

      // Also send a system-style message
      await supabase.from("messages").insert({
        conversation_id: conversationId,
        sender_id: user.id,
        content: `Proposed a new price: €${price.toFixed(2)}`,
      });
      return true;
    },
    [user, conversationId]
  );

  // Accept/reject an offer
  const respondToOffer = useCallback(
    async (offerId: string, accept: boolean) => {
      if (!user) return;
      const { error } = await supabase
        .from("offers")
        .update({
          status: accept ? "accepted" : "rejected",
          responded_at: new Date().toISOString(),
        })
        .eq("id", offerId);

      if (error) {
        console.error("respondToOffer error:", error);
        toast.error("Failed to respond to offer");
        return;
      }

      // Send a confirmation message
      const offer = offers.find((o) => o.id === offerId);
      if (offer && conversationId) {
        await supabase.from("messages").insert({
          conversation_id: conversationId,
          sender_id: user.id,
          content: accept
            ? `Accepted the offer of €${offer.price.toFixed(2)}`
            : `Declined the offer of €${offer.price.toFixed(2)}`,
        });
      }
    },
    [user, conversationId, offers]
  );

  const latestPendingOffer = offers.filter((o) => o.status === "pending").slice(-1)[0] ?? null;
  const acceptedOffer = offers.find((o) => o.status === "accepted") ?? null;

  return {
    messages,
    offers,
    loading,
    sendMessage,
    sendOffer,
    respondToOffer,
    latestPendingOffer,
    acceptedOffer,
    userId: user?.id ?? null,
  };
}
