import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/**
 * TicketStub — the order-summary.pdf perforation motif promoted to a web
 * primitive. The PDF receipt nails the "real paper ticket" feel with its
 * dotted perforation strip; this component mirrors that visual language on
 * the web so receipts/order-summary blocks/checkout-success cards read as
 * the same physical-ish artefact.
 *
 * Render: a card with a dotted perforation strip on one edge and a half-
 * circle notch eating into the background at each end of the strip.
 *
 * Usage:
 *   <TicketStub perforation="top">…</TicketStub>     – stub sits above
 *   <TicketStub perforation="bottom">…</TicketStub>  – stub sits below (default)
 *
 * The notches are drawn with a radial-gradient mask that punches a hole
 * in the card so the page background shows through. Set `notchColor` to the
 * actual page background (defaults to the design-token `--background`) so
 * the cutout reads correctly.
 */

type Perforation = "top" | "bottom";

interface TicketStubProps {
  children: ReactNode;
  perforation?: Perforation;
  /** Stub height in px. Default 28. */
  stubHeight?: number;
  /** Page background color for the notch cut-out — must match the parent.
   *  Default uses the design-token --background. */
  notchColor?: string;
  className?: string;
  /** Inner padding. Defaults to p-6 / md:p-7. */
  innerClassName?: string;
}

export function TicketStub({
  children,
  perforation = "bottom",
  stubHeight = 28,
  notchColor = "hsl(var(--background))",
  className,
  innerClassName,
}: TicketStubProps) {
  const isTop = perforation === "top";
  const notchSize = 18;

  const notchStyle: React.CSSProperties = {
    backgroundImage: `
      radial-gradient(circle at 0 50%, ${notchColor} ${notchSize / 2}px, transparent ${notchSize / 2 + 1}px),
      radial-gradient(circle at 100% 50%, ${notchColor} ${notchSize / 2}px, transparent ${notchSize / 2 + 1}px)
    `,
    backgroundRepeat: "no-repeat",
    backgroundSize: `${notchSize}px ${notchSize}px, ${notchSize}px ${notchSize}px`,
    backgroundPosition: `left center, right center`,
  };

  const perforationLine = (
    <div
      className="relative flex items-center justify-center bg-card"
      style={{ height: stubHeight, ...notchStyle }}
      aria-hidden="true"
    >
      <div
        className="w-full mx-3"
        style={{
          borderTop: "1.5px dotted hsl(var(--border))",
        }}
      />
    </div>
  );

  return (
    <div className={cn("rounded-lg overflow-hidden shadow-card bg-card border border-border", className)}>
      {isTop && perforationLine}
      <div className={cn("p-6 md:p-7", innerClassName)}>{children}</div>
      {!isTop && perforationLine}
    </div>
  );
}

/**
 * The "ticket stub" decorative SVG — a small ticket icon with perforations
 * to put top-right of hero sections. Use as a brand motif instead of more
 * blue gradients.
 */
export function TicketStubMotif({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 90"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("pointer-events-none", className)}
      aria-hidden="true"
    >
      <defs>
        <mask id="ticket-notch">
          <rect width="120" height="90" fill="white" />
          <circle cx="80" cy="45" r="6" fill="black" />
        </mask>
      </defs>
      <rect
        x="6"
        y="14"
        width="108"
        height="62"
        rx="8"
        fill="currentColor"
        opacity="0.08"
        mask="url(#ticket-notch)"
      />
      <line
        x1="80"
        y1="20"
        x2="80"
        y2="70"
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeWidth="1.5"
        strokeDasharray="3 4"
      />
    </svg>
  );
}
