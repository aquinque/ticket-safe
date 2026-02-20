/**
 * Client-side QR utilities.
 *
 * - decodeQRFromImage: Extract QR text from an image file.
 *   Uses the BarcodeDetector Web API (Chrome 88+ / Edge 88+).
 *   Falls back gracefully on unsupported browsers.
 *
 * - parseQRPayload: Best-effort parse of raw QR text.
 *   Returns a typed object if the payload is JSON, otherwise
 *   returns the raw string in a wrapper so callers can display it.
 *
 * - isQRTextValid: Quick client-side sanity check before
 *   sending to the server.
 *
 * NOTE: Actual authenticity verification (HMAC, DB lookup, etc.)
 * is always performed server-side in the submit-listing edge function.
 */

// ---------------------------------------------------------------------------
// BarcodeDetector type shim (not yet in TypeScript lib)
// ---------------------------------------------------------------------------

interface DetectedBarcode {
  rawValue: string;
  format: string;
}

interface BarcodeDetectorConstructor {
  new(options?: { formats?: string[] }): {
    detect(source: ImageBitmapSource): Promise<DetectedBarcode[]>;
  };
  getSupportedFormats(): Promise<string[]>;
}

declare const BarcodeDetector: BarcodeDetectorConstructor | undefined;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Attempt to decode a QR code from an uploaded image file.
 *
 * @param file  An image file (JPEG, PNG, WebP, …) containing a QR code.
 * @returns The decoded string, or null if no QR was found / decoding failed.
 * @throws  Error with a user-friendly message when the browser API is absent.
 */
export async function decodeQRFromImage(file: File): Promise<string | null> {
  if (!isImageFile(file)) {
    throw new Error("Unsupported file type. Please upload a JPEG, PNG, or WebP image.");
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new Error("Image file is too large (max 10 MB).");
  }

  if (typeof BarcodeDetector === "undefined") {
    throw new Error(
      "QR code image detection is not supported in your browser. " +
        "Please use Chrome or Edge, or paste the QR code text directly."
    );
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("Could not read the image. Please try a different file.");
  }

  try {
    const detector = new BarcodeDetector({ formats: ["qr_code"] });
    const results = await detector.detect(bitmap);
    return results[0]?.rawValue ?? null;
  } catch {
    return null;
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
          Object.entries(json as Record<string, unknown>).map(([k, v]) => [k, String(v)])
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
          Object.entries(json).map(([k, v]) => [k, String(v)])
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
