import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { BackButton } from "@/components/BackButton";
import { SEOHead } from "@/components/SEOHead";
import { Link } from "react-router-dom";
import { RESALE_BUYER_FEE_COPY, buyerFeeRateFor, calcBreakdown } from "@/lib/fees";
import { authPath } from "@/lib/returnTo";
import {
  ArrowRight,
  Search,
  HandCoins,
  Lock,
  QrCode,
  Upload,
  Bell,
  Send,
  Banknote,
  ShieldCheck,
  Repeat2,
  Ticket,
  GraduationCap,
} from "lucide-react";

const buyerSteps = [
  {
    step: "01",
    icon: Search,
    title: "Find a ticket",
    body: "Browse the resale listings and filter by event and price. Every QR code is checked before the ticket goes on sale.",
  },
  {
    step: "02",
    icon: HandCoins,
    title: "Buy or make an offer",
    body: "Pay at the listed price, or open a chat with the seller to negotiate before checkout.",
  },
  {
    step: "03",
    icon: Lock,
    title: "You pay TicketSafe",
    body: "You pay by card through TicketSafe, never to a stranger. The seller is only paid after the event.",
  },
  {
    step: "04",
    icon: QrCode,
    title: "Get a new ticket in your name",
    body: "Right after payment you get a new ticket with a new QR code, in your name. The seller's old QR code stops working.",
  },
];

const sellerSteps = [
  {
    step: "01",
    icon: Upload,
    title: "List in two minutes",
    body: "Pick the event, set your price and add your ticket's QR code. The listing goes live once the QR code is checked.",
  },
  {
    step: "02",
    icon: Bell,
    title: "Get an instant buyer",
    body: "Get notified when someone buys, or when a buyer messages you to negotiate. You decide whether to accept.",
  },
  {
    step: "03",
    icon: Send,
    title: "Automatic transfer",
    body: "When someone buys, TicketSafe issues them a new ticket and switches off your old QR code. You have nothing to send.",
  },
  {
    step: "04",
    icon: Banknote,
    title: "Get paid to your bank",
    body: "After the event, the price minus 5% is sent to your bank account. Add your bank details once, on Stripe's secure page.",
  },
];

const faqs = [
  {
    q: "Who can resell a ticket?",
    a: "Anyone with a TicketSafe account who has a ticket for the event. Its QR code is checked before the listing goes live.",
  },
  {
    q: "How does the QR code work after a resale?",
    a: "The buyer gets a new ticket with a new QR code, and the seller's old QR code stops working. Each code can be scanned only once at the door.",
  },
  {
    q: "How long until the seller is paid?",
    a: "After the event. The price minus 5% is sent to your bank account and usually arrives 2 to 3 working days later.",
  },
  {
    q: "Can I cancel my listing?",
    a: "Yes, as long as nobody has bought it yet: open My Wallet and cancel it. Once a ticket is sold, the sale is final.",
  },
  {
    q: "What are the fees?",
    a: `Buyers pay ${RESALE_BUYER_FEE_COPY} on top of the ticket price; sellers receive the price minus 5%, paid to their bank after the event. There is no other cost.`,
  },
  {
    q: "What if the event is cancelled?",
    a: "If the organizer cancels the event, every buyer is refunded automatically, fees included, to the card they paid with.",
  },
];

// The fee example is computed with the checkout's own calculation, so it cannot drift from what is charged.
const EXAMPLE_PRICE_EUR = 40;
const example = calcBreakdown(EXAMPLE_PRICE_EUR, 1);
const exampleBuyerFeePercent = Math.round(buyerFeeRateFor(EXAMPLE_PRICE_EUR) * 100);
const euros = (n: number) => `€${n.toFixed(2)}`;

