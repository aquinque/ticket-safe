// Apple Wallet (.pkpass) + Google Wallet bridge.
//
// GET /functions/v1/wallet-pass?ticket=<event_tickets.id>&type=apple|google
//
// Apple: real PKCS#7 signing via node-forge + ZIP via JSZip. Returns a
// downloadable .pkpass file when these env vars are set:
//   APPLE_PASS_TYPE_ID   e.g. pass.eu.ticket-safe.event
//   APPLE_TEAM_ID        10-char Apple Developer team id
//   APPLE_PASS_CERT_PEM  Pass Type ID certificate (PEM, including chain)
//   APPLE_PASS_KEY_PEM   Private key matching the cert (PEM)
// Otherwise returns a friendly HTML fallback so the buyer sees something
// clean instead of a 500. Apple's WWDR intermediate is fetched fresh from
// apple.com on demand and cached in memory.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import forge from "https://esm.sh/node-forge@1.3.1";
import JSZip from "https://esm.sh/jszip@3.10.1";

function fallback(title: string, body: string) {
  return new Response(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head><body style="margin:0;padding:40px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f1f5f9;color:#0f172a"><div style="max-width:480px;margin:0 auto;background:#fff;border-radius:18px;padding:32px;text-align:center;box-shadow:0 8px 32px rgba(15,23,42,.08)"><div style="width:56px;height:56px;background:linear-gradient(135deg,#3a5fe6,#2440b6);border-radius:14px;margin:0 auto 18px;display:flex;align-items:center;justify-content:center;color:#aec6ff;font-weight:900;font-size:22px">TS</div><h1 style="font-size:22px;font-weight:900;margin:0 0 12px">${title}</h1><p style="font-size:14px;line-height:1.55;color:#475569;margin:0 0 18px">${body}</p><a href="https://ticket-safe.eu/my-tickets" style="display:inline-block;background:linear-gradient(135deg,#3a5fe6,#2440b6);color:#fff;padding:12px 22px;border-radius:10px;font-weight:800;text-decoration:none;font-size:14px">Show my QR online</a></div></body></html>`,
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

function hexToRgbString(hex: string | null | undefined): string {
  const h = (hex ?? "#3a5fe6").replace("#", "");
  if (h.length !== 6) return "rgb(58, 95, 230)";
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgb(${r}, ${g}, ${b})`;
}

async function sha1Hex(bytes: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-1", bytes);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

async function deflateBytes(bytes: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream("deflate");
  const writer = cs.writable.getWriter();
  writer.write(bytes);
  writer.close();
  return new Uint8Array(await new Response(cs.readable).arrayBuffer());
}

// Build a valid solid-colour PNG of arbitrary dimensions, no external deps.
// Used as a fallback icon/logo — user can supply branded PNGs via env vars.
async function makeSolidPng(w: number, h: number, r: number, g: number, b: number): Promise<Uint8Array> {
  const sig = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, w); dv.setUint32(4, h);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const rowSize = 1 + w * 3;
  const raw = new Uint8Array(rowSize * h);
  for (let y = 0; y < h; y++) {
    raw[y * rowSize] = 0;
    for (let x = 0; x < w; x++) {
      const i = y * rowSize + 1 + x * 3;
      raw[i] = r; raw[i + 1] = g; raw[i + 2] = b;
    }
  }
  const compressed = await deflateBytes(raw);
  const chunk = (type: string, data: Uint8Array): Uint8Array => {
    const out = new Uint8Array(8 + data.length + 4);
    new DataView(out.buffer).setUint32(0, data.length);
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(data, 8);
    const crcIn = new Uint8Array(4 + data.length);
    for (let i = 0; i < 4; i++) crcIn[i] = type.charCodeAt(i);
    crcIn.set(data, 4);
    new DataView(out.buffer).setUint32(8 + data.length, crc32(crcIn));
    return out;
  };
  const ihdrChunk = chunk("IHDR", ihdr);
  const idatChunk = chunk("IDAT", compressed);
  const iendChunk = chunk("IEND", new Uint8Array(0));
  const out = new Uint8Array(sig.length + ihdrChunk.length + idatChunk.length + iendChunk.length);
  let off = 0;
  out.set(sig, off); off += sig.length;
  out.set(ihdrChunk, off); off += ihdrChunk.length;
  out.set(idatChunk, off); off += idatChunk.length;
  out.set(iendChunk, off);
  return out;
}

function parsePngEnvVar(name: string): Uint8Array | null {
  const v = Deno.env.get(name);
  if (!v) return null;
  try {
    const bin = atob(v.replace(/\s+/g, ""));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  } catch { return null; }
}

let wwdrPemCached: string | null = null;
async function getWwdrPem(): Promise<string | null> {
  if (wwdrPemCached) return wwdrPemCached;
  try {
    const res = await fetch("https://www.apple.com/certificateauthority/AppleWWDRCAG4.cer");
    if (!res.ok) return null;
    const der = new Uint8Array(await res.arrayBuffer());
    let bin = "";
    for (let i = 0; i < der.length; i++) bin += String.fromCharCode(der[i]);
    const b64 = btoa(bin);
    wwdrPemCached = `-----BEGIN CERTIFICATE-----\n${b64.match(/.{1,64}/g)!.join("\n")}\n-----END CERTIFICATE-----\n`;
    return wwdrPemCached;
  } catch (e) { console.error("wwdr fetch failed", e); return null; }
}

serve(async (req) => {
  const url = new URL(req.url);
  const ticketId = url.searchParams.get("ticket");
  const type = (url.searchParams.get("type") ?? "apple").toLowerCase();

  if (!ticketId || !/^[0-9a-f-]{36}$/i.test(ticketId)) {
    return fallback("Missing ticket", "This wallet link is incomplete. Open your account to retrieve the QR.");
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !supabaseKey) return fallback("Server unavailable", "Please try again from your account page.");

  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data: t } = await supabase
    .from("event_tickets")
    .select(`id, event_id, qr_token, status, scanned_at, holder_first_name, holder_last_name, holder_email,
             event:events(id, title, date, location, primary_color),
             tier:event_tiers(name)`)
    .eq("id", ticketId)
    .maybeSingle();

  if (!t) return fallback("Ticket not found", "This ticket link is no longer valid. Open your tickets online to retrieve a fresh one.");
  if (t.status === "refunded" || t.status === "cancelled") {
    return fallback("Ticket no longer valid", "This ticket has been refunded or cancelled. Contact the organiser if you think this is a mistake.");
  }

  if (type === "google") {
    return fallback("Google Wallet coming soon", "We're wiring up Google Wallet. In the meantime open your tickets online — the QR works just as well.");
  }

  if (type !== "apple") return fallback("Unknown wallet", "Use the Apple Wallet or Google Wallet link.");

  const passTypeId = Deno.env.get("APPLE_PASS_TYPE_ID");
  const teamId = Deno.env.get("APPLE_TEAM_ID");
  const certPem = Deno.env.get("APPLE_PASS_CERT_PEM");
  const keyPem = Deno.env.get("APPLE_PASS_KEY_PEM");

  if (!passTypeId || !teamId || !certPem || !keyPem) {
    return fallback(
      "Apple Wallet — setup pending",
      "We're finalising Apple Developer credentials. Open your tickets online to display the QR — it works at the door without Apple Wallet.",
    );
  }

  const wwdrPem = await getWwdrPem();
  if (!wwdrPem) {
    return fallback("Apple Wallet unavailable", "Could not reach Apple's certificate server. Please retry in a moment.");
  }

  const ev = Array.isArray(t.event) ? t.event[0] : (t as { event: { id: string; title: string; date: string | null; location: string | null; primary_color: string | null } | null }).event;
  const tier = Array.isArray(t.tier) ? t.tier[0] : (t as { tier: { name: string | null } | null }).tier;

  const holder = [t.holder_first_name, t.holder_last_name].filter(Boolean).join(" ").trim();
  const refShort = `TS-${t.id.slice(0, 4).toUpperCase()}-${t.id.slice(-4).toUpperCase()}`;
  const evDate = ev?.date
    ? new Date(ev.date).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
    : "—";

  const pass = {
    formatVersion: 1,
    passTypeIdentifier: passTypeId,
    serialNumber: t.id,
    teamIdentifier: teamId,
    organizationName: "Ticket Safe",
    description: `Ticket for ${ev?.title ?? "an event"}`,
    logoText: "Ticket Safe",
    foregroundColor: "rgb(255, 255, 255)",
    backgroundColor: hexToRgbString(ev?.primary_color ?? "#3a5fe6"),
    labelColor: "rgb(174, 198, 255)",
    eventTicket: {
      primaryFields: [{ key: "event", label: "EVENT", value: ev?.title ?? "Event" }],
      secondaryFields: [
        { key: "date", label: "DATE", value: evDate },
        ...(ev?.location ? [{ key: "location", label: "LOCATION", value: ev.location }] : []),
      ],
      auxiliaryFields: [
        ...(holder ? [{ key: "holder", label: "ATTENDEE", value: holder }] : []),
        ...(tier?.name ? [{ key: "tier", label: "TIER", value: tier.name }] : []),
      ],
      backFields: [
        { key: "ref", label: "Reference", value: refShort },
        { key: "info", label: "Ticket Safe", value: "Show this QR at the door. Single-use. Visit ticket-safe.eu/my-tickets for a fresh copy." },
        { key: "support", label: "Need help?", value: "Email ticketsafe.friendly@gmail.com" },
      ],
    },
    barcodes: [{
      format: "PKBarcodeFormatQR",
      message: t.qr_token,
      messageEncoding: "iso-8859-1",
      altText: refShort,
    }],
  };

  const hex = (ev?.primary_color ?? "#3a5fe6").replace("#", "");
  const rr = parseInt(hex.slice(0, 2), 16) || 58;
  const gg = parseInt(hex.slice(2, 4), 16) || 95;
  const bb = parseInt(hex.slice(4, 6), 16) || 230;

  const icon29 = parsePngEnvVar("APPLE_WALLET_ICON_29_BASE64") ?? await makeSolidPng(29, 29, rr, gg, bb);
  const icon58 = parsePngEnvVar("APPLE_WALLET_ICON_58_BASE64") ?? await makeSolidPng(58, 58, rr, gg, bb);
  const icon87 = parsePngEnvVar("APPLE_WALLET_ICON_87_BASE64") ?? await makeSolidPng(87, 87, rr, gg, bb);
  const logo160 = parsePngEnvVar("APPLE_WALLET_LOGO_160_BASE64") ?? await makeSolidPng(160, 50, rr, gg, bb);
  const logo320 = parsePngEnvVar("APPLE_WALLET_LOGO_320_BASE64") ?? await makeSolidPng(320, 100, rr, gg, bb);

  const files: Record<string, Uint8Array> = {
    "pass.json": new TextEncoder().encode(JSON.stringify(pass)),
    "icon.png": icon29,
    "icon@2x.png": icon58,
    "icon@3x.png": icon87,
    "logo.png": logo160,
    "logo@2x.png": logo320,
  };

  const manifest: Record<string, string> = {};
  for (const [name, bytes] of Object.entries(files)) {
    manifest[name] = await sha1Hex(bytes);
  }
  const manifestJson = JSON.stringify(manifest);

  let signatureBytes: Uint8Array;
  try {
    const passKey = forge.pki.privateKeyFromPem(keyPem);
    const passCert = forge.pki.certificateFromPem(certPem);
    const wwdrCert = forge.pki.certificateFromPem(wwdrPem);
    const p7 = forge.pkcs7.createSignedData();
    p7.content = forge.util.createBuffer(manifestJson, "utf8");
    p7.addCertificate(passCert);
    p7.addCertificate(wwdrCert);
    p7.addSigner({
      key: passKey,
      certificate: passCert,
      digestAlgorithm: forge.pki.oids.sha1,
      authenticatedAttributes: [
        { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
        { type: forge.pki.oids.messageDigest },
        { type: forge.pki.oids.signingTime, value: new Date() },
      ],
    });
    p7.sign({ detached: true });
    const der = forge.asn1.toDer(p7.toAsn1()).getBytes();
    signatureBytes = new Uint8Array(der.length);
    for (let i = 0; i < der.length; i++) signatureBytes[i] = der.charCodeAt(i);
  } catch (e) {
    console.error("pkpass sign failed", e);
    return fallback("Apple Wallet signing failed", "Your Apple Developer credentials seem malformed. Reply to this email and we'll look at it.");
  }

  const zip = new JSZip();
  for (const [name, bytes] of Object.entries(files)) zip.file(name, bytes);
  zip.file("manifest.json", manifestJson);
  zip.file("signature", signatureBytes);
  const pkpass = await zip.generateAsync({ type: "uint8array" });

  return new Response(pkpass, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.apple.pkpass",
      "Content-Disposition": `attachment; filename="ticket-${t.id.slice(0, 8)}.pkpass"`,
      "Cache-Control": "private, no-cache",
    },
  });
});
