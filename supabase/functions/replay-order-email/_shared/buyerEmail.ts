import { escapeHtmlText as esc, moneyText } from "./receiptLegal.ts";
// The ticket in the email, drawn like the ticket on My Tickets and on the guest ticket page
// (src/components/tickets/TicketPass.tsx): the event's picture (or its title on its colour), a black
// strip with the date and the venue, NAME and TICKET, the QR and its reference.
//
// The QR is an image served by ticket-access from the ticket's own link (`qrImageUrl`): it is read
// again whenever the email is opened, so a ticket that has been used, refunded or resold shows a grey
// square instead of a stale code. The same QR is on the attached PDF and on the "Open my ticket" page.
// `appleWalletUrl` is only passed when the wallet-pass function can actually sign a .pkpass.
export function stripDate(iso: string | null | undefined, timeZone = "Europe/Paris"): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const day = d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone }).replace(/,/g, "");
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone });
  return `${day} · ${time}`.toUpperCase();
}
/** "00:30" in the event's time zone; "" when there is no time. */
export function clockText(iso: string | null | undefined, timeZone = "Europe/Paris"): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone });
}
/**
 * The entry times printed on the ticket, as on the site (TicketPass ticketEntryTimes): doors, last entry and
 * closing when the last entry or the closing time is set, and the tier's own "entry before" (early entry).
 */
export function entryTimes(o: { doorsAt?: string | null; lastEntryAt?: string | null; closesAt?: string | null; entryUntil?: string | null; timeZone?: string }) {
  const tz = o.timeZone ?? "Europe/Paris";
  const doors = clockText(o.doorsAt, tz);
  const lastEntry = clockText(o.lastEntryAt, tz);
  const closes = clockText(o.closesAt, tz);
  const cells = lastEntry || closes
    ? [
        ...(doors ? [{ label: "Doors", value: doors }] : []),
        ...(lastEntry ? [{ label: "Last entry", value: lastEntry }] : []),
        ...(closes ? [{ label: "Closes", value: closes }] : []),
      ]
    : [];
  return { cells, entryBefore: clockText(o.entryUntil, tz) };
}
export function renderTicketCard(o: {
  idx: number; total: number; holder: string; holderEmail: string; tierName: string; evDate: string; evLocation: string; refShort: string;
  appleWalletUrl?: string | null; ticketUrl?: string;
  evTitle?: string; bannerUrl?: string | null; accent?: string | null; stripText?: string; priceLabel?: string | null; qrImageUrl?: string | null;
  entry?: { cells: { label: string; value: string }[]; entryBefore: string };
}): string {
  const { idx, total, holder, holderEmail, tierName, evLocation, refShort, appleWalletUrl, ticketUrl, evTitle, bannerUrl, accent, stripText, priceLabel, qrImageUrl, entry } = o;
  const bg = /^#[0-9a-f]{3,8}$/i.test(accent ?? "") ? accent! : "#3a5fe6";
  const label = "font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#64748b";
  const value = "font-size:15px;font-weight:800;color:#0f172a;line-height:1.3;margin-top:3px";
  const ticketLine = [tierName, priceLabel].filter(Boolean).join(" · ");
  const picture = bannerUrl
    ? `<img src="${esc(bannerUrl)}" alt="" width="520" style="display:block;width:100%;max-width:520px;height:auto;border:0">`
    : `<div style="padding:30px 18px 18px"><div style="font-size:10px;font-weight:800;letter-spacing:.2em;text-transform:uppercase;color:rgba(255,255,255,.8)">TicketSafe</div><div style="margin-top:6px;font-size:32px;font-weight:900;line-height:.95;letter-spacing:-.02em;text-transform:uppercase;color:#fff">${esc(evTitle ?? "")}</div></div>`;
  const cells = entry?.cells ?? [];
  const entryRow = cells.length || entry?.entryBefore
    ? `<tr><td style="padding:12px 16px;border-top:1px solid #e2e8f0">
    ${cells.length ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr>${cells.map((c) => `<td width="${Math.floor(100 / cells.length)}%" valign="top"><div style="${label}">${esc(c.label)}</div><div style="${value}">${esc(c.value)}</div></td>`).join("")}</tr></table>` : ""}
    ${entry?.entryBefore ? `<div style="${cells.length ? "margin-top:10px;" : ""}background:#fef3c7;color:#78350f;font-size:13px;font-weight:800;padding:8px 12px">This ticket is valid for entry before ${esc(entry.entryBefore)}</div>` : ""}
  </td></tr>`
    : "";
  const qr = qrImageUrl
    ? `<img src="${esc(qrImageUrl)}" alt="Your ticket QR code" width="220" height="220" style="display:block;margin:0 auto;width:220px;height:220px;border:0">`
    : `<div style="padding:24px 0;font-size:13px;color:#475569">Your QR code is on the attached PDF.</div>`;
  return `
