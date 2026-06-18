/**
 * DesignLab — ISOLATED preview, reachable only at /design-lab. Not linked
 * anywhere and uses its own fonts + inline tokens, so it never affects the live
 * site. Current direction: "Clair & premium / épuré" — light, airy, refined.
 * Promote these tokens into the real theme ONLY after approval.
 */
import { useEffect } from "react";
import { ArrowRight, MapPin, Calendar, ShieldCheck } from "lucide-react";

// ---- Identity tokens (Light / premium / editorial-lite) ----
const C = {
  paper: "#F7F5F0",   // warm off-white page
  card: "#FFFFFF",
  ink: "#1A1A1A",     // near-black text
  soft: "#6B6A63",    // muted warm grey
  line: "#E6E1D6",    // warm hairline
  accent: "#1B3A6B",  // deep refined blue (used sparingly)
  accentSoft: "#EEF1F7",
};
const DISPLAY = "'Fraunces', Georgia, 'Times New Roman', serif";
const BODY = "'Inter', system-ui, sans-serif";

function EventCard({
  title, date, venue, price, scarce,
}: { title: string; date: string; venue: string; price: string; scarce?: boolean }) {
  return (
    <div className="overflow-hidden bg-white" style={{ borderRadius: 10, border: `1px solid ${C.line}` }}>
      {/* Thin accent bar instead of a loud banner */}
      <div style={{ height: 4, background: C.accent }} />
      <div className="p-6">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: C.soft }}>Gala</span>
          {scarce && (
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em]" style={{ color: C.accent }}>
              Few tickets left
            </span>
          )}
        </div>
        <h3 className="mb-4" style={{ fontFamily: DISPLAY, fontWeight: 500, fontSize: "1.5rem", lineHeight: 1.1, color: C.ink }}>
          {title}
        </h3>
        <div className="flex flex-col gap-2 mb-5 text-[13.5px]" style={{ color: C.soft }}>
          <span className="inline-flex items-center gap-2"><Calendar className="w-4 h-4" style={{ color: C.accent }} /> {date}</span>
          <span className="inline-flex items-center gap-2"><MapPin className="w-4 h-4" style={{ color: C.accent }} /> {venue}</span>
        </div>
        <div className="flex items-center justify-between pt-4" style={{ borderTop: `1px solid ${C.line}` }}>
          <div>
            <div className="text-[10px] uppercase tracking-wider" style={{ color: C.soft }}>From</div>
            <div className="text-lg" style={{ color: C.ink, fontFamily: DISPLAY, fontWeight: 500 }}>{price}</div>
          </div>
          <button
            className="inline-flex items-center gap-2 text-[13px] font-semibold px-5 py-2.5 transition-colors"
            style={{ background: C.ink, color: "#fff", borderRadius: 8 }}
          >
            Buy ticket <ArrowRight className="w-4 h-4" />
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
      link.href = "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Inter:wght@400;500;600;700&display=swap";
      document.head.appendChild(link);
    }
  }, []);

  return (
    <div style={{ background: C.paper, color: C.ink, fontFamily: BODY, minHeight: "100vh" }}>
      {/* Preview ribbon */}
      <div className="text-center text-[11px] font-semibold uppercase tracking-[0.2em] py-2" style={{ background: C.ink, color: C.paper }}>
        Design Lab · Preview only — the live site is unchanged
      </div>

      {/* HERO */}
      <section className="px-6 md:px-12 pt-16 md:pt-24 pb-16 max-w-5xl mx-auto">
        <div className="text-[11px] font-semibold uppercase tracking-[0.26em] mb-6" style={{ color: C.accent }}>
          Ticket Safe
        </div>
        <h1 style={{ fontFamily: DISPLAY, fontWeight: 400, fontSize: "clamp(2.6rem, 6.5vw, 5rem)", lineHeight: 1.02, letterSpacing: "-0.015em", color: C.ink }}>
          Student events,<br />
          straight from <span style={{ fontStyle: "italic", color: C.accent }}>the organizers.</span>
        </h1>
        <p className="text-base md:text-lg max-w-xl mt-7 mb-9 leading-relaxed" style={{ color: C.soft }}>
          All your school's events in one place — tickets sold directly by your campus societies. Resell safely, between students.
        </p>
        <div className="flex flex-wrap gap-3">
          <button className="inline-flex items-center gap-2 font-semibold px-6 py-3.5" style={{ background: C.ink, color: "#fff", borderRadius: 8 }}>
            Browse events <ArrowRight className="w-4 h-4" />
          </button>
          <button className="inline-flex items-center gap-2 font-semibold px-6 py-3.5" style={{ background: "transparent", color: C.ink, border: `1px solid ${C.line}`, borderRadius: 8 }}>
            Sell my ticket
          </button>
        </div>
        <div className="inline-flex items-center gap-2 mt-8 text-[13px]" style={{ color: C.soft }}>
          <ShieldCheck className="w-4 h-4" style={{ color: C.accent }} /> Verified students · bank-secure payments
        </div>
      </section>

      <div style={{ borderTop: `1px solid ${C.line}` }} />

      {/* PALETTE */}
      <section className="px-6 md:px-12 py-12 max-w-5xl mx-auto">
        <div className="text-[11px] font-semibold uppercase tracking-[0.2em] mb-5" style={{ color: C.soft }}>Palette</div>
        <div className="flex flex-wrap gap-4">
          {[["Paper", C.paper], ["Card", C.card], ["Ink", C.ink], ["Deep blue", C.accent], ["Soft blue", C.accentSoft], ["Hairline", C.line]].map(([name, hex]) => (
            <div key={hex} className="w-28">
              <div className="h-16" style={{ background: hex, border: `1px solid ${C.line}`, borderRadius: 8 }} />
              <div className="mt-2 text-[13px] font-medium">{name}</div>
              <div className="text-[11px]" style={{ color: C.soft }}>{hex}</div>
            </div>
          ))}
        </div>
      </section>

      <div style={{ borderTop: `1px solid ${C.line}` }} />

      {/* TYPOGRAPHY */}
      <section className="px-6 md:px-12 py-12 max-w-5xl mx-auto">
        <div className="text-[11px] font-semibold uppercase tracking-[0.2em] mb-5" style={{ color: C.soft }}>Typography</div>
        <div className="grid md:grid-cols-2 gap-10">
          <div>
            <div className="text-[10px] uppercase tracking-wider mb-3" style={{ color: C.soft }}>Display — Fraunces</div>
            <div style={{ fontFamily: DISPLAY, fontWeight: 400, fontSize: "2.6rem", lineHeight: 1.05, color: C.ink }}>
              An evening<br /><span style={{ fontStyle: "italic" }}>worth keeping</span>
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider mb-3" style={{ color: C.soft }}>Body — Inter</div>
            <p className="leading-relaxed" style={{ color: C.ink }}>
              The secure marketplace for verified students to buy and sell event tickets — legally and safely.
              No scams, no bots. Clear pricing, instant QR delivery, and a wallet for your sales.
            </p>
          </div>
        </div>
      </section>

      <div style={{ borderTop: `1px solid ${C.line}` }} />

      {/* EVENT CARDS */}
      <section className="px-6 md:px-12 py-12 pb-24 max-w-5xl mx-auto">
        <div className="text-[11px] font-semibold uppercase tracking-[0.2em] mb-5" style={{ color: C.soft }}>Event cards</div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <EventCard title="Gala de Turin" date="Fri 13 Jun · 22:00" venue="Turin Campus" price="€45" scarce />
          <EventCard title="BDE Opening Party" date="Sat 21 Jun · 23:00" venue="Paris — Le Loft" price="€18" />
          <EventCard title="Intercampus Games" date="Sat 28 Jun · 14:00" venue="Madrid Arena" price="€12" scarce />
        </div>

        <div className="mt-14 p-6" style={{ background: C.accentSoft, border: `1px solid ${C.line}`, borderRadius: 10 }}>
          <div className="mb-1.5" style={{ fontFamily: DISPLAY, fontWeight: 500, fontSize: "1.15rem", color: C.ink }}>If you like this</div>
          <p className="text-sm" style={{ color: C.soft }}>
            I promote these tokens into the real theme — Fraunces headings + Inter, the warm-paper / ink / deep-blue palette,
            8px radius, hairline borders, generous spacing — across the whole site. Nothing goes live until you say so.
          </p>
        </div>
      </section>
    </div>
  );
};

export default DesignLab;
