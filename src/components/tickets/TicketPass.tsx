import type { ReactNode } from "react";

/**
 * The ticket as the buyer sees it, on My Tickets and on the guest ticket page, drawn like the
 * confirmation email's ticket (replay-order-email/_shared/buyerEmail.ts renderTicketCard):
 *
 *   ┌───────────────────────────┐
 *   │ event picture, whole      │  (or a poster in the event's colour)
 *   ├───────────────────────────┤  black strip: SAT 14 DEC · 23:00 ……… THE WAREHOUSE
 *   │ NAME          TICKET      │
 *   │ Alex Martin   Regular·€14 │
 *   ├───────────────────────────┤
 *   │           [QR]            │
 *   │        TS-4F2A-91         │
 *   └───────────────────────────┘
 *
 * A white card on purpose, on any page theme: the QR needs a white surround to scan.
 */

/** "SAT 14 DEC · 23:00" in the event's own wording; "" when there is no date. */
export function ticketStripDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const day = d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }).replace(/,/g, "");
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return `${day} · ${time}`.toUpperCase();
}

/** "TS-4F2A-91A0" from a ticket id: the reference printed under the QR, in the email and on the PDF. */
export function ticketRef(id: string): string {
  const clean = id.replace(/-/g, "");
  return `TS-${clean.slice(0, 4).toUpperCase()}-${clean.slice(-4).toUpperCase()}`;
}

export interface TicketPassProps {
  title: string;
  date: string | null;
  location: string | null;
  bannerUrl?: string | null;
  /** The event's colour, behind the title when there is no picture. */
  accent?: string | null;
  holderName: string;
  tierName?: string | null;
  priceLabel?: string | null;
  /** Image of the QR; null while it loads or when the ticket can no longer be used. */
  qrSrc: string | null;
  refCode: string;
  /** "Ticket 2 of 3" above the card, when an order has several. */
  label?: string;
  /** Shown instead of the QR (used, refunded, transferred…). */
  unavailable?: ReactNode;
  /** Under the QR: status chips, buttons. */
  children?: ReactNode;
}

export const TicketPass = ({ title, date, location, bannerUrl, accent, holderName, tierName, priceLabel, qrSrc, refCode, label, unavailable, children }: TicketPassProps) => {
  const strip = ticketStripDate(date);
  const ticketLine = [tierName, priceLabel].filter(Boolean).join(" · ");
  return (
    <article className="text-left">
      {label && <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">{label}</div>}
      <div className="overflow-hidden rounded-md bg-white text-slate-900 shadow-[0_18px_40px_-20px_rgba(0,0,0,0.6)]">
        {/* The event's picture whole (a flyer carries its own title and date, so nothing is cropped off),
            or a poster in the event's colour */}
        {bannerUrl ? (
          <div className="w-full bg-[#0b0b0f]">
            <img src={bannerUrl} alt="" className="mx-auto block h-auto max-h-[480px] w-full object-contain" loading="lazy" />
          </div>
        ) : (
          <div className="relative aspect-[2.35/1] w-full overflow-hidden" style={{ background: accent || "#3a5fe6" }}>
            <div className="absolute inset-0 flex flex-col justify-end p-4">
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/80">TicketSafe</div>
              <div className="mt-1 font-display text-[30px] font-black uppercase leading-[0.92] tracking-[-0.02em] text-white line-clamp-2">{title}</div>
            </div>
          </div>
        )}

        {/* Black strip: when, where */}
        <div className="flex items-center justify-between gap-3 bg-[#0b0b0f] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.12em] text-white">
          <span className="shrink-0">{strip}</span>
          {location && <span className="min-w-0 truncate text-right">{location}</span>}
        </div>

        {/* Who, what */}
        <div className="grid grid-cols-2 gap-4 px-4 py-3.5">
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Name</div>
            <div className="mt-0.5 text-[15px] font-bold leading-snug break-words">{holderName || "—"}</div>
          </div>
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Ticket</div>
            <div className="mt-0.5 text-[15px] font-bold leading-snug break-words">{ticketLine || "—"}</div>
          </div>
        </div>

        {/* The QR the door scans */}
        <div className="border-t border-slate-200 px-4 pb-4 pt-5 text-center">
          {unavailable ? (
            <div className="py-8 text-sm font-semibold text-slate-600">{unavailable}</div>
          ) : qrSrc ? (
            <img src={qrSrc} alt={`QR code for ${title}`} className="mx-auto block aspect-square w-full max-w-[260px]" style={{ imageRendering: "pixelated" }} />
          ) : (
            <div className="mx-auto aspect-square w-full max-w-[260px] animate-pulse bg-slate-100" aria-label="Loading the QR code" />
          )}
          <div className="mt-3 font-mono text-[11px] tracking-[0.12em] text-slate-500">{refCode}</div>
          {children && <div className="mt-4">{children}</div>}
        </div>
      </div>
    </article>
  );
};
