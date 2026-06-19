export function renderTicketCard(o: { idx: number; total: number; holder: string; holderEmail: string; tierName: string; evDate: string; evLocation: string; qrUrl: string; refShort: string; appleWalletUrl: string; googleWalletUrl: string; }): string {
  const { idx, total, holder, holderEmail, tierName, evDate, evLocation, qrUrl, refShort, appleWalletUrl, googleWalletUrl } = o;
  return `
<div style="margin:0 0 18px;border:1px solid #e2e8f0;border-radius:18px;overflow:hidden;background:#fff;box-shadow:0 4px 14px rgba(15,23,42,.04)">
  <div style="background:#0F172A;color:#fff;padding:14px 20px">
    <table style="width:100%;border-collapse:collapse"><tr>
      <td style="font-size:10px;letter-spacing:.18em;text-transform:uppercase;font-weight:800;opacity:.85">Ticket ${idx} of ${total}</td>
      <td style="text-align:right"><span style="font-size:11px;font-weight:700;background:rgba(255,255,255,.14);padding:4px 10px;border-radius:999px">${tierName}</span></td>
    </tr></table>
  </div>
  <div style="padding:22px;text-align:center">
    ${holder ? `<div style="font-size:21px;font-weight:900;color:#0f172a;line-height:1.2">${holder}</div>` : ""}
    ${holderEmail ? `<div style="font-size:12px;color:#64748b;margin-top:2px">${holderEmail}</div>` : ""}
    <div style="margin:20px auto 8px;padding:14px;background:#fff;border:1px solid #e2e8f0;border-radius:18px;display:inline-block">
      <img src="${qrUrl}" alt="Ticket ${idx} QR" width="260" height="260" style="display:block;width:260px;height:260px;border:0;outline:none;text-decoration:none">
    </div>
    <div style="font-size:11px;color:#94a3b8;font-family:ui-monospace,Menlo,monospace;letter-spacing:.05em;margin-top:4px">REF · ${refShort}</div>
    <div style="margin-top:18px;padding:14px;background:#f1f5f9;border-radius:12px;text-align:left;font-size:13px;line-height:1.5;color:#475569">
      <div style="font-weight:800;color:#0f172a;margin-bottom:4px;font-size:11px;text-transform:uppercase;letter-spacing:.14em">When &amp; where</div>
      ${evDate}${evLocation ? `<br>${evLocation}` : ""}
    </div>
    <table style="width:100%;border-collapse:collapse;margin-top:16px"><tr>
      <td style="padding:0 4px 0 0;width:50%">
        <a href="${appleWalletUrl}" style="display:block;background:#000;color:#fff;text-decoration:none;border-radius:10px;padding:11px 0;text-align:center;font-weight:700;font-size:13px">  Add to Apple Wallet</a>
      </td>
      <td style="padding:0 0 0 4px;width:50%">
        <a href="${googleWalletUrl}" style="display:block;background:#fff;border:1.5px solid #0f172a;color:#0f172a;text-decoration:none;border-radius:10px;padding:10px 0;text-align:center;font-weight:700;font-size:13px">Add to Google Wallet</a>
      </td>
    </tr></table>
    <div style="font-size:11px;color:#64748b;margin-top:14px;font-weight:600">Single-use · checked at the door</div>
  </div>
</div>`;
}
export function renderBuyerEmail(o: { firstName: string; evTitle: string; evDate: string; evLocation: string; tierName: string; totalEUR: number; ticketBlocksHtml: string; qty: number; }): string {
  const { firstName, evTitle, evDate, evLocation, tierName, totalEUR, ticketBlocksHtml, qty } = o;
  const hi = firstName ? `Hi ${firstName},` : `Hi,`;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
<div style="max-width:560px;margin:32px auto;background:transparent">
  <div style="background:linear-gradient(135deg,#3a5fe6,#2440b6);border-radius:22px;padding:32px 28px;text-align:center;color:#fff">
    <table cellpadding="0" cellspacing="0" style="margin:0 auto 18px"><tr><td style="background:rgba(255,255,255,.14);border-radius:16px;width:64px;height:64px;text-align:center;vertical-align:middle"><div style="color:#aec6ff;font-weight:900;font-size:24px;line-height:64px;letter-spacing:.04em">TS</div></td></tr></table>
    <div style="font-size:11px;text-transform:uppercase;letter-spacing:.22em;opacity:.85;font-weight:700;margin-bottom:8px">Ticket Safe</div>
    <h1 style="margin:0;font-size:26px;font-weight:900;line-height:1.25">${hi}<br>${qty > 1 ? `here are your tickets!` : `here’s your ticket!`}</h1>
    <p style="margin:12px 0 0;font-size:15px;opacity:.94;line-height:1.5">Enjoy <strong>${evTitle}</strong> — show the QR at the door.</p>
  </div>
  <div style="background:#fff;border-radius:22px;margin-top:18px;padding:26px 22px;box-shadow:0 12px 40px rgba(15,23,42,.10)">
    <div style="text-align:center;margin-bottom:18px">
      <h2 style="margin:0;font-size:18px;font-weight:900;color:#0f172a;line-height:1.25">${evTitle}</h2>
      <p style="margin:6px 0 0;font-size:13px;color:#64748b">${evDate}${evLocation ? ` · ${evLocation}` : ""}</p>
    </div>
    ${ticketBlocksHtml}
    <table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:18px;border-top:1px solid #e2e8f0;padding-top:18px">
      <tr><td style="padding:5px 0;color:#64748b;width:42%">Tier</td><td style="padding:5px 0;color:#1e293b;font-weight:600">${tierName}</td></tr>
      <tr><td style="padding:5px 0;color:#64748b">Number of tickets</td><td style="padding:5px 0;color:#1e293b;font-weight:600">${qty}</td></tr>
      <tr><td style="padding:5px 0;color:#64748b">Total paid</td><td style="padding:5px 0;color:#2440b6;font-weight:800">€${totalEUR.toFixed(2)}</td></tr>
    </table>
    <p style="margin:24px 0 6px;text-align:center"><a href="https://ticket-safe.eu/my-tickets" style="display:inline-block;background:linear-gradient(135deg,#3a5fe6,#2440b6);color:#fff;padding:14px 30px;border-radius:12px;text-decoration:none;font-weight:800;font-size:14px">Open My Tickets online</a></p>
    <p style="margin:14px 0 0;font-size:11px;color:#94a3b8;text-align:center;line-height:1.5">Trouble scanning from the email? Open the link above to display the QR from your phone screen.<br>Need help — just reply to this email.</p>
  </div>
  <div style="text-align:center;padding:24px 16px 8px">
    <p style="margin:0;font-size:11px;color:#94a3b8"><strong style="color:#475569">Ticket Safe</strong> · The safe way to buy and resell student event tickets</p>
    <p style="margin:6px 0 0;font-size:11px;color:#94a3b8"><a href="https://ticket-safe.eu" style="color:#3a5fe6;text-decoration:none">ticket-safe.eu</a> · <a href="https://ticket-safe.eu/privacy" style="color:#94a3b8;text-decoration:none">Privacy</a> · <a href="https://ticket-safe.eu/terms" style="color:#94a3b8;text-decoration:none">Terms</a></p>
  </div>
</div></body></html>`;
}
export function buildTicketUrls(supabaseUrl: string, ticketId: string): { qr: string; apple: string; google: string } {
  const base = supabaseUrl.replace(/\/+$/, "");
  return { qr: `${base}/functions/v1/ticket-qr-public?ticket=${ticketId}&size=600`, apple: `${base}/functions/v1/wallet-pass?ticket=${ticketId}&type=apple`, google: `${base}/functions/v1/wallet-pass?ticket=${ticketId}&type=google` };
}
export function deriveFirstName(buyerEmail: string, profileFullName: string | null): string {
  if (profileFullName && profileFullName.trim()) return profileFullName.trim().split(/\s+/)[0];
  const local = (buyerEmail.split("@")[0] ?? "").replace(/[._-]+/g, " ").trim();
  if (!local) return "";
  return local.charAt(0).toUpperCase() + local.slice(1);
}
