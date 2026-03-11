import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { MessageSquare, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useConversations } from "@/hooks/useChat";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";
import { getEventImage } from "@/lib/eventImages";

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

const ChatBubble = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  // Only fetch conversations when the bubble is open (lazy loading)
  const { conversations, loading, refresh } = useConversations(open);
  const { unreadCount, markAllRead } = useUnreadMessages();

  // Close panel on route change
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  // Don't show bubble if not logged in or already on messages/chat pages
  if (!user) return null;
  if (location.pathname.startsWith("/messages")) return null;

  return (
    <>
      {/* Floating bubble button */}
      <button
        onClick={() => {
          setOpen((v) => {
            if (!v) {
              refresh();
              markAllRead();
            }
            return !v;
          });
        }}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-200 flex items-center justify-center"
        aria-label="Messages"
      >
        {open ? (
          <X className="w-6 h-6" />
        ) : (
          <MessageSquare className="w-6 h-6" />
        )}
        {!open && unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-bold text-white leading-none ring-2 ring-background">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Popup panel */}
      {open && (
        <div className="fixed bottom-24 right-6 z-50 w-80 max-h-[420px] bg-background border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 fade-in duration-200">
          {/* Header */}
          <div className="px-4 py-3 border-b border-border flex items-center justify-between bg-muted/30">
            <h3 className="font-semibold text-sm">Messages</h3>
            <button
              onClick={() => {
                setOpen(false);
                navigate("/messages");
              }}
              className="text-xs text-primary hover:underline"
            >
              See all
            </button>
          </div>

          {/* Conversation list */}
          <div className="flex-1 overflow-y-auto">
            {loading && (
              <div className="flex justify-center py-8">
                <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            )}

            {!loading && conversations.length === 0 && (
              <div className="text-center py-8 px-4">
                <MessageSquare className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  No conversations yet
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Make an offer on a ticket to start chatting
                </p>
              </div>
            )}

            {conversations.map((conv) => {
              const isBuyer = conv.buyer_id === user?.id;
              const otherName = isBuyer
                ? conv.seller?.full_name ?? "Seller"
                : conv.buyer?.full_name ?? "Buyer";
              const event = conv.ticket?.event;
              const timeAgo = formatTimeAgo(conv.last_message_at);

              return (
                <button
                  key={conv.id}
                  onClick={() => {
                    setOpen(false);
                    navigate(`/messages/${conv.id}`);
                  }}
                  className="w-full px-4 py-3 flex items-center gap-3 hover:bg-muted/50 transition-colors text-left border-b border-border/50 last:border-0"
                >
                  {/* Event image */}
                  <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0">
                    <img
                      src={getEventImage(event?.image_url ?? null, event?.category ?? "Other")}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium truncate">{otherName}</p>
                      <span className="text-[10px] text-muted-foreground shrink-0">{timeAgo}</span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {event?.title ?? "Ticket"}
                      {conv.ticket?.selling_price
                        ? ` — €${conv.ticket.selling_price.toFixed(2)}`
                        : ""}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
};

export default ChatBubble;
