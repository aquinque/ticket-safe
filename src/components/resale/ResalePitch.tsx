/**
 * The resale page's case for selling here instead of in a group chat.
 *
 *   ResaleHero        headline + the signature: a ghosted group-chat thread
 *                     next to a paper ticket stub that gets scanned and
 *                     stamped "Verified" once on arrival.
 *   GroupChatVsUs     four plain rows, group chat on one side, TicketSafe on
 *                     the other.
 *   HowSellingWorks   the three steps a seller goes through, in order.
 *
 * Every claim here is what the product does today: the QR is checked before
 * a ticket is listed (submit-listing), the seller sets the price,
 * a resold TicketSafe ticket is reissued to the buyer with a new QR and the
 * seller's is marked transferred (stripe-connect-webhook), and the seller
 * fee comes from src/lib/fees.ts. No payout date is promised here.
 */
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowDown, ArrowRight, Check, X } from "lucide-react";
import { SELLER_COMMISSION_RATE } from "@/lib/fees";

const SELLER_FEE = `${Math.round(SELLER_COMMISSION_RATE * 100)}%`;

// ────────────────────────────────────────────────────────────────────────────
// Hero
// ────────────────────────────────────────────────────────────────────────────

const CHAT: { from: "them" | "me"; text: string }[] = [
  { from: "them", text: "anyone selling 1 for saturday??" },
  { from: "me", text: "me, 40€, send first" },
  { from: "them", text: "sent 🙏 where's the QR" },
  { from: "them", text: "hello??" },
];

export function ResaleHero({ listedCount }: { listedCount: number }) {
  return (
    <section className="relative overflow-hidden pt-16 md:pt-20">
      {/* One soft brand glow behind the stub, nothing else. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-40 top-10 h-[520px] w-[520px] rounded-full opacity-40 blur-3xl"
        style={{ background: "radial-gradient(circle, hsl(var(--brand-500) / 0.55), transparent 65%)" }}
      />
      <div className="relative container mx-auto max-w-6xl px-4 md:px-6 pt-8 md:pt-14 pb-12 md:pb-20 grid md:grid-cols-[1.05fr_1fr] gap-10 md:gap-8 items-center">
        <div>
          <p className="rs-rise text-[11px] font-bold uppercase tracking-[0.22em] text-cta">
            Resale · student to student
          </p>
          <h1 className="rs-rise mt-4 font-display text-[2.6rem] leading-[0.95] md:text-[4.4rem] font-bold tracking-[-0.035em] text-foreground" style={{ animationDelay: "60ms" }}>
            Stop selling tickets in the <span className="text-muted-foreground">group chat</span>.
          </h1>
          <p className="rs-rise mt-5 max-w-md text-base md:text-lg text-muted-foreground" style={{ animationDelay: "120ms" }}>
            List your spare ticket in two minutes. We check the QR, the buyer pays TicketSafe instead of a stranger,
            and the money goes to your bank. No chasing, no screenshots.
          </p>
          <div className="rs-rise mt-7 flex flex-wrap items-center gap-3" style={{ animationDelay: "180ms" }}>
            <Link
              to="/marketplace/sell"
              className="inline-flex items-center gap-2 px-6 min-h-[52px] rounded-xl font-bold text-base bg-primary text-primary-foreground hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cta focus-visible:ring-offset-2 focus-visible:ring-offset-background transition-colors"
            >
              Sell my ticket
              <ArrowRight className="w-4 h-4" />
            </Link>
            <a
              href="#marketplace-grid"
              className="inline-flex items-center gap-2 px-5 min-h-[52px] rounded-xl font-semibold text-sm text-foreground border border-border hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cta transition-colors"
            >
              {listedCount > 0 ? `Browse ${listedCount} ticket${listedCount === 1 ? "" : "s"}` : "Browse tickets"}
              <ArrowDown className="w-4 h-4" />
            </a>
          </div>
          <ul className="rs-rise mt-6 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground" style={{ animationDelay: "240ms" }}>
            <li className="inline-flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-success" />QR checked before listing</li>
            <li className="inline-flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-success" />You set the price</li>
            <li className="inline-flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-success" />{SELLER_FEE} fee, nothing upfront</li>
          </ul>
        </div>

        <ChatToStub />
      </div>
    </section>
  );
}

/** The signature: the group chat fading out behind a ticket that gets verified. */
function ChatToStub() {
  // The scene plays once it is on screen: on a phone it sits below the fold,
  // and the stamp should land while someone is looking at it.
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return setInView(true);
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        setInView(true);
        io.disconnect();
      }
    }, { threshold: 0.4 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} aria-hidden className={`rs-scene ${inView ? "rs-go" : ""} relative mx-auto w-full max-w-[420px] h-[380px] md:h-[440px]`}>
      {/* The group chat — dim, slightly behind. */}
      <div className="absolute left-0 top-0 w-[78%] md:w-[72%] rounded-2xl border border-border/70 bg-card/60 p-3.5 backdrop-blur-sm">
        <div className="mb-2.5 flex items-center gap-2 text-[11px] font-semibold text-muted-foreground">
          <span className="h-5 w-5 rounded-full bg-muted" />
          Group chat · 214 members
        </div>
        <div className="space-y-1.5">
          {CHAT.map((m, i) => (
            <div
              key={i}
              className={`rs-bubble max-w-[85%] w-fit rounded-2xl px-3 py-1.5 text-[13px] leading-snug ${
                m.from === "me" ? "ml-auto bg-primary/25 text-foreground/70" : "bg-muted text-foreground/60"
              }`}
              style={{ animationDelay: `${200 + i * 160}ms` }}
            >
              {m.text}
            </div>
          ))}
          <div className="rs-bubble pt-1 text-right text-[10px] text-muted-foreground/70" style={{ animationDelay: "900ms" }}>
            Seen · 2 h ago
          </div>
        </div>
      </div>

      {/* The ticket stub — the one bright object on the page. */}
      <div className="rs-stub absolute right-0 bottom-0 w-[76%] md:w-[70%]">
        <div className="relative rotate-[4deg] rounded-[14px] bg-[#EEF1FF] text-[#0B1030] shadow-[0_30px_60px_-20px_hsl(var(--brand-500)/0.65)]">
          <div className="p-4 pb-3">
            <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.16em] text-[#0B1030]/55">
              <span>Ticket Safe</span>
              <span>TS-4F2A-91</span>
            </div>
            <div className="mt-2 font-display text-xl font-bold leading-tight">Winter Gala</div>
            <div className="mt-0.5 font-mono text-[11px] text-[#0B1030]/65">SAT 14 NOV · 23:00</div>
          </div>
          {/* Perforation */}
          <div className="relative h-0 border-t-2 border-dashed border-[#0B1030]/20 mx-3">
            <span className="absolute -left-[22px] -top-[9px] h-4 w-4 rounded-full bg-background" />
            <span className="absolute -right-[22px] -top-[9px] h-4 w-4 rounded-full bg-background" />
          </div>
          <div className="flex items-end justify-between gap-3 p-4 pt-3">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#0B1030]/55">Price</div>
              <div className="font-display text-3xl font-bold leading-none tabular-nums">€22</div>
              <div className="mt-1 font-mono text-[10px] text-[#0B1030]/55">face €20 · max €30</div>
            </div>
            <div className="relative h-[72px] w-[72px] overflow-hidden rounded-md bg-white p-1.5">
              <QrGlyph />
              <span className="rs-scan absolute inset-x-0 h-[3px] bg-[#3a5fe6] shadow-[0_0_12px_2px_#3a5fe6]" />
            </div>
          </div>
          <div className="rs-stamp absolute left-[30%] top-[46%] -rotate-[10deg] rounded-md border-[3px] border-success px-2.5 py-1 font-mono text-[13px] font-bold uppercase tracking-[0.2em] text-success bg-[#EEF1FF]/90">
            ✓ Verified
          </div>
        </div>
      </div>
    </div>
  );
}

