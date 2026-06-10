import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { SEOHead } from "@/components/SEOHead";
import { Link } from "react-router-dom";
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
    body: "Browse the marketplace, filter by event and price. Every listing comes from a verified ESCP student.",
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
    title: "Payment held in escrow",
    body: "Your money is locked by Stripe until the QR ticket reaches you. No upfront risk.",
  },
  {
    step: "04",
    icon: QrCode,
    title: "Get the QR automatically",
    body: "Once the seller releases the ticket through the platform, the QR lands in your inbox — verified, ready to scan.",
  },
];

const sellerSteps = [
  {
    step: "01",
    icon: Upload,
    title: "List in two minutes",
    body: "Pick the event, set your price, upload your QR. The listing goes live as soon as we authenticate it.",
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
    body: "Once payment clears, Ticket Safe releases the QR to the buyer automatically. You do nothing.",
  },
  {
    step: "04",
    icon: Banknote,
    title: "Get paid to your bank",
    body: "Payout via Stripe Connect — typically the next business day after the sale. No invoices, no chasing.",
  },
];

const faqs = [
  {
    q: "How are students verified?",
    a: "Sign-up requires a university email. Only verified ESCP students can list or buy on the resale marketplace.",
  },
  {
    q: "What if the QR turns out to be invalid?",
    a: "Every QR is checked before it is released to the buyer. If a ticket fails at the door because of a seller-side issue, you get a full refund — price plus platform fee.",
  },
  {
    q: "How long until the seller is paid?",
    a: "Stripe Connect uses a rolling daily payout schedule — usually the next business day after the sale clears.",
  },
  {
    q: "Can I cancel my listing?",
    a: "Yes, as long as no one has bought it yet. Once a sale is in progress, cancelling may incur a small penalty to protect the buyer.",
  },
  {
    q: "What are the fees?",
    a: "Buyers pay 6% on top of the ticket price; sellers have 5% deducted when they withdraw. The fee covers payment processing, ticket authentication and buyer protection.",
  },
  {
    q: "What if the event is cancelled?",
    a: "If the organizer cancels, every buyer gets a full automatic refund — ticket price and platform fee.",
  },
];

const HowItWorks = () => {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SEOHead
        title="How resale works — Ticket Safe"
        description="How the Ticket Safe resale marketplace works for buyers and sellers — escrow payments, automatic QR delivery, payouts via Stripe."
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
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 backdrop-blur border border-white/20 text-[10px] md:text-xs font-bold uppercase tracking-[0.2em] mb-4">
              <Repeat2 className="w-3 h-3" />
              Resale marketplace
            </div>
            <h1 className="text-3xl md:text-5xl lg:text-6xl font-black tracking-tight leading-[1.05] mb-4 md:mb-5 max-w-3xl">
              How resale works.
            </h1>
            <p className="text-sm md:text-lg text-white/80 max-w-2xl leading-relaxed">
              Buy a ticket from another student, or list yours — bank-to-bank, escrow-protected, fully automatic.
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
                Your money stays locked until the QR ticket reaches you. No risk, no surprises.
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
                List in two minutes. The platform handles delivery and payout — you just wait.
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
                Buyers pay 6%, sellers 5%. Nothing else, no hidden costs.
              </p>
            </div>

            <div className="rounded-2xl border border-border bg-card overflow-hidden">
              <div className="px-5 md:px-7 py-5 bg-muted/40 border-b border-border">
                <div className="text-[10px] md:text-xs uppercase tracking-[0.18em] font-bold text-muted-foreground mb-3">
                  Example · €50 ticket
                </div>
                <div className="space-y-2.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Ticket price (set by seller)</span>
                    <span className="font-semibold">€50.00</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Buyer fee (+6%)</span>
                    <span className="font-semibold text-primary">+€3.00</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Seller commission (−5%)</span>
                    <span className="font-semibold text-destructive">−€2.50</span>
                  </div>
                </div>
                <div className="mt-4 pt-4 border-t border-border space-y-2 text-sm">
                  <div className="flex justify-between font-bold">
                    <span>Buyer pays</span>
                    <span className="text-base">€53.00</span>
                  </div>
                  <div className="flex justify-between font-bold text-primary">
                    <span>Seller receives</span>
                    <span className="text-base">€47.50</span>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-3 divide-x divide-border">
                <div className="p-4 md:p-5 text-center">
                  <div className="text-xl md:text-2xl font-black text-primary mb-0.5">6%</div>
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
                  <div className="text-xl md:text-2xl font-black text-primary mb-0.5">~24h</div>
                  <div className="text-[10px] md:text-xs text-muted-foreground leading-tight">
                    Seller payout
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
                    Ready to buy or sell safely?
                  </h3>
                  <p className="text-white/85 text-sm md:text-base max-w-lg leading-relaxed">
                    Join hundreds of ESCP students already using the resale marketplace.
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-2.5">
                  <Link
                    to="/auth?mode=signup"
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
