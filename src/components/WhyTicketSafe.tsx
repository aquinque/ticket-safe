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
        <div className="text-center mb-10 md:mb-14">
          <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold mb-3 md:mb-4">
            Why Ticket Safe?
          </h2>
          <p className="text-sm md:text-base lg:text-lg text-muted-foreground max-w-2xl mx-auto">
            Secure bank-to-bank payments. The easiest way to find tickets — and buyers.
          </p>
        </div>

        {/* Comparison card */}
        <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-card">
          {/* Column headers */}
          <div className="grid grid-cols-[1.4fr_1fr_1fr] md:grid-cols-[1.6fr_1fr_1fr] border-b border-border bg-muted/30">
            <div className="px-4 py-3 md:px-6 md:py-4 text-xs uppercase tracking-wider font-bold text-muted-foreground">
              Feature
            </div>
            <div className="px-3 py-3 md:px-6 md:py-4 text-xs md:text-sm font-bold text-primary text-center bg-primary/5">
              Ticket Safe
            </div>
            <div className="px-3 py-3 md:px-6 md:py-4 text-xs md:text-sm font-bold text-muted-foreground text-center">
              <div>WhatsApp / Instagram</div>
              <div className="text-[10px] md:text-xs font-normal text-muted-foreground/70 mt-0.5 hidden sm:block">
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
                className={`grid grid-cols-[1.4fr_1fr_1fr] md:grid-cols-[1.6fr_1fr_1fr] ${
                  isLast ? "" : "border-b border-border"
                }`}
              >
                {/* Feature label */}
                <div className="px-4 py-4 md:px-6 md:py-5 flex items-center gap-3">
                  <div className="w-9 h-9 md:w-10 md:h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Icon className="w-4 h-4 md:w-5 md:h-5 text-primary" />
                  </div>
                  <span className="font-semibold text-sm md:text-base leading-tight">
                    {row.title}
                  </span>
                </div>

                {/* Ticket Safe value */}
                <div className="px-3 py-4 md:px-6 md:py-5 bg-primary/[0.03] flex items-start gap-2">
                  <Check className="w-4 h-4 md:w-5 md:h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <span className="text-xs md:text-sm text-foreground leading-snug">
                    {row.ticketSafe}
                  </span>
                </div>

                {/* Informal */}
                <div className="px-3 py-4 md:px-6 md:py-5 flex items-start gap-2">
                  <X className="w-4 h-4 md:w-5 md:h-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <span className="text-xs md:text-sm text-muted-foreground leading-snug">
                    {row.informal}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Bottom CTA */}
        <div className="mt-10 md:mt-12 p-6 md:p-8 bg-gradient-to-r from-primary/10 to-accent/10 rounded-2xl text-center">
          <h3 className="text-xl md:text-2xl font-bold mb-2 md:mb-3">
            Ready to buy or sell safely?
          </h3>
          <p className="text-sm md:text-base text-muted-foreground mb-5 md:mb-6 max-w-xl mx-auto">
            Find a ticket, find a buyer — paid bank-to-bank, in minutes.
          </p>
          <div className="flex flex-col gap-3 md:flex-row md:gap-4 justify-center">
            <Link
              to="/marketplace"
              className="inline-flex items-center justify-center h-12 md:h-11 px-8 bg-primary text-primary-foreground font-semibold rounded-md hover:bg-primary/90 transition-colors"
            >
              Browse Available Events
            </Link>
            <Link
              to="/sell"
              className="inline-flex items-center justify-center h-12 md:h-11 px-8 bg-background border border-border font-semibold rounded-md hover:bg-muted transition-colors"
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