/** A stylised QR: three corner finders and a fixed scatter, purely decorative. */
const QR_SIZE = 11;
const QR_CELLS: [number, number][] = (() => {
  const out: [number, number][] = [];
  const finder = (x0: number, y0: number) => {
    for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) if (x !== 1 || y !== 1) out.push([x0 + x, y0 + y]);
  };
  finder(0, 0);
  finder(QR_SIZE - 3, 0);
  finder(0, QR_SIZE - 3);
  for (let y = 0; y < QR_SIZE; y++)
    for (let x = 0; x < QR_SIZE; x++) {
      const inFinder = (x < 4 && y < 4) || (x > QR_SIZE - 5 && y < 4) || (x < 4 && y > QR_SIZE - 5);
      if (!inFinder && (x * 7 + y * 13 + x * y) % 5 < 2) out.push([x, y]);
    }
  return out;
})();

function QrGlyph() {
  return (
    <svg viewBox={`0 0 ${QR_SIZE} ${QR_SIZE}`} className="h-full w-full" shapeRendering="crispEdges">
      {QR_CELLS.map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill="#0B1030" />
      ))}
    </svg>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Group chat vs TicketSafe
// ────────────────────────────────────────────────────────────────────────────

const ROWS: { q: string; chat: string; us: string }[] = [
  { q: "Is the ticket real?", chat: "You trust a screenshot.", us: "The QR is checked before it can be listed." },
  { q: "Where does the money go?", chat: "Straight to someone you've never met.", us: "The buyer pays TicketSafe, not a stranger." },
  { q: "What does it cost?", chat: "Hidden costs and deposits.", us: "The price is shown up front, with a 5% fee." },
  {
    q: "Can it be sold twice?",
    chat: "The same QR can go to five people.",
    us: "A TicketSafe ticket is reissued to the buyer. The seller's QR stops working.",
  },
];

