/**
 * Generates a downloadable PDF ticket. Style is inspired by Xceed / Dice:
 *   • Brand-blue header strip with event title, date, location, tier badge.
 *   • Event logo (top-right) if available — falls back to a brand monogram.
 *   • Holder block + ticket reference in the middle.
 *   • Large QR code centred for door scanning.
 *   • Quiet Ticket Safe footer.
 *
 * jsPDF is loaded dynamically so its ~200KB bundle only hits buyers who
 * actually press "Download". Same for the QR rasterisation pipeline — we
 * already have the QR as an SVG blob URL, we just need to repaint it onto
 * a canvas and hand the PNG data to jsPDF.
 */

export interface TicketPdfInput {
  eventTitle: string;
  eventDate: string;          // ISO
  eventLocation: string | null;
  eventLogoUrl: string | null;
  tierName: string | null;
  holderName: string;
  holderEmail: string | null;
  ticketId: string;
  orderId: string;
  ticketIndex: number;        // 1-based
  ticketTotal: number;
  qrSvgUrl: string;           // blob: URL pointing at the SVG returned by event-ticket-qr
}

const BRAND_BLUE: [number, number, number] = [0, 51, 153];      // #003399
const BRAND_LIGHT: [number, number, number] = [0, 102, 204];    // #0066cc
const INK: [number, number, number] = [30, 41, 59];             // slate-800
const MUTED: [number, number, number] = [100, 116, 139];        // slate-500
const FAINT: [number, number, number] = [148, 163, 184];        // slate-400

/**
 * Repaint an SVG blob URL onto a canvas at high resolution and return a PNG
 * data URL. jsPDF can embed PNGs directly; SVG support is patchy across
 * browsers, so the canvas-bounce is the safe path.
 */
async function svgUrlToPngDataUrl(svgUrl: string, size = 900): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Canvas 2D unavailable"));
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, size, size);
      ctx.drawImage(img, 0, 0, size, size);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => reject(new Error("Failed to load QR SVG"));
    img.src = svgUrl;
  });
}

/**
 * Load a remote image (org/event logo) and return it as a PNG data URL sized
 * to `maxDim`. CORS-tolerant: if the image can't be fetched it returns null
 * and the caller falls back to a brand monogram.
 */
async function imageUrlToPngDataUrl(
  url: string,
  maxDim = 400,
): Promise<{ dataUrl: string; width: number; height: number } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const ratio = img.width / img.height;
      const w = ratio >= 1 ? maxDim : maxDim * ratio;
      const h = ratio >= 1 ? maxDim / ratio : maxDim;
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(w);
      canvas.height = Math.round(h);
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve(null);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve({
        dataUrl: canvas.toDataURL("image/png"),
        width: canvas.width,
        height: canvas.height,
      });
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function formatEventDate(iso: string): { day: string; time: string } {
  const d = new Date(iso);
  return {
    day: d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
    time: d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
  };
}

function safeFilename(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9 _-]+/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
    .slice(0, 60) || "ticket";
}

