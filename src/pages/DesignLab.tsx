/**
 * DesignLab — ISOLATED preview of the proposed "Nightlife / Poster" identity.
 * Not linked anywhere; reachable only at /design-lab. Loads its own fonts and
 * uses inline tokens so it never affects the live site. Once approved, these
 * tokens (fonts, radius, palette, component shapes) get promoted into the real
 * theme (index.css / tailwind.config / shared components).
 */
import { useEffect } from "react";
import { ArrowRight, MapPin, Calendar } from "lucide-react";

// ---- Identity tokens (Nightlife / Poster) ----
const C = {
  ink: "#0B0B12",
  ink2: "#15151F",
  ink3: "#1F1F2E",
  electric: "#2D5BFF",
  acid: "#C6FF3A",
  paper: "#F5F4EF",
  white: "#FFFFFF",
  muted: "#8A8AA0",
  line: "rgba(255,255,255,0.10)",
};
const DISPLAY = "'Archivo Black', system-ui, sans-serif";
const BODY = "'Inter', system-ui, sans-serif";

function Notch({ side }: { side: "left" | "right" }) {
  return (
    <span
      aria-hidden
      className="absolute w-5 h-5 rounded-full"
      style={{ background: C.ink, top: "50%", transform: "translateY(-50%)", [side]: "-10px" } as React.CSSProperties}
    />
  );
}