${total > 1 ? `<div style="margin:0 0 8px;font-size:11px;font-weight:800;letter-spacing:.18em;text-transform:uppercase;color:#64748b">Ticket ${idx} of ${total}</div>` : ""}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;margin:0 0 20px;background:#ffffff;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden">
  <tr><td style="padding:0;background:${bg};line-height:0">${picture}</td></tr>
  <tr><td style="padding:9px 16px;background:#0b0b0f">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr>
      <td style="font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#ffffff;white-space:nowrap">${esc(stripText ?? "")}</td>
      <td align="right" style="font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#ffffff">${esc(evLocation)}</td>
    </tr></table>
  </td></tr>
  <tr><td style="padding:14px 16px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr>
      <td width="50%" valign="top" style="padding-right:8px"><div style="${label}">Name</div><div style="${value}">${esc(holder || "—")}</div>${holderEmail ? `<div style="font-size:12px;color:#64748b;margin-top:2px">${esc(holderEmail)}</div>` : ""}</td>
      <td width="50%" valign="top" style="padding-left:8px"><div style="${label}">Ticket</div><div style="${value}">${esc(ticketLine || "—")}</div></td>
    </tr></table>
  </td></tr>
  ${entryRow}
  <tr><td style="padding:20px 16px 18px;border-top:1px solid #e2e8f0;text-align:center">
    ${qr}
    <div style="margin-top:10px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:11px;letter-spacing:.12em;color:#64748b">${refShort}</div>
    ${ticketUrl ? `<div style="margin-top:16px"><a href="${ticketUrl}" style="display:block;background:#3a5fe6;color:#ffffff;text-decoration:none;border-radius:6px;padding:12px 0;text-align:center;font-weight:800;font-size:14px">Open my ticket</a></div>` : ""}
    ${appleWalletUrl ? `<div style="margin-top:10px"><a href="${appleWalletUrl}" style="display:block;background:#000000;color:#ffffff;text-decoration:none;border-radius:6px;padding:11px 0;text-align:center;font-weight:700;font-size:13px">Add to Apple Wallet</a></div>` : ""}
  </td></tr>
