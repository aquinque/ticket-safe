/**
 * DesignLab — ISOLATED preview at /design-lab. Not linked anywhere; loads its
 * own fonts and uses inline tokens so it never affects the live site.
 *
 * Direction: KEEP the existing Ticket Safe identity (the exact brand blues +
 * white + blue gradient + blue-tinted shadows). Only refresh typography
 * (Space Grotesk headings + Inter), spacing and component shapes. Nothing here
 * changes the live theme until explicitly approved.
 */
import { useEffect } from "react";
import { ArrowRight, MapPin, Calendar, ShieldCheck, Ticket } from "lucide-react";

// ---- EXACT Ticket Safe brand tokens (from index.css) ----
const C = {
  bg: "#FFFFFF",
  section: "hsl(210, 20%, 96%)",   // --muted
  ink: "hsl(222, 47%, 11%)",       // foreground
  primary: "hsl(220, 100%, 30%)",  // deep ESCP blue
  cta: "hsl(221, 100%, 56%)",      // brand CTA blue #1E5EFF
  accent: "hsl(210, 100%, 45%)",   // bright accent blue
  muted: "hsl(215, 16%, 47%)",     // muted text
  border: "hsl(214, 32%, 91%)",
  softBlue: "hsl(214, 100%, 97%)",
  gradient: "linear-gradient(135deg, hsl(220 100% 30%) 0%, hsl(215 95% 40%) 50%, hsl(210 100% 45%) 100%)",
  shadow: "0 4px 24px 0 hsl(220 100% 30% / 0.10)",
};
const DISPLAY = "'Space Grotesk', system-ui, sans-serif";
const BODY = "'Inter', system-ui, sans-serif";

