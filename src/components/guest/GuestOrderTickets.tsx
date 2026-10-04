import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { GuestTicketCard } from "@/components/guest/GuestTicketCard";
import { isWellFormedAccessToken, ticketAccessHeaders, ticketAccessUrl, type GuestTicketView } from "@/lib/guestAccess";

const POLL_MS = 3000;
const MAX_ATTEMPTS = 40;

type State =
  | { phase: "pending" }
  | { phase: "ready"; tickets: GuestTicketView[] }
  | { phase: "error" };

/**
 * On the success page: shows the tickets of this order straight away, without an
 * account. The webhook may still be issuing them, so it polls until they exist.
 * If the link is wrong or the order is not payable, it shows nothing and the
 * page falls back to its usual content.
 */
export const GuestOrderTickets = ({ orderToken }: { orderToken: string }) => {
  const [state, setState] = useState<State>({ phase: "pending" });

  useEffect(() => {
    if (!isWellFormedAccessToken(orderToken)) {
      setState({ phase: "error" });
      return;
    }
    let cancelled = false;
    let attempts = 0;

    const poll = async () => {
      attempts += 1;
      try {
        const res = await fetch(ticketAccessUrl(), {
          method: "POST",
          headers: ticketAccessHeaders(),
          body: JSON.stringify({ order_token: orderToken }),
        });
        if (cancelled) return;
        if (res.status === 404) return setState({ phase: "error" });
        if (res.ok) {
          const data = (await res.json()) as { status: string; tickets?: GuestTicketView[] };
          if (data.status === "paid") return setState({ phase: "ready", tickets: data.tickets ?? [] });
          if (data.status !== "pending") return setState({ phase: "error" });
        }
      } catch {
        /* network blip: retry below */
      }
      if (cancelled) return;
      if (attempts >= MAX_ATTEMPTS) return setState({ phase: "error" });
      setTimeout(poll, POLL_MS);
    };

    poll();
    return () => {
      cancelled = true;
    };
  }, [orderToken]);

  if (state.phase === "error") return null;

  if (state.phase === "pending") {
    return (
      <div role="status" className="bg-card border border-border rounded-2xl p-5 text-center text-sm text-muted-foreground">
        <Loader2 className="w-5 h-5 mx-auto mb-2 animate-spin text-primary" />
        Confirming your payment. Your QR code will appear here in a moment.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {state.tickets.map((ticket, i) => (
        <GuestTicketCard key={i} ticket={ticket} index={i + 1} total={state.tickets.length} />
      ))}
    </div>
  );
};