function EventCard({
  title, date, venue, price, gradient, scarce,
}: { title: string; date: string; venue: string; price: string; gradient: string; scarce?: boolean }) {
  return (
    <div className="relative overflow-hidden" style={{ background: C.ink2, borderRadius: 6, border: `1px solid ${C.line}` }}>
      {/* Banner */}
      <div className="h-36 relative" style={{ background: gradient }}>
        <div className="absolute top-3 left-3 text-[10px] font-bold uppercase tracking-[0.18em] px-2 py-1" style={{ background: C.ink, color: C.acid, borderRadius: 3 }}>
          Gala
        </div>
        {scarce && (
          <div className="absolute top-3 right-3 text-[10px] font-bold uppercase tracking-[0.14em] px-2 py-1 inline-flex items-center gap-1.5" style={{ background: C.acid, color: C.ink, borderRadius: 3 }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: C.ink }} /> Few left
          </div>
        )}
      </div>
      {/* Perforation / tear line */}
      <div className="relative h-0">
        <Notch side="left" />
        <Notch side="right" />
        <div className="absolute left-3 right-3 top-0 border-t border-dashed" style={{ borderColor: C.line }} />
      </div>
      {/* Info */}
      <div className="p-5 pt-6">
        <h3 className="text-xl uppercase leading-[0.95] mb-3" style={{ fontFamily: DISPLAY, color: C.white, letterSpacing: "0.01em" }}>
          {title}
        </h3>
        <div className="flex flex-col gap-1.5 mb-4 text-[13px]" style={{ color: C.muted }}>
          <span className="inline-flex items-center gap-2"><Calendar className="w-3.5 h-3.5" style={{ color: C.electric }} /> {date}</span>
          <span className="inline-flex items-center gap-2"><MapPin className="w-3.5 h-3.5" style={{ color: C.electric }} /> {venue}</span>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-wider" style={{ color: C.muted }}>From</div>
            <div className="text-lg font-bold" style={{ color: C.white, fontFamily: BODY }}>{price}</div>
          </div>
          <button
            className="inline-flex items-center gap-2 text-[13px] font-bold uppercase tracking-wide px-4 py-2.5 transition-transform hover:-translate-y-0.5"
            style={{ background: C.electric, color: C.white, borderRadius: 4 }}
          >
            Get ticket <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

const DesignLab = () => {
  useEffect(() => {
    const id = "design-lab-fonts";
    if (!document.getElementById(id)) {
      const link = document.createElement("link");
      link.id = id;
      link.rel = "stylesheet";
      link.href = "https://fonts.googleapis.com/css2?family=Archivo+Black&family=Inter:wght@400;500;600;700;800;900&display=swap";
      document.head.appendChild(link);
    }
  }, []);

  return (
    <div style={{ background: C.ink, color: C.white, fontFamily: BODY, minHeight: "100vh" }}>
      {/* Preview ribbon */}
      <div className="text-center text-[11px] font-bold uppercase tracking-[0.2em] py-2" style={{ background: C.acid, color: C.ink }}>
        Design Lab · Preview only — the live site is unchanged
      </div>

      {/* HERO */}
      <section className="px-6 md:px-12 pt-14 md:pt-20 pb-14 max-w-6xl mx-auto">
        <div className="text-[11px] font-bold uppercase tracking-[0.28em] mb-5" style={{ color: C.electric }}>
          Ticket Safe — Nightlife identity
        </div>
        <h1
          className="uppercase mb-6"
          style={{ fontFamily: DISPLAY, fontSize: "clamp(2.6rem, 7vw, 5.5rem)", lineHeight: 0.92, letterSpacing: "-0.01em" }}
        >
          Student events,<br />
          <span style={{ color: C.electric }}>straight from</span><br />
          the <span style={{ background: C.acid, color: C.ink, padding: "0 0.15em" }}>organizers.</span>
        </h1>
        <p className="text-base md:text-lg max-w-xl mb-8 leading-relaxed" style={{ color: C.muted }}>
          All your school's events in one place — tickets sold directly by your campus societies. Resell safely, between students.
        </p>
        <div className="flex flex-wrap gap-3">
          <button className="inline-flex items-center gap-2 font-bold uppercase tracking-wide px-6 py-3.5" style={{ background: C.electric, color: C.white, borderRadius: 4 }}>
            Browse events <ArrowRight className="w-4 h-4" />
          </button>
          <button className="inline-flex items-center gap-2 font-bold uppercase tracking-wide px-6 py-3.5" style={{ background: "transparent", color: C.white, border: `1.5px solid ${C.line}`, borderRadius: 4 }}>
            Sell my ticket
          </button>
        </div>
      </section>

      {/* PALETTE */}
      <section className="px-6 md:px-12 py-10 max-w-6xl mx-auto">
        <div className="text-[11px] font-bold uppercase tracking-[0.2em] mb-4" style={{ color: C.muted }}>Palette</div>
        <div className="flex flex-wrap gap-3">
          {[
            ["Ink", C.ink], ["Ink card", C.ink2], ["Electric", C.electric], ["Acid", C.acid], ["Paper", C.paper], ["White", C.white],
          ].map(([name, hex]) => (
            <div key={hex} className="w-28">
              <div className="h-16 rounded" style={{ background: hex, border: `1px solid ${C.line}` }} />
              <div className="mt-1.5 text-xs font-semibold">{name}</div>
              <div className="text-[10px]" style={{ color: C.muted }}>{hex}</div>
            </div>
          ))}
        </div>
      </section>

      {/* TYPOGRAPHY */}
      <section className="px-6 md:px-12 py-10 max-w-6xl mx-auto">
        <div className="text-[11px] font-bold uppercase tracking-[0.2em] mb-4" style={{ color: C.muted }}>Typography</div>
        <div className="grid md:grid-cols-2 gap-8">
          <div>
            <div className="text-[10px] uppercase tracking-wider mb-2" style={{ color: C.muted }}>Display — Archivo Black</div>
            <div className="uppercase" style={{ fontFamily: DISPLAY, fontSize: "2.4rem", lineHeight: 1 }}>Tonight<br />we dance</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider mb-2" style={{ color: C.muted }}>Body — Inter</div>
            <p className="leading-relaxed" style={{ color: "rgba(255,255,255,0.85)" }}>
              The secure marketplace for verified students to buy and sell event tickets — legally and safely.
              No scams, no bots, just real students. Clear pricing, instant QR delivery, and a wallet for your sales.
            </p>
          </div>
        </div>
      </section>

      {/* EVENT CARDS */}
      <section className="px-6 md:px-12 py-10 pb-24 max-w-6xl mx-auto">
        <div className="text-[11px] font-bold uppercase tracking-[0.2em] mb-4" style={{ color: C.muted }}>Event cards (ticket-stub)</div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          <EventCard title="Gala de Turin" date="Fri 13 Jun · 22:00" venue="Turin Campus" price="€45" scarce gradient={`linear-gradient(135deg, ${C.electric}, #6E8BFF)`} />
          <EventCard title="BDE Opening Party" date="Sat 21 Jun · 23:00" venue="Paris — Le Loft" price="€18" gradient={`linear-gradient(135deg, #7A2BFF, ${C.electric})`} />
          <EventCard title="Intercampus Games" date="Sat 28 Jun · 14:00" venue="Madrid Arena" price="€12" scarce gradient={`linear-gradient(135deg, #1B8A5A, #11C28A)`} />
        </div>

        <div className="mt-12 p-5 rounded" style={{ background: C.ink2, border: `1px solid ${C.line}` }}>
          <div className="font-bold mb-1" style={{ fontFamily: DISPLAY, letterSpacing: "0.02em" }}>NEXT STEP</div>
          <p className="text-sm" style={{ color: C.muted }}>
            If you like this direction, I promote these tokens into the real theme — fonts, 4px radius, ink/electric/acid palette,
            chunky uppercase buttons, ticket-stub cards — across the whole site (home, tickets, studio, checkout, emails).
          </p>
        </div>
      </section>
    </div>
  );
};

export default DesignLab;
