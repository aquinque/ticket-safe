import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TICKET_QR_OPTIONS, type GuestTicketView } from "@/lib/guestAccess";
import { formatMoney } from "@/lib/money";
import { TicketPass, ticketStripDate } from "@/components/tickets/TicketPass";

const loadImage = (src: string, crossOrigin = false): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    if (crossOrigin) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`image failed: ${src.slice(0, 40)}`));
    img.src = src;
  });

/** Draws the ticket as it looks on screen (picture, black strip, name, ticket, QR, reference) onto a PNG. */
async function buildTicketImage(ticket: GuestTicketView, qrDataUrl: string, ticketLine: string): Promise<Blob> {
  const W = 900;
  let picture: HTMLImageElement | null = null;
  if (ticket.event.banner_url) {
    try {
      picture = await loadImage(ticket.event.banner_url, true);
    } catch {
      /* the colour and title stand in */
    }
  }
  // The whole picture, as on screen: its own height, between a wide strip and a tall flyer.
  const bannerH = picture
    ? Math.round(Math.min(Math.max((W * picture.height) / picture.width, W / 2.35), 1080))
    : Math.round(W / 2.35);
  const H = bannerH + 70 + 150 + 640 + 90;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  const font = (w: number, px: number) => `${w} ${px}px -apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif`;
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, W, H);

  // The whole picture (nothing cropped off), or the event's colour with its title
  if (picture) {
    ctx.fillStyle = "#0B0B0F";
    ctx.fillRect(0, 0, W, bannerH);
    const scale = Math.min(W / picture.width, bannerH / picture.height);
    const w = picture.width * scale;
    const h = picture.height * scale;
    ctx.drawImage(picture, (W - w) / 2, (bannerH - h) / 2, w, h);
  } else {
    ctx.fillStyle = ticket.event.accent || "#3a5fe6";
    ctx.fillRect(0, 0, W, bannerH);
    ctx.fillStyle = "#FFFFFF";
    ctx.textAlign = "left";
    ctx.font = font(900, 64);
    ctx.fillText((ticket.event.title ?? "Ticket").toUpperCase().slice(0, 22), 40, bannerH - 44);
  }

  // Black strip
  ctx.fillStyle = "#0B0B0F";
  ctx.fillRect(0, bannerH, W, 70);
  ctx.fillStyle = "#FFFFFF";
  ctx.font = font(700, 24);
  ctx.textAlign = "left";
  ctx.fillText(ticketStripDate(ticket.event.date), 40, bannerH + 45);
  ctx.textAlign = "right";
  ctx.fillText((ticket.event.location ?? "").toUpperCase().slice(0, 34), W - 40, bannerH + 45);

  // Name, ticket
  const infoY = bannerH + 70;
  ctx.textAlign = "left";
  ctx.fillStyle = "#64748B";
  ctx.font = font(700, 20);
  ctx.fillText("NAME", 40, infoY + 52);
  ctx.fillText("TICKET", W / 2 + 10, infoY + 52);
  ctx.fillStyle = "#0F172A";
  ctx.font = font(700, 32);
  ctx.fillText((ticket.holder_name ?? "—").slice(0, 24), 40, infoY + 96);
  ctx.fillText((ticketLine || "—").slice(0, 24), W / 2 + 10, infoY + 96);
  ctx.fillStyle = "#E2E8F0";
  ctx.fillRect(0, infoY + 150, W, 2);

  // QR and reference
  const qr = await loadImage(qrDataUrl);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(qr, (W - 560) / 2, infoY + 190, 560, 560);
  ctx.fillStyle = "#64748B";
  ctx.font = font(500, 22);
  ctx.textAlign = "center";
  if (ticket.ref) ctx.fillText(ticket.ref, W / 2, H - 50);

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("no blob"))), "image/png"));
}

interface GuestTicketCardProps {
  ticket: GuestTicketView;
  index?: number;
  total?: number;
}

/**
 * A ticket shown on its own (link from the confirmation email, or the success page): the same
 * ticket as on My Tickets and in the email, and a button to save it as an image. Works without a
 * session. The QR is drawn from the same qr_token the scanner reads.
 */
export const GuestTicketCard = ({ ticket, index, total }: GuestTicketCardProps) => {
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!ticket.qr_token) return;
    (async () => {
      const mod = await import("qrcode");
      const QRCode = (mod as { default?: { toDataURL: (s: string, o: Record<string, unknown>) => Promise<string> } }).default
        ?? (mod as unknown as { toDataURL: (s: string, o: Record<string, unknown>) => Promise<string> });
      const url = await QRCode.toDataURL(ticket.qr_token!, TICKET_QR_OPTIONS);
      if (!cancelled) setQrUrl(url);
    })().catch((e) => console.warn("[guest-ticket] qr failed", e));
    return () => {
      cancelled = true;
    };
  }, [ticket.qr_token]);

  const priceLabel = ticket.price_cents != null ? formatMoney(ticket.price_cents, ticket.currency ?? "EUR") : null;
  const ticketLine = [ticket.tier_name, priceLabel].filter(Boolean).join(" · ");

  const save = async () => {
    if (!qrUrl) return;
    setSaving(true);
    try {
      const blob = await buildTicketImage(ticket, qrUrl, ticketLine);
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `ticket-safe-${(ticket.event.title ?? "ticket").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.png`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    } finally {
      setSaving(false);
    }
  };

  const stillValid = ticket.status === "valid" && !!ticket.qr_token;
  const unavailable = stillValid
    ? null
    : ticket.status === "scanned"
      ? "This ticket has already been used."
      : "This ticket is no longer valid.";

  return (
    <div>
      <TicketPass
        label={index && total && total > 1 ? `Ticket ${index} of ${total}` : undefined}
        title={ticket.event.title ?? "Your event"}
        date={ticket.event.date}
        location={ticket.event.location}
        bannerUrl={ticket.event.banner_url}
        accent={ticket.event.accent}
        holderName={ticket.holder_name ?? ""}
        tierName={ticket.tier_name}
        priceLabel={priceLabel}
        qrSrc={qrUrl}
        refCode={ticket.ref ?? ""}
        unavailable={unavailable}
      >
        {stillValid && (
          <Button variant="outline" onClick={save} disabled={!qrUrl || saving} className="h-11 border-slate-300 bg-white text-slate-900 hover:bg-slate-50">
            <Download className="w-4 h-4 mr-2" />
            {saving ? "Saving…" : "Save as image"}
          </Button>
        )}
      </TicketPass>
      {stillValid && (
        <p className="mt-3 text-center text-[13px] text-muted-foreground">
          Show this screen at the door. Also sent to your email, with a PDF.
        </p>
      )}
    </div>
  );
};