</table>`;
}
// `totalCents` is in the order's currency (`currency`: 'EUR' or 'GBP', euros when absent).
export function renderBuyerEmail(o: { firstName: string; evTitle: string; evDate: string; evLocation: string; tierName: string; totalCents: number; currency?: string | null; ticketBlocksHtml: string; qty: number; summaryHtml?: string; legalHtml?: string; }): string {
  const { firstName, evTitle, evDate, evLocation, tierName, totalCents, currency, ticketBlocksHtml, qty, summaryHtml, legalHtml } = o;
  const hi = firstName ? `Hi ${esc(firstName)},` : `Hi,`;
  // Without a payment summary (older callers) the e-mail keeps its three-row recap.
  const totals = summaryHtml ?? `<table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:18px;border-top:1px solid #e2e8f0;padding-top:18px">
      <tr><td style="padding:5px 0;color:#64748b;width:42%">Tier</td><td style="padding:5px 0;color:#1e293b;font-weight:600">${esc(tierName)}</td></tr>
      <tr><td style="padding:5px 0;color:#64748b">Number of tickets</td><td style="padding:5px 0;color:#1e293b;font-weight:600">${qty}</td></tr>
      <tr><td style="padding:5px 0;color:#64748b">Total paid</td><td style="padding:5px 0;color:#2440b6;font-weight:800">${moneyText(totalCents, "en", currency)}</td></tr>
    </table>`;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
<div style="max-width:560px;margin:32px auto;background:transparent">
  <div style="background:linear-gradient(135deg,#3a5fe6,#2440b6);border-radius:22px;padding:32px 28px;text-align:center;color:#fff">
    <table cellpadding="0" cellspacing="0" style="margin:0 auto 18px"><tr><td style="background:rgba(255,255,255,.14);border-radius:16px;width:64px;height:64px;text-align:center;vertical-align:middle"><div style="color:#aec6ff;font-weight:900;font-size:24px;line-height:64px;letter-spacing:.04em">TS</div></td></tr></table>
    <div style="font-size:11px;text-transform:uppercase;letter-spacing:.22em;opacity:.85;font-weight:700;margin-bottom:8px">Ticket Safe</div>
    <h1 style="margin:0;font-size:26px;font-weight:900;line-height:1.25">${hi}<br>${qty > 1 ? `here are your tickets!` : `here’s your ticket!`}</h1>
    <p style="margin:12px 0 0;font-size:15px;opacity:.94;line-height:1.5">Enjoy <strong>${esc(evTitle)}</strong> — show the QR below at the door. It's also attached as a PDF.</p>
  </div>
  <div style="background:#fff;border-radius:22px;margin-top:18px;padding:26px 22px;box-shadow:0 12px 40px rgba(15,23,42,.10)">
    <div style="text-align:center;margin-bottom:18px">
      <h2 style="margin:0;font-size:18px;font-weight:900;color:#0f172a;line-height:1.25">${esc(evTitle)}</h2>
      <p style="margin:6px 0 0;font-size:13px;color:#64748b">${esc(evDate)}${evLocation ? ` · ${esc(evLocation)}` : ""}</p>
      <p style="margin:6px 0 0;font-size:13px;color:#64748b">${esc(tierName)}</p>
      <p style="margin:12px 0 0;display:inline-block;background:#eef2ff;color:#2440b6;font-weight:800;font-size:12px;padding:7px 14px;border-radius:999px">Your ticket${qty > 1 ? "s are" : " is"} also attached as a PDF</p>
    </div>
    ${ticketBlocksHtml}
    ${totals}
    <p style="margin:24px 0 6px;text-align:center"><a href="https://ticket-safe.eu/my-tickets" style="display:inline-block;background:linear-gradient(135deg,#3a5fe6,#2440b6);color:#fff;padding:14px 30px;border-radius:12px;text-decoration:none;font-weight:800;font-size:14px">Open My Tickets online</a></p>
    <p style="margin:14px 0 0;font-size:11px;color:#94a3b8;text-align:center;line-height:1.5">Each QR is single-use and checked at the door. It's also on the attached PDF and on your ticket page.<br>Need help — just reply to this email.</p>
  </div>
  <div style="text-align:center;padding:24px 16px 8px">
    <p style="margin:0;font-size:11px;color:#94a3b8"><strong style="color:#475569">Ticket Safe</strong> · The safe way to buy and resell student event tickets</p>
    <p style="margin:6px 0 0;font-size:11px;color:#94a3b8"><a href="https://ticket-safe.eu" style="color:#3a5fe6;text-decoration:none">ticket-safe.eu</a> · <a href="https://ticket-safe.eu/privacy" style="color:#94a3b8;text-decoration:none">Privacy</a> · <a href="https://ticket-safe.eu/terms" style="color:#94a3b8;text-decoration:none">Terms</a></p>
  </div>
  ${legalHtml ? `<div style="padding:4px 16px 0">${legalHtml}</div>` : ""}
</div></body></html>`;
}
/** The same email as plain text, sent alongside the HTML (mail clients and spam filters expect both). */
export function renderBuyerEmailText(o: {
  firstName: string; evTitle: string; evDate: string; evLocation: string;
  tickets: { holder: string; ticketLine: string; ref: string; url: string }[];
  entry?: { cells: { label: string; value: string }[]; entryBefore: string };
  totalText: string; orderRef: string; supportEmail: string;
}): string {
  const lines: string[] = [];
  lines.push(o.firstName ? `Hi ${o.firstName},` : "Hi,", "");
  lines.push(`Here ${o.tickets.length > 1 ? "are your tickets" : "is your ticket"} for ${o.evTitle}.`);
  lines.push(`${o.evDate}${o.evLocation ? ` · ${o.evLocation}` : ""}`);
  if (o.entry?.cells.length) lines.push(o.entry.cells.map((c) => `${c.label}: ${c.value}`).join(" · "));
  if (o.entry?.entryBefore) lines.push(`This ticket is valid for entry before ${o.entry.entryBefore}.`);
  lines.push("");
  o.tickets.forEach((t, i) => {
    lines.push(`${o.tickets.length > 1 ? `Ticket ${i + 1} of ${o.tickets.length}` : "Your ticket"}: ${t.holder || "—"} · ${t.ticketLine} · ${t.ref}`);
    if (t.url) lines.push(`Open it (QR code to show at the door): ${t.url}`);
  });
  lines.push("", "Your ticket is also attached as a PDF. Each QR is single-use and checked at the door.");
  lines.push("", `Total paid: ${o.totalText} · Order ${o.orderRef}`);
  lines.push("", "All your tickets: https://ticket-safe.eu/my-tickets");
  lines.push(`Questions? Reply to this email or write to ${o.supportEmail}.`, "", "Ticket Safe · ticket-safe.eu");
  return lines.join("\n");
}
export function buildTicketUrls(supabaseUrl: string, ticketId: string): { apple: string } {
  const base = supabaseUrl.replace(/\/+$/, "");
  return { apple: `${base}/functions/v1/wallet-pass?ticket=${ticketId}&type=apple` };
}
// Mirrors the check in wallet-pass/index.ts: the Apple button is only worth
// showing when the pass can really be signed. Secrets are project-wide, so
// this function sees the same env as wallet-pass.
export function appleWalletConfigured(): boolean {
  return ["APPLE_PASS_TYPE_ID", "APPLE_TEAM_ID", "APPLE_PASS_CERT_PEM", "APPLE_PASS_KEY_PEM"].every((k) => !!Deno.env.get(k));
}
export function deriveFirstName(buyerEmail: string, profileFullName: string | null): string {
  if (profileFullName && profileFullName.trim()) return profileFullName.trim().split(/\s+/)[0];
  const local = (buyerEmail.split("@")[0] ?? "").replace(/[._-]+/g, " ").trim();
  if (!local) return "";
  return local.charAt(0).toUpperCase() + local.slice(1);
}
