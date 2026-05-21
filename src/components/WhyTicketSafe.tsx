import { Sparkles, Zap, Banknote, Check, X } from "lucide-react";
import { Link } from "react-router-dom";

const rows = [
  {
    icon: Sparkles,
    title: "All campus events in one place",
    ticketSafe: "Every event, every listing in one feed",
    informal: "Scattered across WhatsApp groups, stories, DMs",
  },
  {
    icon: Zap,
    title: "Find a match in minutes",
    ticketSafe: "Search, filter, message — book directly",
    informal: "Hours of asking around, hoping someone replies",
  },
  {
    icon: Banknote,
    title: "Bank-to-bank payments",
    ticketSafe: "Real money flow, held in escrow until delivered",
    informal: "Cash, Revolut requests, no recourse if it goes wrong",
  },
];

const WhyTicketSafe = () => {
  return (
    <section className="py-12 md:py-20 bg-background">
      <div className="container mx-auto px-4 max-w-5xl">
        {/* Header */}
        <div className="text-center mb-8 md:mb-14">
          <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold mb-3 md:mb-4">
            Why Ticket Safe?
          </h2>
          <p className="text-sm md:text-base lg:text-lg text-muted-foreground max-w-2xl mx-auto px-2">
            Secure bank-to-bank payments. The easiest way to find tickets — and buyers.
          </p>
        </div>

        {/* ===== MOBILE: stacked cards (each row is its own card) ===== */}
        <div className="md:hidden space-y-4">
          {rows.map((row, i) => {
            const Icon = row.icon;
            return (
              <div
                key={i}
                className="rounded-2xl border border-border bg-card overflow-hidden shadow-soft"
              >
                {/* Card title */}
                <div className="flex items-center gap-3 px-4 py-3.5 bg-muted/40 border-b border-border">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Icon className="w-4 h-4 text-primary" />
                  </div>
                  <span className="font-bold text-sm leading-tight">{row.title}</span>
                </div>
                {/* Ticket Safe value */}
                <div className="flex items-start gap-2.5 px-4 py-3 bg-primary/[0.04] border-b border-border">
                  <Check className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] uppercase tracking-wider font-bold text-primary mb-0.5">
                      Ticket Safe
                    </div>
                    <div className="text-sm text-foreground leading-snug">{row.ticketSafe}</div>
                  </div>
                </div>
                {/* Informal */}
                <div className="flex items-start gap-2.5 px-4 py-3">
                  <X className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-0.5">
                      WhatsApp / Instagram
                    </div>
                    <div className="text-sm text-muted-foreground leading-snug">{row.informal}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* ===== DESKTOP / TABLET: clean comparison table ===== */}
        <div className="hidden md:block rounded-2xl border border-border bg-card overflow-hidden shadow-card">
          {/* Column headers */}
          <div className="grid grid-cols-[1.6fr_1fr_1fr] border-b border-border bg-muted/30">
            <div className="px-6 py-4 text-xs uppercase tracking-wider font-bold text-muted-foreground">
              Feature
            </div>
            <div className="px-6 py-4 text-sm font-bold text-primary text-center bg-primary/5">
              Ticket Safe
            </div>
            <div className="px-6 py-4 text-sm font-bold text-muted-foreground text-center">
              <div>WhatsApp / Instagram</div>
              <div className="text-xs font-normal text-muted-foreground/70 mt-0.5">
                (informal resales)
              </div>
            </div>
          </div>

          {/* Rows */}
          {rows.map((row, i) => {
            const Icon = row.icon;
            const isLast = i === rows.length - 1;
            return (
              <div
                key={i}
                className={`grid grid-cols-[1.6fr_1fr_1fr] ${
                  isLast ? "" : "border-b border-border"
                }`}
              >
                {/* Feature label */}
                <div className="px-6 py-5 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Icon className="w-5 h-5 text-primary" />
                  </div>
                  <span className="font-semibold text-base leading-tight">{row.title}</span>
                </div>
                {/* Ticket Safe value */}
                <div className="px-6 py-5 bg-primary/[0.03] flex items-start gap-2">
                  <Check className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <span className="text-sm text-foreground leading-snug">{row.ticketSafe}</span>
                </div>
                {/* Informal */}
                <div className="px-6 py-5 flex items-start gap-2">
                  <X className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <span className="text-sm text-muted-foreground leading-snug">{row.informal}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Bottom CTA */}
        <div className="mt-8 md:mt-12 p-5 md:p-8 bg-gradient-to-r from-primary/10 to-accent/10 rounded-2xl text-center">
          <h3 className="text-lg md:text-2xl font-bold mb-2 md:mb-3">
            Ready to buy or sell safely?
          </h3>
          <p className="text-sm md:text-base text-muted-foreground mb-5 md:mb-6 max-w-xl mx-auto">
            Find a ticket, find a buyer — paid bank-to-bank, in minutes.
          </p>
          <div className="flex flex-col gap-2.5 sm:flex-row sm:gap-3 justify-center">
            <Link
              to="/marketplace"
              className="inline-flex items-center justify-center min-h-[48px] px-6 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 transition-colors text-sm md:text-base"
            >
              Browse Available Events
            </Link>
            <Link
              to="/sell"
              className="inline-flex items-center justify-center min-h-[48px] px-6 bg-background border border-border font-semibold rounded-lg hover:bg-muted transition-colors text-sm md:text-base"
            >
              Sell Your Ticket
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
};

export default WhyTicketSafe;
