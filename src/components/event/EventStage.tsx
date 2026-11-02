import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { eventPhase, eventStart, type EventTimeFields } from "@/lib/eventTime";

/**
 * The moving parts of the public event page, kept apart from its checkout logic:
 * the poster's light behind the top of the page, the ticket-stub countdown under the
 * title, and the reveal of each section as it scrolls into view.
 */

/** The poster, blurred and enlarged behind the page: the room's light before you walk in. */
export function PosterGlow({ src, accent }: { src: string | null; accent: string }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden [mask-image:linear-gradient(to_bottom,#000_45%,transparent)]">
      {src ? (
        <img src={src} alt="" className="ts-glow absolute inset-0 w-full h-full object-cover" decoding="async" />
      ) : (
        <div className="ts-glow absolute inset-0" style={{ background: `radial-gradient(60% 70% at 50% 30%, ${accent}, transparent 75%)` }} />
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-background/0 via-background/45 to-background" />
    </div>
  );
}

function useTick(ms: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

const pad = (n: number) => n.toString().padStart(2, "0");

/** One unit of the countdown. The digits re-key on change, so each new value drops in. */
function Unit({ value, label }: { value: string; label: string }) {
  return (
    <span className="inline-flex flex-col items-center min-w-[2ch]">
      <span key={value} className="ts-digit text-lg sm:text-xl font-semibold leading-none tabular-nums text-foreground">{value}</span>
      <span className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</span>
    </span>
  );
}

/**
 * The event as a ticket stub: date and doors on the left, a live countdown in the middle,
 * the lowest price on the tear-off. Ticks every second on its own so the rest of the page
 * doesn't re-render with it.
 */
export function DoorsStub({
  event,
  priceLabel,
  onPrice,
}: {
  event: EventTimeFields & { date: string };
  priceLabel: string | null;
  onPrice: () => void;
}) {
  const now = useTick(1000);
  const phase = eventPhase(event, new Date(now));
  const start = new Date(event.date);
  const diff = Math.max(0, (eventStart(event)?.getTime() ?? now) - now);
  const d = Math.floor(diff / 86_400_000);
  const h = Math.floor((diff % 86_400_000) / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  const s = Math.floor((diff % 60_000) / 1000);

  return (
    <div className="ts-stub relative mt-5 grid grid-cols-[auto_1fr] sm:grid-cols-[auto_1fr_auto] border border-border bg-card/70 backdrop-blur-md rounded-2xl">
      <div className="px-4 sm:px-5 py-3.5 border-r border-dashed border-border">
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">
          {start.toLocaleDateString("en-GB", { weekday: "short" })}
        </div>
        <div className="text-xl sm:text-2xl font-semibold leading-none text-foreground mt-1 whitespace-nowrap">
          {start.getDate()} {start.toLocaleDateString("en-GB", { month: "short" })}
        </div>
        <div className="text-xs text-muted-foreground mt-1.5 tabular-nums">
          {start.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
        </div>
      </div>

      <div className="px-4 sm:px-5 py-3.5 flex flex-col justify-center min-w-0" aria-live="off">
        {phase === "live" ? (
          <div className="inline-flex items-center gap-2.5">
            <span className="relative flex w-2.5 h-2.5">
              <span className="absolute inset-0 rounded-full bg-emerald-400 motion-safe:animate-ping opacity-70" />
              <span className="relative w-2.5 h-2.5 rounded-full bg-emerald-400" />
            </span>
            <span className="text-lg font-semibold text-emerald-300">Happening now</span>
          </div>
        ) : phase === "past" ? (
          <span className="text-lg font-semibold text-muted-foreground">This event has ended</span>
        ) : (
          <>
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground mb-1.5">Starts in</span>
            <span className="flex items-start gap-1.5 sm:gap-2" aria-label={`${d} days ${h} hours ${m} minutes`}>
              {d > 0 && <><Unit value={String(d)} label={d === 1 ? "day" : "days"} /><Colon /></>}
              <Unit value={pad(h)} label="hrs" />
              <Colon />
              <Unit value={pad(m)} label="min" />
              <Colon />
              <Unit value={pad(s)} label="sec" />
            </span>
          </>
        )}
      </div>

      {priceLabel && (
        <button
          type="button"
          onClick={onPrice}
          className="group col-span-2 sm:col-span-1 flex items-center justify-between sm:justify-center gap-3 px-4 sm:px-6 py-3 border-t sm:border-t-0 sm:border-l border-dashed border-border bg-primary/10 hover:bg-primary/20 transition-colors rounded-b-2xl sm:rounded-b-none sm:rounded-r-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <span className="text-left">
            <span className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">Tickets</span>
            <span className="block text-lg font-semibold text-foreground whitespace-nowrap">{priceLabel}</span>
          </span>
          <ArrowRight className="w-4 h-4 text-primary transition-transform group-hover:translate-x-0.5" />
        </button>
      )}
    </div>
  );
}

const Colon = () => <span aria-hidden className="text-base leading-none text-muted-foreground/60">:</span>;

/** Fades a section up the first time it scrolls into view. Visible at once without motion or observers. */
export function Reveal({ children, delay = 0, className = "" }: { children: ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") { setShown(true); return; }
    // Shown once on screen, or once scrolled past (a jump straight over it must not leave it hidden).
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting || e.boundingClientRect.top < 0) { setShown(true); io.disconnect(); } }, { rootMargin: "0px 0px -8% 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className={`ts-reveal ${shown ? "is-in" : ""} ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

/** Keyframes and the ticket-notch mask. Motion stops for people who asked for less. */
export const eventStageStyles = `
  .ts-glow { filter: blur(56px) saturate(1.5); transform: scale(1.25); opacity: .7; animation: ts-breathe 14s ease-in-out infinite alternate; }
  @keyframes ts-breathe { from { transform: scale(1.25) translateY(0); opacity: .6; } to { transform: scale(1.4) translateY(-2%); opacity: .85; } }
  .ts-poster { animation: ts-poster-in 900ms cubic-bezier(.2,.7,.2,1) both; }
  @keyframes ts-poster-in { from { opacity: 0; transform: scale(1.03); } to { opacity: 1; transform: none; } }
  .ts-stub { animation: ts-stub-in 700ms 250ms cubic-bezier(.2,.7,.2,1) both; }
  @keyframes ts-stub-in { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
  .ts-digit { animation: ts-drop 380ms cubic-bezier(.2,.7,.2,1); }
  @keyframes ts-drop { from { transform: translateY(-35%); } to { transform: none; } }
  .ts-reveal { opacity: 0; transform: translateY(18px); transition: opacity 600ms ease, transform 600ms cubic-bezier(.2,.7,.2,1); }
  .ts-reveal.is-in { opacity: 1; transform: none; }
  /* A ticket: two half-circle notches cut where the price tears off. */
  .ts-ticket {
    --notch: 9px; --tear: 88px;
    -webkit-mask: radial-gradient(circle var(--notch) at calc(100% - var(--tear)) 0, #0000 98%, #000) top / 100% 51% no-repeat,
                  radial-gradient(circle var(--notch) at calc(100% - var(--tear)) 100%, #0000 98%, #000) bottom / 100% 51% no-repeat;
            mask: radial-gradient(circle var(--notch) at calc(100% - var(--tear)) 0, #0000 98%, #000) top / 100% 51% no-repeat,
                  radial-gradient(circle var(--notch) at calc(100% - var(--tear)) 100%, #0000 98%, #000) bottom / 100% 51% no-repeat;
  }
  @media (min-width: 640px) { .ts-ticket { --tear: 104px; } }
  @media (prefers-reduced-motion: reduce) {
    .ts-glow, .ts-poster, .ts-stub, .ts-digit { animation: none; }
    .ts-reveal { opacity: 1; transform: none; transition: none; }
  }
`;
