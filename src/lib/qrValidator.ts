/**
 * Client-side QR utilities.
 *
 * - decodeQRFromImage: Extract QR text from an image file.
 *   Uses html5-qrcode (works in ALL browsers — no BarcodeDetector needed).
 *
 * - isQRTextValid: Quick sanity check before sending to the server.
 *
 * - parseQRPayload: Best-effort parse of raw QR text.
 *
 * NOTE: Actual authenticity verification (HMAC, DB lookup, etc.)
 * is always performed server-side in the submit-listing edge function.
 */

import { Html5Qrcode } from "html5-qrcode";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Decode a QR code from an uploaded image file using html5-qrcode.
 * Works in Chrome, Firefox, Safari, Edge — no BarcodeDetector required.
 *
 * @returns The decoded string, or null if no QR code was detected.
 * @throws  Error on invalid file type / file too large.
 */
export async function decodeQRFromImage(file: File): Promise<string | null> {
  if (!isImageFile(file)) {
    throw new Error("Unsupported file type. Please upload a JPEG, PNG, or WebP image.");
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new Error("Image file is too large (max 10 MB).");
  }

  console.log(
    "[qrValidator] decodeQRFromImage → received:",
    file.name,
    `${(file.size / 1024).toFixed(1)} KB`,
    file.type,
  );

  // html5-qrcode.scanFile() needs a mounted DOM element (even a hidden one).
  const tempId = `_qr_decode_${Date.now()}`;
  const el = document.createElement("div");
  el.id = tempId;
  el.style.cssText = "display:none;position:absolute;left:-9999px;";
  document.body.appendChild(el);

  try {
    const scanner = new Html5Qrcode(tempId, { verbose: false });
    try {
      const result = await scanner.scanFile(file, /* showImage= */ false);
      console.log("[qrValidator] decode success →", result);
      return result;
    } catch (err) {
      // html5-qrcode rejects with a plain string, not an Error object, when
      // no QR code is found.  Log it but return null — the caller handles UI.
      console.warn(
        "[qrValidator] decode failed →",
        err instanceof Error ? err.message : String(err),
      );
      return null;
    }
  } finally {
    try {
      document.body.removeChild(el);
    } catch {
      /* already removed — ignore */
    }
  }
}

/**
 * Quick client-side validation — does not verify signatures.
 * Returns true if the text is long enough to be worth sending to the server.
 */
export function isQRTextValid(text: string): boolean {
  const t = text.trim();
  return t.length >= 5 && t.length <= 10_000;
}

/**
 * Parse a QR payload to extract a display-friendly summary.
 * Pure utility — never used for security decisions.
 */
export interface QRPayloadSummary {
  raw: string;
  type: "jwt" | "json" | "plain";
  fields: Record<string, string>;
}

export function parseQRPayload(text: string): QRPayloadSummary {
  const raw = text.trim();

  const JWT_RE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
  if (JWT_RE.test(raw)) {
    try {
      const payloadB64 = raw.split(".")[1];
      const padded = payloadB64 + "==".slice(0, (4 - (payloadB64.length % 4)) % 4);
      const json = JSON.parse(atob(padded.replace(/-/g, "+").replace(/_/g, "/")));
      return {
        raw,
        type: "jwt",
        fields: Object.fromEntries(
          Object.entries(json as Record<string, unknown>).map(([k, v]) => [k, String(v)]),
        ),
      };
    } catch {
      return { raw, type: "jwt", fields: {} };
    }
  }

  try {
    const json = JSON.parse(raw) as Record<string, unknown>;
    if (typeof json === "object" && json !== null && !Array.isArray(json)) {
      return {
        raw,
        type: "json",
        fields: Object.fromEntries(
          Object.entries(json).map(([k, v]) => [k, String(v)]),
        ),
      };
    }
  } catch {
    // not JSON
  }

  return { raw, type: "plain", fields: { value: raw } };
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function isImageFile(file: File): boolean {
  const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/bmp"];
  return ALLOWED.includes(file.type);
}
