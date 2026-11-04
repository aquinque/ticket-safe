import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { ticketRef, ticketStripDate } from "@/components/tickets/TicketPass";
import { renderTicketCard, stripDate } from "../../supabase/functions/replay-order-email/_shared/buyerEmail";

describe("ticket design shared by the site, the email and the PDF", () => {
  it("reference and date strip", () => {
    expect(ticketRef("4f2a1b2c-0000-4000-8000-0000000091a0")).toBe("TS-4F2A-91A0");
    expect(stripDate("2026-12-14T22:00:00Z", "Europe/Paris")).toBe("MON 14 DEC · 23:00");
    expect(stripDate("2026-12-14T22:00:00Z", "Europe/London")).toBe("MON 14 DEC · 22:00");
    expect(stripDate(null)).toBe("");
    expect(ticketStripDate("not a date")).toBe("");
  });

  it("the email ticket shows the picture, the strip, name, ticket and a live QR", () => {
    const html = renderTicketCard({
      idx: 1, total: 2, holder: "Alex Martin", holderEmail: "", tierName: "Regular", evDate: "", evLocation: "The Warehouse",
      refShort: "TS-4F2A-91A0", ticketUrl: "https://ticket-safe.eu/t/abc", evTitle: "Neon Night", bannerUrl: "https://x/banner.jpg",
      accent: "#e8613c", stripText: "MON 14 DEC · 23:00", priceLabel: "€14.00",
      qrImageUrl: "https://p.supabase.co/functions/v1/ticket-access?t=abc&qr=png",
    });
    for (const part of ["Ticket 1 of 2", "https://x/banner.jpg", "MON 14 DEC · 23:00", "The Warehouse", "Alex Martin", "Regular · €14.00", "ticket-access?t=abc&amp;qr=png", "TS-4F2A-91A0", "Open my ticket"]) {
      expect(html).toContain(part);
    }
    // no picture: the title on the event's colour; no link: the PDF stands in for the QR
    const plain = renderTicketCard({ idx: 1, total: 1, holder: "", holderEmail: "", tierName: "Regular", evDate: "", evLocation: "", refShort: "TS-1", evTitle: "<Neon>", accent: "javascript:x", qrImageUrl: null });
    expect(plain).toContain("&lt;Neon&gt;");
    expect(plain).toContain("background:#3a5fe6");
    expect(plain).toContain("Your QR code is on the attached PDF");
    expect(plain).not.toContain("Ticket 1 of 1");
  });

  it("ticket-access serves the QR image only for a valid ticket, outside the rate limit", () => {
    const src = readFileSync("supabase/functions/ticket-access/index.ts", "utf8");
    expect(src).toContain('searchParams.get("qr") === "png"');
    expect(src).toContain('qr_token: t.status === "valid" ? t.qr_token : null');
    expect(src).toMatch(/if \(!qrImage\) try/);
  });
});
