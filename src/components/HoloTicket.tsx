import { useEffect, useRef } from "react";

/**
 * HoloTicket — concert-ticket-stub showpiece for the home page.
 *
 * Horizontal layout (like a real venue ticket): the LEFT 60 % is the
 * "main" stub with the event details over a brand-blue gradient image,
 * the RIGHT 40 % is the lighter "tear-off" stub with the QR + holder +
 * price. A vertical dashed perforation line and two notches separate
 * the two halves.
 *
 * Compact by design so it never crowds the path-card CTAs underneath
 * the headline: max-width ~520 px on desktop, ~340 px on mobile, with
 * a 5:3 aspect ratio (so it's wide, not tall).
 *
 * Motion: identical to the previous version — idle Y-bob, mouse-driven
 * tilt, conic foil that tracks the cursor, specular highlight, slow
 * shimmer sweep. All gated by prefers-reduced-motion.
 */
export function HoloTicket() {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const card = cardRef.current;
    if (!wrapper || !card) return;

    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) return;

    let targetX = 0;
    let targetY = 0;
    let currentX = 0;
    let currentY = 0;
    let mouseX = 0.5;
    let mouseY = 0.5;
    let hovering = false;
    let raf = 0;

    const onMove = (e: PointerEvent) => {
      const rect = wrapper.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;
      mouseX = Math.max(0, Math.min(1, x));
      mouseY = Math.max(0, Math.min(1, y));
      hovering = true;
      // Slightly milder tilt now the card is shorter — ±8°
      targetX = (mouseY - 0.5) * -8;
      targetY = (mouseX - 0.5) * 8;
    };
    const onLeave = () => {
      hovering = false;
      targetX = 0;
      targetY = 0;
    };

    const tick = (timestamp: number) => {
      currentX += (targetX - currentX) * 0.12;
      currentY += (targetY - currentY) * 0.12;
      const floatY = Math.sin(timestamp / 1700) * 3;
      card.style.transform =
        `translateY(${floatY}px) rotateX(${currentX.toFixed(2)}deg) rotateY(${currentY.toFixed(2)}deg)`;
      card.style.setProperty("--mx", `${(mouseX * 100).toFixed(1)}%`);
      card.style.setProperty("--my", `${(mouseY * 100).toFixed(1)}%`);
      card.style.setProperty("--foil-opacity", hovering ? "0.85" : "0.45");
      raf = requestAnimationFrame(tick);
    };

    wrapper.addEventListener("pointermove", onMove);
    wrapper.addEventListener("pointerleave", onLeave);
    raf = requestAnimationFrame(tick);

    return () => {
      wrapper.removeEventListener("pointermove", onMove);
      wrapper.removeEventListener("pointerleave", onLeave);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div
      ref={wrapperRef}
      className="relative w-full flex items-center justify-center py-2 md:py-4 select-none"
      style={{ perspective: "1200px" }}
    >
      <div
        ref={cardRef}
        // Aspect 5:3 = wide ticket. Capped at 520 px so it sits comfortably
        // between the headline and the two path cards.
        className="holo-card relative w-[340px] sm:w-[420px] md:w-[520px] aspect-[5/3]"
        style={{
          transformStyle: "preserve-3d",
          willChange: "transform",
          transition: "transform 100ms linear",
        }}
      >
        <div
          className="relative h-full w-full rounded-2xl overflow-hidden flex"
          style={{
            boxShadow:
              "0 30px 50px -18px rgba(0, 51, 153, 0.55), 0 0 0 1px rgba(255,255,255,0.08) inset",
          }}
        >
          {/* ===== LEFT 60% — main stub with brand gradient ===== */}
          <div
            className="relative h-full basis-3/5 flex flex-col p-4 md:p-5 text-white"
            style={{
              background:
                "linear-gradient(135deg, hsl(220 100% 30%), hsl(210 100% 45%))",
            }}
          >
            {/* Iridescent foil (conic gradient tracking cursor) */}
            <div
              className="absolute inset-0 pointer-events-none mix-blend-screen"
              style={{
                background:
                  "conic-gradient(from 0deg at var(--mx,50%) var(--my,50%), rgba(99,179,237,0) 0deg, rgba(99,179,237,0.45) 60deg, rgba(168,140,255,0.35) 120deg, rgba(255,255,255,0.55) 180deg, rgba(99,179,237,0.45) 240deg, rgba(168,140,255,0.35) 300deg, rgba(99,179,237,0) 360deg)",
                opacity: "var(--foil-opacity, 0.45)",
                transition: "opacity 200ms ease-out",
              }}
            />
            {/* Specular highlight */}
            <div
              className="absolute inset-0 pointer-events-none mix-blend-overlay"
              style={{
                background:
                  "radial-gradient(circle at var(--mx,50%) var(--my,50%), rgba(255,255,255,0.6) 0%, rgba(255,255,255,0) 40%)",
              }}
            />
            {/* Diagonal shimmer sweep */}
            <div className="absolute inset-0 pointer-events-none holo-shimmer" />

            <div className="relative flex flex-col h-full">
              <div className="flex items-center justify-between mb-1.5">
                <div className="text-[9px] md:text-[10px] font-bold uppercase tracking-[0.22em] text-white/90">
                  Ticket Safe
                </div>
                {/* Verified seal */}
                <div className="inline-flex items-center gap-1 text-[8.5px] md:text-[9.5px] font-bold uppercase tracking-[0.16em] text-white/85 bg-white/15 backdrop-blur px-1.5 py-0.5 rounded-full">
                  <span className="w-1 h-1 rounded-full bg-white" />
                  Verified
                </div>
              </div>

              <div className="text-base md:text-lg font-bold leading-tight">
                Spring Boat Party
              </div>
              <div className="text-[10px] md:text-[11px] text-white/85 mt-0.5">
                Sat 21 Jun · 21:00 · Paris
              </div>

              <div className="mt-auto">
                <div className="text-[8.5px] md:text-[9.5px] uppercase tracking-[0.18em] font-bold text-white/55">
                  Organiser
                </div>
                <div className="text-[11px] md:text-xs font-semibold leading-tight mt-0.5">
                  BDE ESCP Paris
                </div>
              </div>
            </div>
          </div>

          {/* ===== Perforation strip ===== */}
          <div className="relative h-full w-3 md:w-4 shrink-0 bg-white">
            {/* Two card-coloured notches "biting" out at top and bottom */}
            <div
              className="absolute -top-2.5 left-1/2 -translate-x-1/2 w-5 h-5 rounded-full"
              style={{ background: "hsl(var(--background))" }}
            />
            <div
              className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 w-5 h-5 rounded-full"
              style={{ background: "hsl(var(--background))" }}
            />
            {/* Dashed tear line — vertical */}
            <div className="absolute inset-y-3 left-1/2 -translate-x-1/2 border-l border-dashed border-slate-300" />
          </div>

          {/* ===== RIGHT 40% — light stub with QR + price ===== */}
          <div className="relative h-full basis-2/5 flex flex-col items-center justify-between p-3 md:p-4 bg-white">
            <div className="w-full text-center">
              <div className="text-[8.5px] md:text-[9px] font-bold uppercase tracking-[0.2em] text-slate-500">
                Admit
              </div>
              <div className="text-[11px] md:text-xs font-bold text-slate-900 mt-0.5">
                Marie D.
              </div>
            </div>

            {/* QR mock — 8×8 grid, deterministic pattern. Bigger than the
                previous 5x5 so it reads as a real QR at a glance. */}
            <div className="grid grid-cols-8 gap-[1.5px] w-14 h-14 md:w-[68px] md:h-[68px] p-1 bg-slate-50 rounded">
              {Array.from({ length: 64 }).map((_, i) => {
                // Position-finder squares in 3 corners (top-left, top-right,
                // bottom-left) + a quasi-random body to look like a real QR.
                const row = Math.floor(i / 8);
                const col = i % 8;
                const isTopLeft = row < 2 && col < 2;
                const isTopRight = row < 2 && col > 5;
                const isBottomLeft = row > 5 && col < 2;
                const corner = isTopLeft || isTopRight || isBottomLeft;
                const body = ((row * 13 + col * 7 + 3) % 5) < 3;
                const filled = corner || body;
                return (
                  <span
                    key={i}
                    className={`block rounded-[1px] ${filled ? "bg-slate-900" : "bg-transparent"}`}
                  />
                );
              })}
            </div>

            <div className="w-full text-center">
              <div className="text-[8.5px] md:text-[9px] font-bold uppercase tracking-[0.2em] text-slate-500">
                Price
              </div>
              <div className="text-[15px] md:text-[17px] font-bold text-primary tabular-nums leading-tight mt-0.5">
                €42.50
              </div>
            </div>
          </div>
        </div>

        {/* Floor shadow */}
        <div
          className="absolute -bottom-4 left-6 right-6 h-6 rounded-[50%] pointer-events-none"
          style={{
            background: "radial-gradient(ellipse, rgba(0,51,153,0.4), transparent 70%)",
            filter: "blur(16px)",
            transform: "translateZ(-30px)",
          }}
        />
      </div>

      <style>{`
        .holo-shimmer {
          background: linear-gradient(115deg, transparent 30%, rgba(255,255,255,0.35) 50%, transparent 70%);
          background-size: 250% 250%;
          animation: holoShimmer 4.5s ease-in-out infinite;
          opacity: 0.5;
          mix-blend-mode: overlay;
        }
        @keyframes holoShimmer {
          0%   { background-position: 200% 0%; }
          100% { background-position: -50% 100%; }
        }
        @media (prefers-reduced-motion: reduce) {
          .holo-shimmer { animation: none; }
          .holo-card { animation: none !important; }
        }
      `}</style>
    </div>
  );
}
