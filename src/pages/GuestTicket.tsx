import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import HeaderNight from "@/components/HeaderNight";
import { BackButton } from "@/components/BackButton";
import Footer from "@/components/Footer";
import { GuestTicketCard } from "@/components/guest/GuestTicketCard";
import { isWellFormedAccessToken, ticketAccessHeaders, ticketAccessUrl, type GuestTicketView } from "@/lib/guestAccess";

/**
 * /t/:token — one ticket, opened from the confirmation email. No account needed.
 * An unknown or altered token shows the same message and no ticket data.
 */
const GuestTicket = () => {
  const { token } = useParams();
  const [state, setState] = useState<{ phase: "loading" } | { phase: "ready"; ticket: GuestTicketView } | { phase: "notfound" }>({ phase: "loading" });

  useEffect(() => {
    if (!isWellFormedAccessToken(token)) {
      setState({ phase: "notfound" });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${ticketAccessUrl()}?t=${encodeURIComponent(token)}`, { headers: ticketAccessHeaders() });
        if (cancelled) return;
        if (!res.ok) return setState({ phase: "notfound" });
        const data = (await res.json()) as { ticket: GuestTicketView };
        setState({ phase: "ready", ticket: data.ticket });
      } catch {
        if (!cancelled) setState({ phase: "notfound" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="theme-night min-h-screen bg-background flex flex-col">
      <HeaderNight />
      <main className="flex-1 pt-16 pb-12 md:pt-20 md:pb-16">
        <div className="container mx-auto px-4 max-w-md">
          <BackButton className="mb-4" />
          {state.phase === "loading" && <p className="text-center text-sm text-muted-foreground">Loading your ticket…</p>}
          {state.phase === "notfound" && (
            <div role="alert" className="bg-card border border-border rounded-2xl p-6 text-center">
              <h1 className="text-lg font-bold mb-2">Ticket not found</h1>
              <p className="text-sm text-muted-foreground">
                This link is not valid. Open the most recent confirmation email from Ticket Safe and use the link there.
              </p>
            </div>
          )}
          {state.phase === "ready" && <GuestTicketCard ticket={state.ticket} />}
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default GuestTicket;