function EventCard({
  title, date, venue, price, scarce,
}: { title: string; date: string; venue: string; price: string; scarce?: boolean }) {
  return (
    <div className="overflow-hidden bg-white" style={{ borderRadius: 16, border: `1px solid ${C.border}`, boxShadow: C.shadow }}>
      {/* Brand gradient header with the organizer logo slot */}
      <div className="h-28 relative flex items-center justify-center" style={{ background: C.gradient }}>
        <Ticket className="w-8 h-8 text-white/90" />
        {scarce && (
          <span className="absolute top-3 right-3 text-[10px] font-semibold uppercase tracking-[0.1em] px-2.5 py-1 rounded-full" style={{ background: "rgba(255,255,255,0.18)", color: "#fff", backdropFilter: "blur(4px)" }}>
            Few left
          </span>
        )}
      </div>
      <div className="p-5">
        <span className="inline-block text-[10px] font-semibold uppercase tracking-[0.14em] px-2.5 py-1 rounded-full mb-3" style={{ background: C.softBlue, color: C.primary }}>
          Gala
        </span>
        <h3 className="mb-3" style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: "1.25rem", lineHeight: 1.15, color: C.ink }}>
          {title}
        </h3>
        <div className="flex flex-col gap-1.5 mb-4 text-[13px]" style={{ color: C.muted }}>
          <span className="inline-flex items-center gap-2"><Calendar className="w-3.5 h-3.5" style={{ color: C.cta }} /> {date}</span>
          <span className="inline-flex items-center gap-2"><MapPin className="w-3.5 h-3.5" style={{ color: C.cta }} /> {venue}</span>
        </div>
        <div className="flex items-center justify-between pt-3.5" style={{ borderTop: `1px solid ${C.border}` }}>
          <div>
            <div className="text-[10px] uppercase tracking-wider" style={{ color: C.muted }}>From</div>
            <div className="text-lg font-bold" style={{ color: C.ink, fontFamily: DISPLAY }}>{price}</div>
          </div>
          <button className="inline-flex items-center gap-2 text-[13px] font-semibold px-4 py-2.5 text-white transition-transform hover:-translate-y-0.5" style={{ background: C.cta, borderRadius: 10 }}>
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
      link.href = "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap";
      document.head.appendChild(link);
    }
  }, []);

  return (
    <div style={{ background: C.bg, color: C.ink, fontFamily: BODY, minHeight: "100vh" }}>
      <div className="text-center text-[11px] font-semibold uppercase tracking-[0.2em] py-2" style={{ background: C.ink, color: "#fff" }}>
        Design Lab · Preview only — same Ticket Safe colors, fresh layout
      </div>

      {/* HERO — white, brand blue accents */}
      <section className="px-6 md:px-12 pt-16 md:pt-20 pb-16 max-w-6xl mx-auto grid md:grid-cols-[1.2fr_0.8fr] gap-12 items-center">
        <div>
          <div className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] px-3 py-1.5 rounded-full mb-6" style={{ background: C.softBlue, color: C.primary }}>
            <ShieldCheck className="w-3.5 h-3.5" /> Verified students only
          </div>
          <h1 style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: "clamp(2.4rem, 6vw, 4.4rem)", lineHeight: 1.04, letterSpacing: "-0.02em", color: C.ink }}>
            Student events,<br />
            straight from{" "}
            <span style={{ background: C.gradient, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>
              the organizers.
            </span>
          </h1>
          <p className="text-base md:text-lg max-w-lg mt-6 mb-8 leading-relaxed" style={{ color: C.muted }}>
            All your school's events in one place — tickets sold directly by your campus societies. Resell safely, between students.
          </p>
          <div className="flex flex-wrap gap-3">
            <button className="inline-flex items-center gap-2 font-semibold px-6 py-3.5 text-white transition-transform hover:-translate-y-0.5" style={{ background: C.cta, borderRadius: 12, boxShadow: C.shadow }}>
              Browse events <ArrowRight className="w-4 h-4" />
            </button>
            <button className="inline-flex items-center gap-2 font-semibold px-6 py-3.5" style={{ background: "#fff", color: C.primary, border: `1.5px solid ${C.border}`, borderRadius: 12 }}>
              Sell my ticket
            </button>
          </div>
        </div>
        {/* Gradient feature card */}
        <div className="rounded-3xl p-7 text-white" style={{ background: C.gradient, boxShadow: C.shadow }}>
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] opacity-80 mb-2">Tonight</div>
          <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: "1.8rem", lineHeight: 1.1 }}>Gala de Turin</div>
          <div className="opacity-85 text-sm mt-2 mb-6">Fri 13 Jun · 22:00 · Turin Campus</div>
          <div className="rounded-2xl bg-white/15 backdrop-blur p-4 flex items-center justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-wider opacity-80">From</div>
              <div className="text-2xl font-bold">€45</div>
            </div>
            <button className="inline-flex items-center gap-2 font-semibold px-4 py-2.5 rounded-xl" style={{ background: "#fff", color: C.primary }}>
              Get ticket <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </section>

      {/* EVENT CARDS */}
      <section className="px-6 md:px-12 py-14" style={{ background: C.section }}>
        <div className="max-w-6xl mx-auto">
          <h2 className="mb-1" style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: "1.6rem", color: C.ink }}>Upcoming events</h2>
          <p className="text-sm mb-7" style={{ color: C.muted }}>Same blue identity — just cleaner cards, better type, more air.</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <EventCard title="Gala de Turin" date="Fri 13 Jun · 22:00" venue="Turin Campus" price="€45" scarce />
            <EventCard title="BDE Opening Party" date="Sat 21 Jun · 23:00" venue="Paris — Le Loft" price="€18" />
            <EventCard title="Intercampus Games" date="Sat 28 Jun · 14:00" venue="Madrid Arena" price="€12" scarce />
          </div>
        </div>
      </section>

      {/* TYPOGRAPHY + BUTTONS */}
      <section className="px-6 md:px-12 py-14 max-w-6xl mx-auto grid md:grid-cols-2 gap-12">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] mb-4" style={{ color: C.muted }}>Typography</div>
          <div className="text-[10px] uppercase tracking-wider mb-2" style={{ color: C.muted }}>Headings — Space Grotesk</div>
          <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: "2.2rem", lineHeight: 1.05, color: C.ink }}>Find it. Buy it.<br />Show the QR.</div>
          <div className="text-[10px] uppercase tracking-wider mt-6 mb-2" style={{ color: C.muted }}>Body — Inter</div>
          <p className="leading-relaxed" style={{ color: C.ink }}>
            Bank-secure payments, instant QR delivery, and a wallet for your sales. The same trusted Ticket Safe — just sharper.
          </p>
        </div>
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] mb-4" style={{ color: C.muted }}>Buttons & chips</div>
          <div className="flex flex-wrap items-center gap-3 mb-5">
            <button className="font-semibold px-5 py-3 text-white" style={{ background: C.cta, borderRadius: 12 }}>Primary CTA</button>
            <button className="font-semibold px-5 py-3" style={{ background: "#fff", color: C.primary, border: `1.5px solid ${C.border}`, borderRadius: 12 }}>Secondary</button>
            <button className="font-semibold px-5 py-3 text-white" style={{ background: C.gradient, borderRadius: 12 }}>Gradient</button>
          </div>
          <div className="flex flex-wrap gap-2">
            {["Gala", "Party", "Conference", "Sports"].map((c) => (
              <span key={c} className="text-[12px] font-semibold px-3 py-1.5 rounded-full" style={{ background: C.softBlue, color: C.primary }}>{c}</span>
            ))}
          </div>
          <div className="mt-8 p-5 rounded-2xl" style={{ background: C.softBlue, border: `1px solid ${C.border}` }}>
            <div className="font-bold mb-1" style={{ fontFamily: DISPLAY, color: C.ink }}>Same colors, new feel</div>
            <p className="text-sm" style={{ color: C.muted }}>
              Identity untouched (ESCP blue, white, blue gradient). The refresh is only typography, spacing and card shapes.
              Tell me what to tweak — nothing goes live until you approve.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
};

export default DesignLab;