const HowItWorks = () => {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SEOHead
        title="How resale works — Ticket Safe"
        description="How reselling a ticket on TicketSafe works: list it in two minutes, the buyer gets a new ticket with a new QR code, and the seller is paid to their bank after the event."
      />
      <Header />

      <main className="flex-1">
        {/* ============== HERO ============== */}
        <section
          className="relative overflow-hidden text-white"
          style={{ background: "var(--gradient-hero)" }}
        >
          <div
            className="pointer-events-none absolute -top-32 -left-32 w-[36rem] h-[36rem] rounded-full opacity-40 blur-3xl"
            style={{ background: "radial-gradient(circle, hsl(210 100% 65%), transparent 70%)" }}
          />
          <div
            className="pointer-events-none absolute top-20 -right-32 w-[28rem] h-[28rem] rounded-full opacity-30 blur-3xl"
            style={{ background: "radial-gradient(circle, hsl(240 100% 67%), transparent 70%)" }}
          />

          <div className="container mx-auto px-4 py-12 md:py-20 relative max-w-5xl">
            <div className="mb-5">
              <BackButton />
            </div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 border border-white/20 text-[10px] md:text-xs font-bold uppercase tracking-[0.2em] mb-4">
              <Repeat2 className="w-3 h-3" />
              Resale marketplace
            </div>
            <h1 className="text-3xl md:text-5xl lg:text-6xl font-black tracking-tight leading-[1.05] mb-4 md:mb-5 max-w-3xl">
              How resale works.
            </h1>
            <p className="text-sm md:text-lg text-white/80 max-w-2xl leading-relaxed">
              Can't go? Resell your ticket. Looking for one? Buy it from someone who can't use theirs.
            </p>
          </div>
        </section>

        {/* ============== BUYER FLOW ============== */}
        <section className="py-12 md:py-20">
          <div className="container mx-auto px-4 max-w-5xl">
            <div className="text-center mb-8 md:mb-12">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-[10px] md:text-xs font-bold uppercase tracking-[0.18em] text-primary mb-3">
                <Search className="w-3 h-3" />
                Buying a resale ticket
              </div>
              <h2 className="text-2xl md:text-4xl font-black mb-2 md:mb-3">
                Buy a ticket in 4 steps
              </h2>
              <p className="text-sm md:text-base text-muted-foreground max-w-xl mx-auto">
                You pay TicketSafe, you get a new ticket in your name, and the seller is paid after the event.
              </p>
            </div>

            <ol className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
              {buyerSteps.map(({ step, icon: Icon, title, body }) => (
                <li
                  key={step}
                  className="relative rounded-2xl bg-card border border-border p-5 md:p-7 hover:border-primary/30 hover:shadow-soft transition-all"
                >
                  <div className="flex items-center justify-between mb-4">
                    <div
                      className="w-12 h-12 md:w-14 md:h-14 rounded-xl flex items-center justify-center text-white"
                      style={{ background: "var(--gradient-hero)" }}
                    >
                      <Icon className="w-6 h-6 md:w-7 md:h-7" />
                    </div>
                    <span className="text-xs md:text-sm font-black tracking-[0.18em] text-muted-foreground">
                      {step}
                    </span>
                  </div>
                  <h3 className="text-lg md:text-xl font-bold text-foreground leading-tight mb-2">
                    {title}
                  </h3>
                  <p className="text-sm md:text-base text-muted-foreground leading-relaxed">
                    {body}
                  </p>
                </li>
              ))}
            </ol>

            <div className="text-center mt-8 md:mt-10">
              <Link
                to="/resale"
                className="inline-flex items-center justify-center gap-2 px-6 min-h-[48px] rounded-xl font-bold bg-primary text-primary-foreground hover:bg-primary-hover transition-all"
              >
                Browse resale listings
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </section>

        {/* ============== SELLER FLOW ============== */}
        <section className="py-12 md:py-20 bg-muted/30 border-y border-border">
          <div className="container mx-auto px-4 max-w-5xl">
            <div className="text-center mb-8 md:mb-12">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-[10px] md:text-xs font-bold uppercase tracking-[0.18em] text-primary mb-3">
                <Upload className="w-3 h-3" />
                Selling your ticket
              </div>
              <h2 className="text-2xl md:text-4xl font-black mb-2 md:mb-3">
                Sell a ticket in 4 steps
              </h2>
              <p className="text-sm md:text-base text-muted-foreground max-w-xl mx-auto">
                List in two minutes. TicketSafe issues the new ticket and pays you after the event.
              </p>
            </div>

            <ol className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
              {sellerSteps.map(({ step, icon: Icon, title, body }) => (
                <li
                  key={step}
                  className="relative rounded-2xl bg-card border border-border p-5 md:p-7 hover:border-primary/30 hover:shadow-soft transition-all"
                >
                  <div className="flex items-center justify-between mb-4">
                    <div
                      className="w-12 h-12 md:w-14 md:h-14 rounded-xl flex items-center justify-center text-white"
                      style={{ background: "linear-gradient(135deg, hsl(220 100% 30%), hsl(210 100% 45%))" }}
                    >
                      <Icon className="w-6 h-6 md:w-7 md:h-7" />
                    </div>
                    <span className="text-xs md:text-sm font-black tracking-[0.18em] text-muted-foreground">
                      {step}
                    </span>
                  </div>
                  <h3 className="text-lg md:text-xl font-bold text-foreground leading-tight mb-2">
                    {title}
                  </h3>
                  <p className="text-sm md:text-base text-muted-foreground leading-relaxed">
                    {body}
                  </p>
                </li>
              ))}
            </ol>

            <div className="text-center mt-8 md:mt-10">
              <Link
                to="/sell"
                className="inline-flex items-center justify-center gap-2 px-6 min-h-[48px] rounded-xl font-bold bg-primary text-primary-foreground hover:bg-primary-hover transition-all"
              >
                List a ticket
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </section>

        {/* ============== FEES ============== */}
        <section className="py-12 md:py-20">
          <div className="container mx-auto px-4 max-w-3xl">
            <div className="text-center mb-8 md:mb-10">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-[10px] md:text-xs font-bold uppercase tracking-[0.18em] text-primary mb-3">
                <Banknote className="w-3 h-3" />
                Fees
              </div>
              <h2 className="text-2xl md:text-4xl font-black mb-2 md:mb-3">
                Simple, fair pricing
              </h2>
              <p className="text-sm md:text-base text-muted-foreground">
                Buyers pay {RESALE_BUYER_FEE_COPY}, sellers 5%. Nothing else, no hidden costs.
              </p>
            </div>

            <div className="rounded-2xl border border-border bg-card overflow-hidden">
              <div className="px-5 md:px-7 py-5 bg-muted/40 border-b border-border">
                <div className="text-[10px] md:text-xs uppercase tracking-[0.18em] font-bold text-muted-foreground mb-3">
                  Example · €{EXAMPLE_PRICE_EUR} ticket
                </div>
                <div className="space-y-2.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Ticket price (set by seller)</span>
                    <span className="font-semibold">{euros(example.listPriceEuros)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Buyer fee (+{exampleBuyerFeePercent}%)</span>
                    <span className="font-semibold text-primary">+{euros(example.buyerFeeEuros)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Seller commission (−5%)</span>
                    <span className="font-semibold text-destructive">−{euros(example.sellerCommissionEuros)}</span>
                  </div>
                </div>
                <div className="mt-4 pt-4 border-t border-border space-y-2 text-sm">
                  <div className="flex justify-between font-bold">
                    <span>Buyer pays</span>
                    <span className="text-base">{euros(example.buyerTotalEuros)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-primary">
                    <span>Seller receives</span>
                    <span className="text-base">{euros(example.sellerPayoutEuros)}</span>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-3 divide-x divide-border">
                <div className="p-4 md:p-5 text-center">
                  <div className="text-xl md:text-2xl font-black text-primary mb-0.5">{exampleBuyerFeePercent}%</div>
                  <div className="text-[10px] md:text-xs text-muted-foreground leading-tight">
                    Buyer fee
                  </div>
                </div>
                <div className="p-4 md:p-5 text-center">
                  <div className="text-xl md:text-2xl font-black text-primary mb-0.5">5%</div>
                  <div className="text-[10px] md:text-xs text-muted-foreground leading-tight">
                    Seller commission
                  </div>
                </div>
                <div className="p-4 md:p-5 text-center">
                  <div className="text-xl md:text-2xl font-black text-primary mb-0.5">After</div>
                  <div className="text-[10px] md:text-xs text-muted-foreground leading-tight">
                    the event: seller payout
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ============== FAQ ============== */}
        <section className="py-12 md:py-20 bg-muted/20 border-t border-border">
          <div className="container mx-auto px-4 max-w-3xl">
            <div className="text-center mb-8 md:mb-12">
              <h2 className="text-2xl md:text-4xl font-black mb-2 md:mb-3">
                Frequently asked
              </h2>
              <p className="text-sm md:text-base text-muted-foreground">
                Quick answers about the resale marketplace.
              </p>
            </div>

            <div className="space-y-3">
              {faqs.map(({ q, a }) => (
                <details
                  key={q}
                  className="group rounded-xl border border-border bg-card overflow-hidden"
                >
                  <summary className="cursor-pointer list-none px-5 py-4 flex items-center justify-between gap-3 font-bold text-sm md:text-base text-foreground hover:bg-muted/50 transition-colors">
                    <span>{q}</span>
                    <span className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-black flex-shrink-0 group-open:rotate-45 transition-transform">
                      +
                    </span>
                  </summary>
                  <div className="px-5 pb-4 -mt-1 text-sm text-muted-foreground leading-relaxed">
                    {a}
                  </div>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ============== BRIDGE TO DIRECT TICKETS ============== */}
        <section className="py-12 md:py-20">
          <div className="container mx-auto px-4 max-w-3xl">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 rounded-2xl border border-border bg-card px-5 py-4">
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center text-white shrink-0"
                style={{ background: "var(--gradient-hero)" }}
              >
                <Ticket className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm md:text-base text-foreground leading-tight">
                  Looking to buy directly from the organizer?
                </div>
                <div className="text-xs md:text-sm text-muted-foreground">
                  See how direct event ticket purchases work.
                </div>
              </div>
              <Link
                to="/how-it-works/tickets"
                className="inline-flex items-center justify-center gap-1.5 px-4 min-h-[40px] rounded-lg font-bold text-sm bg-primary text-primary-foreground hover:bg-primary-hover transition-colors"
              >
                Buying tickets
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </section>

        {/* ============== FINAL CTA ============== */}
        <section className="pb-16 md:pb-24">
          <div className="container mx-auto px-4 max-w-5xl">
            <div
              className="relative rounded-2xl md:rounded-3xl p-6 md:p-12 overflow-hidden text-white"
              style={{ background: "var(--gradient-hero)" }}
            >
              <div
                className="pointer-events-none absolute -top-20 -right-20 w-72 h-72 rounded-full opacity-40 blur-3xl"
                style={{ background: "radial-gradient(circle, hsl(210 100% 65%), transparent 70%)" }}
              />
              <div className="relative flex flex-col md:flex-row md:items-center gap-5 md:gap-8">
                <div className="flex-1">
                  <h3 className="text-xl md:text-3xl font-black mb-2 md:mb-3 leading-tight">
                    Ready to buy or resell a ticket?
                  </h3>
                  <p className="text-white/85 text-sm md:text-base max-w-lg leading-relaxed">
                    Create a free account to resell a ticket or buy one someone else can't use.
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-2.5">
                  <Link
                    to={authPath("/how-it-works", { signup: true })}
                    className="inline-flex items-center justify-center gap-2 px-6 min-h-[48px] rounded-xl font-bold bg-white text-primary hover:bg-white/95 transition-all"
                  >
                    <GraduationCap className="w-4 h-4" />
                    Create free account
                  </Link>
                  <Link
                    to="/resale"
                    className="inline-flex items-center justify-center gap-2 px-6 min-h-[48px] rounded-xl font-bold border border-white/30 text-white hover:bg-white/10 transition-all"
                  >
                    Browse first
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default HowItWorks;