export async function downloadTicketPdf(input: TicketPdfInput): Promise<void> {
  // Lazy-load jsPDF so users who don't press Download never pay the bundle cost
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pageW = 210;
  const pageH = 297;

  // ── HEADER: brand gradient simulated with horizontal slices ──
  // jsPDF has no gradient primitive, so we paint 80 thin rects from BRAND_BLUE
  // to BRAND_LIGHT to fake a linear-gradient(135°, ...). 80 slices reads as
  // smooth on every printer we care about.
  const headerH = 70;
  const slices = 80;
  for (let i = 0; i < slices; i++) {
    const t = i / (slices - 1);
    const r = Math.round(BRAND_BLUE[0] + (BRAND_LIGHT[0] - BRAND_BLUE[0]) * t);
    const g = Math.round(BRAND_BLUE[1] + (BRAND_LIGHT[1] - BRAND_BLUE[1]) * t);
    const b = Math.round(BRAND_BLUE[2] + (BRAND_LIGHT[2] - BRAND_BLUE[2]) * t);
    pdf.setFillColor(r, g, b);
    pdf.rect(0, (i * headerH) / slices, pageW, headerH / slices + 0.5, "F");
  }

  // Brand strip at the very top
  pdf.setTextColor(255, 255, 255);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.text("TICKET SAFE", 16, 12, { charSpace: 0.8 });

  if (input.ticketTotal > 1) {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8);
    pdf.text(
      `TICKET ${input.ticketIndex} OF ${input.ticketTotal}`,
      pageW - 16,
      12,
      { align: "right", charSpace: 0.8 },
    );
  }

  // Event logo top-right (if any)
  const titleStartX = 16;
  if (input.eventLogoUrl) {
    const logo = await imageUrlToPngDataUrl(input.eventLogoUrl, 240);
    if (logo) {
      const targetW = 22;
      const targetH = (logo.height / logo.width) * targetW;
      pdf.addImage(logo.dataUrl, "PNG", pageW - 16 - targetW, 18, targetW, targetH);
    }
  }

  // Event title
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(22);
  const titleLines = pdf.splitTextToSize(input.eventTitle, pageW - 56);
  pdf.text(titleLines.slice(0, 2), titleStartX, 30);

  // Date + location pills
  const { day, time } = formatEventDate(input.eventDate);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.text(`${day} · ${time}`, titleStartX, 50);
  if (input.eventLocation) {
    pdf.setFontSize(10);
    pdf.text(input.eventLocation, titleStartX, 56);
  }

  // Tier pill at the bottom of the header — solid darker overlay for contrast
  if (input.tierName) {
    const pillX = titleStartX;
    const pillY = 62;
    const label = input.tierName.toUpperCase();
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8);
    const labelW = pdf.getTextWidth(label) + 6;
    // Darker navy fill on top of the gradient so the pill reads
    pdf.setFillColor(0, 31, 92);
    pdf.roundedRect(pillX, pillY, labelW, 6, 3, 3, "F");
    pdf.setTextColor(255, 255, 255);
    pdf.text(label, pillX + 3, pillY + 4.2, { charSpace: 0.5 });
  }

  // ── PERFORATION LINE ──
  pdf.setDrawColor(...FAINT);
  pdf.setLineDashPattern([1.5, 1.5], 0);
  pdf.line(8, headerH + 6, pageW - 8, headerH + 6);
  pdf.setLineDashPattern([], 0);
  // Small notches at both ends of the line for that "tear strip" look
  pdf.setFillColor(255, 255, 255);
  pdf.circle(8, headerH + 6, 2.5, "F");
  pdf.circle(pageW - 8, headerH + 6, 2.5, "F");

  // ── BODY: holder + reference ──
  const bodyY = headerH + 18;
  pdf.setTextColor(...MUTED);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7);
  pdf.text("HOLDER", 16, bodyY, { charSpace: 0.8 });
  pdf.setTextColor(...INK);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(16);
  pdf.text(input.holderName || "—", 16, bodyY + 7);

  if (input.holderEmail) {
    pdf.setTextColor(...MUTED);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.text(input.holderEmail, 16, bodyY + 13);
  }

  // Reference column (right side)
  pdf.setTextColor(...MUTED);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7);
  pdf.text("REFERENCE", pageW - 16, bodyY, { align: "right", charSpace: 0.8 });
  pdf.setTextColor(...INK);
  pdf.setFont("courier", "normal");
  pdf.setFontSize(9);
  pdf.text(
    `Order ${input.orderId.slice(0, 8).toUpperCase()}`,
    pageW - 16,
    bodyY + 6,
    { align: "right" },
  );
  pdf.text(
    `Ticket ${input.ticketId.slice(0, 8).toUpperCase()}`,
    pageW - 16,
    bodyY + 11,
    { align: "right" },
  );

  // ── QR BLOCK ──
  const qrSize = 80;
  const qrX = (pageW - qrSize) / 2;
  const qrY = bodyY + 28;
  // White card behind QR with subtle border
  pdf.setFillColor(255, 255, 255);
  pdf.setDrawColor(...FAINT);
  pdf.setLineWidth(0.4);
  pdf.roundedRect(qrX - 6, qrY - 6, qrSize + 12, qrSize + 24, 4, 4, "FD");

  try {
    const qrPng = await svgUrlToPngDataUrl(input.qrSvgUrl, 900);
    pdf.addImage(qrPng, "PNG", qrX, qrY, qrSize, qrSize);
  } catch {
    pdf.setTextColor(...MUTED);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.text("QR unavailable", pageW / 2, qrY + qrSize / 2, { align: "center" });
  }

  // QR caption
  pdf.setTextColor(...INK);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9);
  pdf.text("Scan at the door", pageW / 2, qrY + qrSize + 9, { align: "center" });
  pdf.setTextColor(...MUTED);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.text(
    "Nominative · single-use · keep your name and ID matching",
    pageW / 2,
    qrY + qrSize + 14,
    { align: "center" },
  );

  // ── FINE PRINT ──
  const fineY = qrY + qrSize + 30;
  pdf.setDrawColor(...FAINT);
  pdf.setLineWidth(0.2);
  pdf.line(16, fineY, pageW - 16, fineY);

  pdf.setTextColor(...MUTED);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7.5);
  const fineText = [
    "This ticket is personal and non-transferable unless resold through Ticket Safe's marketplace.",
    "Lost or screenshot duplicates will be detected and refused at the door — the first scan wins.",
    "Doors may close before the official end time. Carry photo ID for age-restricted events.",
  ];
  fineText.forEach((line, i) => {
    pdf.text(line, 16, fineY + 5 + i * 4);
  });

  // ── FOOTER ──
  pdf.setDrawColor(...FAINT);
  pdf.setLineWidth(0.2);
  pdf.line(16, pageH - 18, pageW - 16, pageH - 18);

  pdf.setTextColor(...BRAND_BLUE);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.text("TICKET SAFE", 16, pageH - 11, { charSpace: 0.8 });

  pdf.setTextColor(...MUTED);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7.5);
  pdf.text("ticket-safe.eu · contact@ticket-safe.eu", pageW - 16, pageH - 11, { align: "right" });

  // ── SAVE ──
  const fname =
    `ticket-${safeFilename(input.eventTitle)}` +
    (input.ticketTotal > 1 ? `-${input.ticketIndex}of${input.ticketTotal}` : "") +
    ".pdf";
  pdf.save(fname);
}
