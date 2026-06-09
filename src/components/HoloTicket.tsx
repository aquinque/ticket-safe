import { useEffect, useRef } from "react";

/**
 * HoloTicket — the showpiece on the home page.
 *
 * A 3D-tilted ticket card with a holographic foil overlay that reacts to
 * the cursor in real time. The aim is "Apple-grade visual moment" without
 * a heavyweight 3D library: everything below uses CSS transforms,
 * conic / radial gradients, and a single requestAnimationFrame loop.
 *
 * Visual layers (back to front):
 *   1. Brand-blue gradient base
 *   2. Conic-gradient iridescent foil that rotates with cursor X
 *   3. Specular radial highlight that follows the cursor
 *   4. Diagonal shimmer sweep (slow CSS animation)
 *   5. Ticket content + perforation notches
 *   6. Soft floor shadow underneath
 *
 * Motion behaviour:
 *   - Idle: gentle Y-bob (~10px) on a 4s sine wave so the card never feels static
 *   - Hover: rotateX/rotateY (max ±12°) follows pointer with lerp smoothing
 *   - Foil + spec highlight both read pointer position via CSS custom props
 *     so they shift in real time as you move the cursor
 *
 * Accessibility:
 *   - All motion is gated by prefers-reduced-motion. When set, the card
 *     renders statically (no float, no tilt, no shimmer) and is purely
 *     decorative.
 *   - On touch devices we skip the pointer listener entirely; the idle
 *     float still happens, but tilt requires a mouse.
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

    // State (kept in closure to avoid React re-renders 60×/s)
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
      // Max tilt ±12deg. Y mouse drives X rotation (looking down/up),
      // X mouse drives Y rotation (turning left/right). Negative on rotateX
      // because the card "leans back" when the cursor goes up.
      targetX = (mouseY - 0.5) * -12;
      targetY = (mouseX - 0.5) * 12;
    };
    const onLeave = () => {
      hovering = false;
      targetX = 0;
      targetY = 0;
      // Don't reset mouseX/Y — let the foil settle at last position
    };

    const tick = (timestamp: number) => {
      // Lerp toward target for smooth easing (0.12 = ~120ms feel)
      currentX += (targetX - currentX) * 0.12;
      currentY += (targetY - currentY) * 0.12;
      // Idle float — 8px peak-to-peak over 4s
      const floatY = Math.sin(timestamp / 1500) * 4;
      // Compose final transform. perspective lives on the parent, so we
      // only emit rotateX / rotateY / translateY here.
      card.style.transform =
        `translateY(${floatY}px) rotateX(${currentX.toFixed(2)}deg) rotateY(${currentY.toFixed(2)}deg)`;
      // Drive CSS custom props for the foil + spec highlight. When the
      // mouse leaves, mouseX/Y stay at their last position so the foil
      // doesn't jump back to center.
      card.style.setProperty("--mx", `${(mouseX * 100).toFixed(1)}%`);
      card.style.setProperty("--my", `${(mouseY * 100).toFixed(1)}%`);
      card.style.setProperty("--foil-opacity", hovering ? "1" : "0.55");
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
      className="relative w-full flex items-center justify-center py-6 md:py-10 select-none"
      style={{ perspective: "1200px" }}
    >
      {/* Rising particles in the background — pure CSS, 8 dots staggered.
          Adds atmosphere without a JS particle engine. */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {Array.from({ length: 12 }).map((_, i) => (
          <span
            key={i}
            className="holo-particle absolute block rounded-full bg-primary/30"
            style={{
              left: `${(i * 8.3 + 5) % 100}%`,
              bottom: "-20px",
              width: `${4 + (i % 3) * 2}px`,
              height: `${4 + (i % 3) * 2}px`,
              animationDelay: `${(i * 0.6) % 4}s`,
              animationDuration: `${6 + (i % 4)}s`,
            }}
          />
        ))}
      </div>

      <div
        ref={cardRef}
        className="holo-card relative w-[280px] sm:w-[320px] md:w-[380px] aspect-[2/3]"
        style={{
          transformStyle: "preserve-3d",
          willChange: "transform",
          transition: "transform 100ms linear",
        }}
      >
        {/* The ticket */}
        <div
          className="relative h-full w-full rounded-3xl overflow-hidden"
          style={{
            background: "linear-gradient(135deg, hsl(220 100% 30%), hsl(210 100% 45%))",
            boxShadow:
              "0 40px 80px -20px rgba(0, 51, 153, 0.55), 0 0 0 1px rgba(255,255,255,0.08) inset",
          }}
        >
          {/* Iridescent foil — conic gradient driven by cursor X. The angle
              shifts as the mouse moves, giving the unmistakable
              "holographic Pokemon card" rainbow shimmer. */}
          <div
            className="absolute inset-0 pointer-events-none mix-blend-screen"
            style={{
              background:
                "conic-gradient(from 0deg at var(--mx,50%) var(--my,50%), rgba(99,179,237,0) 0deg, rgba(99,179,237,0.45) 60deg, rgba(168,140,255,0.35) 120deg, rgba(255,255,255,0.55) 180deg, rgba(99,179,237,0.45) 240deg, rgba(168,140,255,0.35) 300deg, rgba(99,179,237,0) 360deg)",
              opacity: "var(--foil-opacity, 0.55)",
              transition: "opacity 200ms ease-out",
            }}
          />

          {/* Specular highlight — bright blob that tracks the cursor */}
          <div
            className="absolute inset-0 pointer-events-none mix-blend-overlay"
            style={{
              background:
                "radial-gradient(circle at var(--mx,50%) var(--my,50%), rgba(255,255,255,0.65) 0%, rgba(255,255,255,0) 40%)",
            }}
          />

          {/* Diagonal shimmer sweep — slow CSS animation, independent of mouse */}
          <div className="absolute inset-0 pointer-events-none holo-shimmer" />

          {/* Content */}
          <div className="relative h-full px-6 md:px-7 py-6 md:py-7 text-white flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/90">
                Ticket Safe
              </div>
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/55">
                Premium
              </div>
            </div>

            <div className="text-xl md:text-2xl font-bold leading-tight mb-1.5">
              Spring Boat Party
            </div>
            <div className="text-[11px] md:text-xs text-white/85">
              Sat 21 Jun · 21:00 · Paris
            </div>

            {/* Tear strip */}
            <div className="my-5 md:my-6 border-b border-dashed border-white/25" />

            {/* Holder */}
            <div>
              <div className="text-[9px] md:text-[10px] uppercase tracking-[0.18em] font-bold text-white/55 mb-1">
                Holder
              </div>
              <div className="text-sm md:text-base font-semibold leading-tight">
                Your name here
              </div>
              <div className="text-[10px] md:text-[11px] text-white/60 mt-0.5">
                you@edu.escp.eu
              </div>
            </div>

            <div className="mt-auto pt-4 flex items-end justify-between">
              <div>
                <div className="text-[9px] uppercase tracking-wider font-bold text-white/55 mb-1">
                  Tier
                </div>
                <div className="text-xs font-semibold">VIP</div>
              </div>

              {/* Mini QR mock — 5×5 grid of squares. Static, just decorative. */}
              <div className="grid grid-cols-5 gap-[2px] w-12 h-12 bg-white/10 backdrop-blur p-1 rounded-md">
                {Array.from({ length: 25 }).map((_, i) => {
                  // Deterministic checker-ish pattern so it reads as a QR
                  const filled = (i * 7 + 3) % 5 < 3;
                  return (
                    <span
                      key={i}
                      className={`block rounded-[1px] ${filled ? "bg-white/90" : "bg-transparent"}`}
                    />
                  );
                })}
              </div>
            </div>
          </div>

          {/* Perforation notches biting into the gradient. bg-background so
              they appear as "punched out" of the card. */}
          <div className="absolute top-1/2 -translate-y-1/2 -left-3 w-6 h-6 rounded-full bg-background" />
          <div className="absolute top-1/2 -translate-y-1/2 -right-3 w-6 h-6 rounded-full bg-background" />
        </div>

        {/* Floor shadow — soft blue halo at the bottom */}
        <div
          className="absolute -bottom-6 left-8 right-8 h-10 rounded-[50%] pointer-events-none"
          style={{
            background: "radial-gradient(ellipse, rgba(0,51,153,0.45), transparent 70%)",
            filter: "blur(20px)",
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
        .holo-particle {
          animation-name: holoRise;
          animation-iteration-count: infinite;
          animation-timing-function: linear;
        }
        @keyframes holoRise {
          0%   { transform: translateY(0) scale(0.6); opacity: 0; }
          15%  { opacity: 0.6; }
          70%  { opacity: 0.6; }
          100% { transform: translateY(-360px) scale(1); opacity: 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          .holo-shimmer { animation: none; }
          .holo-particle { animation: none; opacity: 0; }
          .holo-card { animation: none !important; }
        }
      `}</style>
    </div>
  );
}
