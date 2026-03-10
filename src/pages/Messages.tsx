import { useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { BackButton } from "@/components/BackButton";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, Calendar, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useConversations } from "@/hooks/useChat";
import { SEOHead } from "@/components/SEOHead";
import { getEventImage } from "@/lib/eventImages";
import { useEffect } from "react";

const Messages = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { conversations, loading } = useConversations();

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
  }, [user, authLoading, navigate]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SEOHead titleKey="common.appName" descriptionKey="common.appName" />
      <Header />
      <main className="flex-1 py-8">
        <div className="container mx-auto px-4 max-w-3xl">
          <div className="mb-6">
            <BackButton />
          </div>

          <h1 className="text-3xl font-bold mb-6">Messages</h1>

          {(loading || authLoading) && (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          )}

          {!loading && conversations.length === 0 && (
            <div className="text-center py-12">
              <MessageSquare className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-1">No conversations yet</h3>
              <p className="text-sm text-muted-foreground">
                Make an offer on a ticket to start a conversation with the seller.
              </p>
            </div>
          )}

          <div className="space-y-3">
            {conversations.map((conv) => {
              const isBuyer = conv.buyer_id === user?.id;
              const otherName = isBuyer
                ? conv.seller?.full_name ?? "Seller"
                : conv.buyer?.full_name ?? "Buyer";
              const event = conv.ticket?.event;
              const timeAgo = formatTimeAgo(conv.last_message_at);

              return (
                <Card
                  key={conv.id}
                  className="cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => navigate(`/messages/${conv.id}`)}
                >
                  <CardContent className="p-4 flex gap-4 items-center">
                    {/* Event image */}
                    <div className="w-14 h-14 rounded-lg overflow-hidden flex-shrink-0">
                      <img
                        src={getEventImage(event?.image_url ?? null, event?.category ?? "Other")}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="font-semibold truncate">{otherName}</p>
                        <Badge variant="secondary" className="text-xs shrink-0">
                          {isBuyer ? "Buying" : "Selling"}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground truncate">
                        {event?.title ?? "Ticket"}
                        {conv.ticket?.selling_price
                          ? ` — €${conv.ticket.selling_price.toFixed(2)}`
                          : ""}
                      </p>
                    </div>

                    {/* Time */}
                    <div className="text-xs text-muted-foreground shrink-0 flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {timeAgo}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

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

export default Messages;
