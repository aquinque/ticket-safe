import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TICKET_QR_OPTIONS, type GuestTicketView } from "@/lib/guestAccess";

const formatDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : "";

/** Draws the ticket details and the QR onto a PNG, for saving to the phone. */
const buildTicketImage = (ticket: GuestTicketView, qrDataUrl: string): Promise<Blob> =>
  new Promise((resolve, reject) => {
    const canvas = document.createElement("canvas");
    canvas.width = 900;
    canvas.height = 1180;
    const ctx = canvas.getContext("2d");
    if (!ctx) return reject(new Error("no canvas"));
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#0F172A";
    ctx.textAlign = "center";
    ctx.font = "bold 42px -apple-system, Helvetica, Arial, sans-serif";
    ctx.fillText(ticket.event.title ?? "Ticket", 450, 90);
    ctx.font = "28px -apple-system, Helvetica, Arial, sans-serif";
    ctx.fillStyle = "#475569";
    ctx.fillText(formatDate(ticket.event.date), 450, 140);
    if (ticket.event.location) ctx.fillText(ticket.event.location, 450, 180);
    ctx.fillStyle = "#0F172A";
    ctx.font = "bold 36px -apple-system, Helvetica, Arial, sans-serif";
    ctx.fillText(ticket.holder_name ?? "", 450, 240);
    ctx.font = "26px -apple-system, Helvetica, Arial, sans-serif";
    ctx.fillStyle = "#475569";
    ctx.fillText(ticket.tier_name ?? "", 450, 285);
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 150, 330, 600, 600);
      ctx.fillStyle = "#94A3B8";
      ctx.font = "22px -apple-system, Helvetica, Arial, sans-serif";
      ctx.fillText("Ticket Safe · show this QR at the door", 450, 1110);
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("no blob"))), "image/png");
    };
    img.onerror = () => reject(new Error("qr load failed"));
    img.src = qrDataUrl;
  });

interface GuestTicketCardProps {
  ticket: GuestTicketView;
  index?: number;
  total?: number;
}

/**
 * A ticket shown on its own: big QR, details, and a button to save it as an image.
 * Works without a session. The QR is drawn from the same qr_token the scanner reads.
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

  const save = async () => {
    if (!qrUrl) return;
    setSaving(true);
    try {
      const blob = await buildTicketImage(ticket, qrUrl);
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

  return (
    <div className="bg-card border border-border rounded-2xl p-5 md:p-6 text-left shadow-sm">
      {index && total ? (
        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground mb-2">
          Ticket {index} of {total}
        </div>
      ) : null}
      <h2 className="text-lg font-bold">{ticket.event.title}</h2>
      <p className="text-sm text-muted-foreground">
        {formatDate(ticket.event.date)}
        {ticket.event.location ? ` · ${ticket.event.location}` : ""}
      </p>
      <p className="text-sm mt-2">
        <span className="font-semibold">{ticket.holder_name ?? "—"}</span>
        {ticket.tier_name ? <span className="text-muted-foreground"> · {ticket.tier_name}</span> : null}
      </p>

      {stillValid ? (
        <>
          <div className="mt-5 mx-auto w-full max-w-[360px] bg-white rounded-2xl p-4">
            {qrUrl ? (
              <img src={qrUrl} alt="Your ticket QR code" className="w-full h-auto block" />
            ) : (
              <div className="aspect-square w-full animate-pulse rounded-xl bg-muted" />
            )}
          </div>
          <p className="text-xs text-muted-foreground text-center mt-3">
            Show this screen at the door. Turn the brightness up if the scanner struggles.
          </p>
          <div className="flex justify-center mt-4">
            <Button variant="outline" onClick={save} disabled={!qrUrl || saving} className="h-10">
              <Download className="w-4 h-4 mr-2" />
              {saving ? "Saving…" : "Save as image"}
            </Button>
          </div>
        </>
      ) : ticket.status === "scanned" ? (
        <p className="mt-5 text-sm font-semibold text-amber-700">This ticket has already been used.</p>
      ) : (
        <p className="mt-5 text-sm font-semibold text-muted-foreground">This ticket is no longer valid.</p>
      )}
    </div>
  );
};
