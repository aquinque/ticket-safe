import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { BackButton } from "@/components/BackButton";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Send,
  Loader2,
  DollarSign,
  Check,
  X,
  ShoppingCart,
  MessageSquare,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useChatRoom } from "@/hooks/useChat";
import { supabase } from "@/integrations/supabase/client";
import { SEOHead } from "@/components/SEOHead";
import { getEventImage } from "@/lib/eventImages";
import { toast } from "sonner";

interface ConversationMeta {
  id: string;
  buyer_id: string;
  seller_id: string;
  ticket: {
    id: string;
    selling_price: number;
    quantity: number;
    event: { id: string; title: string; date: string; image_url: string | null; category: string } | null;
  } | null;
  buyer: { full_name: string } | null;
  seller: { full_name: string } | null;
}

const ChatRoom = () => {
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  const {
    messages,
    loading,
    sendMessage,
    sendOffer,
    respondToOffer,
    latestPendingOffer,
    acceptedOffer,
    userId,
  } = useChatRoom(conversationId ?? null);

  const [meta, setMeta] = useState<ConversationMeta | null>(null);
  const [input, setInput] = useState("");
  const [offerInput, setOfferInput] = useState("");
  const [showOfferInput, setShowOfferInput] = useState(false);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
  }, [user, authLoading, navigate]);

  // Fetch conversation metadata
  useEffect(() => {
    if (!conversationId) return;
    supabase
      .from("conversations")
      .select(
        `id, buyer_id, seller_id,
         ticket:tickets(id, selling_price, quantity, event:events(id, title, date, image_url, category)),
         buyer:profiles!conversations_buyer_id_fkey(full_name),
         seller:profiles!conversations_seller_id_fkey(full_name)`
      )
      .eq("id", conversationId)
      .single()
      .then(({ data, error }) => {
        if (error) console.error("Conversation fetch error:", error);
        setMeta(data as unknown as ConversationMeta);
      });
  }, [conversationId]);

  // Auto-scroll on new messages
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || sending) return;
    const text = input;
    setInput("");
    setSending(true);
    const ok = await sendMessage(text);
    if (!ok) setInput(text); // Restore input on failure
    setSending(false);
  };

  const handleSendOffer = async () => {
    const price = parseFloat(offerInput);
    if (!price || price <= 0) {
      toast.error("Enter a valid price");
      return;
    }
    setSending(true);
    const ok = await sendOffer(price);
    if (ok) {
      setOfferInput("");
      setShowOfferInput(false);
    }
    setSending(false);
  };

  const handleAcceptOffer = async () => {
    if (!latestPendingOffer) return;
    await respondToOffer(latestPendingOffer.id, true);
  };

  const handleRejectOffer = async () => {
    if (!latestPendingOffer) return;
    await respondToOffer(latestPendingOffer.id, false);
  };

  const handleBuyAtPrice = () => {
    if (!meta?.ticket?.id || !acceptedOffer) return;
    navigate(`/checkout?listing_id=${meta.ticket.id}&agreed_price=${acceptedOffer.price}`);
  };

  if (!conversationId || (!loading && !meta)) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Header />
        <main className="flex-1 py-12 flex items-center justify-center">
          <p className="text-muted-foreground">Conversation not found.</p>
        </main>
        <Footer />
      </div>
    );
  }

  const isBuyer = userId === meta?.buyer_id;
  const otherName = isBuyer
    ? meta?.seller?.full_name ?? "Seller"
    : meta?.buyer?.full_name ?? "Buyer";
  const event = meta?.ticket?.event;
  const listPrice = meta?.ticket?.selling_price ?? 0;

  return (
    <div className="h-dvh bg-background flex flex-col overflow-hidden">
      <SEOHead titleKey="common.appName" descriptionKey="common.appName" />
      <Header />
      <main className="flex-1 flex flex-col overflow-hidden">
        <div className="container mx-auto px-4 max-w-2xl flex flex-col flex-1 py-4 overflow-hidden">
          {/* Top bar */}
          <div className="flex items-center gap-3 mb-4">
            <BackButton />
            <div className="flex items-center gap-3 flex-1 min-w-0">
              {event && (
                <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0">
                  <img
                    src={getEventImage(event.image_url, event.category)}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
              <div className="min-w-0">
                <p className="font-semibold truncate">{otherName}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {event?.title ?? "Ticket"} — Listed at €{listPrice.toFixed(2)}
                </p>
              </div>
            </div>
          </div>

          {/* Accepted offer banner */}
          {acceptedOffer && (
            <div className="mb-3 p-3 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-green-800 dark:text-green-200">
                  Offer accepted — €{acceptedOffer.price.toFixed(2)}
                </p>
                <p className="text-xs text-green-600 dark:text-green-400">
                  {isBuyer ? "Proceed to checkout to complete your purchase." : "Waiting for buyer to complete payment."}
                </p>
              </div>
              {isBuyer && (
                <Button variant="hero" size="sm" onClick={handleBuyAtPrice}>
                  <ShoppingCart className="w-4 h-4 mr-1" />
                  Buy
                </Button>
              )}
            </div>
          )}

          {/* Pending offer banner */}
          {latestPendingOffer && !acceptedOffer && (
            <div className="mb-3 p-3 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg">
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-200 mb-2">
                {latestPendingOffer.proposer_id === userId ? "You" : otherName} proposed €
                {latestPendingOffer.price.toFixed(2)}
              </p>
              {latestPendingOffer.proposer_id !== userId && (
                <div className="flex gap-2">
                  <Button size="sm" variant="default" onClick={handleAcceptOffer}>
                    <Check className="w-4 h-4 mr-1" />
                    Accept
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleRejectOffer}>
                    <X className="w-4 h-4 mr-1" />
                    Decline
                  </Button>
                </div>
              )}
              {latestPendingOffer.proposer_id === userId && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  Waiting for {otherName} to respond...
                </p>
              )}
            </div>
          )}

          {/* Messages area */}
          <Card className="flex-1 flex flex-col overflow-hidden min-h-0">
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
              {loading && (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              )}

              {!loading && messages.length === 0 && (
                <div className="text-center py-8">
                  <MessageSquare className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Start the conversation — say hi or make an offer!
                  </p>
                </div>
              )}

              {messages.map((msg) => {
                const isMe = msg.sender_id === userId;
                const isOffer = msg.content.startsWith("Proposed a new price:") || msg.content.startsWith("Accepted the offer") || msg.content.startsWith("Declined the offer");
                return (
                  <div
                    key={msg.id}
                    className={`flex ${isMe ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm ${
                        isOffer
                          ? "bg-primary/10 border border-primary/20 text-primary font-medium"
                          : isMe
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted"
                      }`}
                    >
                      {msg.content}
                      <p className={`text-[10px] mt-1 ${isMe && !isOffer ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                        {new Date(msg.created_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Input area */}
            <CardContent className="p-3 border-t">
              {showOfferInput ? (
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      type="number"
                      step="0.01"
                      min="0.01"
                      placeholder="Your price..."
                      value={offerInput}
                      onChange={(e) => setOfferInput(e.target.value)}
                      className="pl-9"
                      onKeyDown={(e) => e.key === "Enter" && handleSendOffer()}
                      autoFocus
                    />
                  </div>
                  <Button onClick={handleSendOffer} disabled={sending}>
                    Send Offer
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => setShowOfferInput(false)}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Input
                    placeholder="Type a message..."
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSend()}
                    className="flex-1"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setShowOfferInput(true)}
                    title="Make an offer"
                  >
                    <DollarSign className="w-4 h-4" />
                  </Button>
                  <Button size="icon" onClick={handleSend} disabled={sending || !input.trim()}>
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default ChatRoom;
