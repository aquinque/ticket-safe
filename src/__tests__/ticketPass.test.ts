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

describe("entry times on the ticket", () => {
  it("shows doors, last entry and closing only when the last entry or closing is set", async () => {
    const { entryTimes, renderBuyerEmailText } = await import("../../supabase/functions/replay-order-email/_shared/buyerEmail");
    const none = entryTimes({ doorsAt: "2026-11-06T23:01:00Z" });
    expect(none.cells).toEqual([]);
    expect(none.entryBefore).toBe("");
    const full = entryTimes({ doorsAt: "2026-11-06T23:01:00Z", lastEntryAt: "2026-11-07T01:30:00Z", closesAt: "2026-11-07T04:00:00Z", entryUntil: "2026-11-06T23:30:00Z", timeZone: "Europe/Madrid" });
    expect(full.cells).toEqual([
      { label: "Doors", value: "00:01" },
      { label: "Last entry", value: "02:30" },
      { label: "Closes", value: "05:00" },
    ]);
    expect(full.entryBefore).toBe("00:30");
    const text = renderBuyerEmailText({
      firstName: "Alex", evTitle: "EBS", evDate: "Saturday 7 November", evLocation: "Madrid",
      tickets: [{ holder: "Alex Martin", ticketLine: "Early · €6.00", ref: "TS-1", url: "https://ticket-safe.eu/t/x" }],
      entry: full, totalText: "€6.00", orderRef: "TS-ABC", supportEmail: "help@example.com",
    });
    expect(text).toContain("Last entry: 02:30");
    expect(text).toContain("valid for entry before 00:30");
    expect(text).toContain("https://ticket-safe.eu/t/x");
  });

  it("the email card prints the entry row", () => {
    const html = renderTicketCard({
      idx: 1, total: 1, holder: "A", holderEmail: "", tierName: "Early", evDate: "", evLocation: "", refShort: "TS-1",
      entry: { cells: [{ label: "Closes", value: "05:00" }], entryBefore: "00:30" },
    });
    expect(html).toContain("Closes");
    expect(html).toContain("valid for entry before 00:30");
  });
});
