import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const STORAGE_KEY = (userId: string) => `lastSeenMessages_${userId}`;

export function useUnreadMessages() {
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const convIdsRef = useRef<string[]>([]);

  const getLastSeen = () => {
    if (!user) return new Date(0).toISOString();
    return localStorage.getItem(STORAGE_KEY(user.id)) ?? new Date(0).toISOString();
  };

  const markAllRead = () => {
    if (!user) return;
    localStorage.setItem(STORAGE_KEY(user.id), new Date().toISOString());
    setUnreadCount(0);
  };

  useEffect(() => {
    if (!user) {
      setUnreadCount(0);
      return;
    }

    let cancelled = false;

    const countUnread = async () => {
      const lastSeen = getLastSeen();

      // Get conversations where this user is participant
      const { data: convs } = await (supabase as any)
        .from("conversations")
        .select("id")
        .or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`);

      if (!convs || convs.length === 0) {
        if (!cancelled) setUnreadCount(0);
        return;
      }

      const convIds = (convs as { id: string }[]).map((c) => c.id);
      convIdsRef.current = convIds;

      const { count } = await (supabase as any)
        .from("messages")
        .select("id", { count: "exact", head: true })
        .in("conversation_id", convIds)
        .neq("sender_id", user.id)
        .gt("created_at", lastSeen);

      if (!cancelled) setUnreadCount(count ?? 0);
    };

    countUnread();

    // Realtime: re-fetch count on any new message in user's conversations
    const channel = supabase
      .channel(`unread-messages-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const msg = payload.new as { sender_id: string; conversation_id: string };
          // Only increment if: not sent by me AND in one of my conversations
          if (
            msg.sender_id !== user.id &&
            convIdsRef.current.includes(msg.conversation_id)
          ) {
            setUnreadCount((prev) => prev + 1);
          }
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  return { unreadCount, markAllRead };
}
