import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const STORAGE_KEY = (userId: string) => `lastSeenMessages_${userId}`;

export function useUnreadMessages() {
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  const getLastSeen = () => {
    if (!user) return new Date(0).toISOString();
    return localStorage.getItem(STORAGE_KEY(user.id)) ?? new Date(0).toISOString();
  };

  const markAllRead = () => {
    if (!user) return;
    const now = new Date().toISOString();
    localStorage.setItem(STORAGE_KEY(user.id), now);
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
      const { data: convs } = await supabase
        .from("conversations")
        .select("id")
        .or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`);

      if (!convs || convs.length === 0) {
        if (!cancelled) setUnreadCount(0);
        return;
      }

      const convIds = convs.map((c) => c.id);

      // Count messages in those conversations not sent by this user, after lastSeen
      const { count } = await supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .in("conversation_id", convIds)
        .neq("sender_id", user.id)
        .gt("created_at", lastSeen);

      if (!cancelled) setUnreadCount(count ?? 0);
    };

    countUnread();

    // Realtime subscription for new messages
    const channel = supabase
      .channel(`unread-messages-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          // Only count if sender is not the current user
          if (payload.new.sender_id !== user.id) {
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