export function GroupChatVsUs() {
  return (
    <section className="border-t border-border">
      <div className="container mx-auto max-w-6xl px-4 md:px-6 py-14 md:py-20">
        <h2 className="font-display text-3xl md:text-[2.75rem] font-bold tracking-[-0.03em] text-foreground max-w-xl leading-[1.02]">
          Why not just post it in the group chat?
        </h2>
        <div className="mt-8 md:mt-10 overflow-hidden rounded-2xl border border-border">
          <div className="hidden md:grid grid-cols-[1fr_1.1fr_1.25fr] bg-muted/40 text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
            <div className="px-5 py-3" />
            <div className="px-5 py-3">Group chat</div>
            <div className="px-5 py-3 text-cta">TicketSafe</div>
          </div>
          {ROWS.map((r) => (
            <div key={r.q} className="grid md:grid-cols-[1fr_1.1fr_1.25fr] border-t border-border first:border-t-0 md:first:border-t">
              <div className="px-5 pt-4 md:py-5 font-semibold text-foreground">{r.q}</div>
              <div className="px-5 pt-2 md:py-5 flex gap-2.5 text-sm text-muted-foreground">
                <X className="mt-0.5 w-4 h-4 shrink-0 text-danger/80" />
                <span><span className="md:hidden font-semibold">Group chat: </span>{r.chat}</span>
              </div>
              <div className="px-5 pt-2 pb-4 md:py-5 flex gap-2.5 text-sm text-foreground md:bg-primary/[0.07]">
                <Check className="mt-0.5 w-4 h-4 shrink-0 text-success" />
                <span><span className="md:hidden font-semibold">TicketSafe: </span>{r.us}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// How selling works
// ────────────────────────────────────────────────────────────────────────────

const STEPS: { title: string; body: string }[] = [
  { title: "List it", body: "Add your ticket and set your price. We check the QR before anyone sees it." },
  { title: "A student buys it", body: "They pay through TicketSafe and get the ticket straight away." },
  { title: "You get paid", body: `The price minus ${SELLER_FEE}, sent to your bank account.` },
];

export function HowSellingWorks() {
  return (
    <section className="border-t border-border">
      <div className="container mx-auto max-w-6xl px-4 md:px-6 py-14 md:py-20">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <h2 className="font-display text-3xl md:text-[2.75rem] font-bold tracking-[-0.03em] text-foreground leading-[1.02]">
            Selling takes three steps.
          </h2>
          <Link
            to="/marketplace/sell"
            className="inline-flex items-center gap-2 px-6 min-h-[52px] rounded-xl font-bold text-base bg-primary text-primary-foreground hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cta transition-colors"
          >
            Sell my ticket
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
        <ol className="mt-8 md:mt-10 grid gap-4 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="relative rounded-2xl border border-border bg-card p-6">
              <span className="font-mono text-xs font-semibold text-cta">Step {i + 1}</span>
              <h3 className="mt-3 font-display text-xl font-bold text-foreground">{s.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{s.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/** Keyframes for the pieces above; rendered once by the page. */
export const resalePitchStyles = `
  @keyframes rs-rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
  .rs-rise { animation: rs-rise 0.6s cubic-bezier(0.16, 1, 0.3, 1) both; }

  @keyframes rs-bubble { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
  .rs-bubble { animation: rs-bubble 0.35s ease-out both; }

  @keyframes rs-stub { from { opacity: 0; transform: translate(30px, 30px) rotate(6deg); } to { opacity: 1; transform: none; } }
  .rs-stub { animation: rs-stub 0.7s 0.7s cubic-bezier(0.16, 1, 0.3, 1) both; }

  @keyframes rs-scan { 0% { top: 0; opacity: 1; } 90% { top: calc(100% - 3px); opacity: 1; } 100% { top: calc(100% - 3px); opacity: 0; } }
  .rs-scan { top: 0; opacity: 0; animation: rs-scan 0.9s 1.4s ease-in-out forwards; }

  @keyframes rs-stamp { 0% { opacity: 0; transform: rotate(-10deg) scale(1.8); } 70% { opacity: 1; transform: rotate(-10deg) scale(0.94); } 100% { opacity: 1; transform: rotate(-10deg) scale(1); } }
  .rs-stamp { opacity: 0; animation: rs-stamp 0.35s 2.3s cubic-bezier(0.34, 1.56, 0.64, 1) forwards; }

  .rs-scene:not(.rs-go) .rs-bubble, .rs-scene:not(.rs-go) .rs-stub,
  .rs-scene:not(.rs-go) .rs-scan, .rs-scene:not(.rs-go) .rs-stamp { animation-play-state: paused; }

  @media (prefers-reduced-motion: reduce) {
    .rs-rise, .rs-bubble, .rs-stub { animation: none; }
    .rs-scan { animation: none; }
    .rs-stamp { animation: none; opacity: 1; }
  }
`;
