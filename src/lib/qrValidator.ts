/**
 * Client-side QR utilities.
 *
 * - decodeQRFromFile:  Extract QR text from an image OR a PDF file.
 * - decodeQRFromImage: Extract QR text from an image file (JPEG / PNG / WebP).
 * - decodeQRFromPDF:   Extract QR text from a PDF file (uses pdfjs-dist).
 * - isQRTextValid:     Quick sanity check before sending to the server.
 * - parseQRPayload:    Best-effort parse of raw QR text.
 *
 * Reliability strategy (3 levels):
 *  Level 1 – scan original image/PDF page at default scale
 *  Level 2 – retry with 2× upscale
 *  Level 3 – retry with 3× upscale
 * For PDFs, multiple scales are tried per page before moving to the next.
 *
 * NOTE: Actual authenticity verification (HMAC, DB lookup, etc.)
 * is always performed server-side in the submit-listing edge function.
 */

import { Html5Qrcode } from "html5-qrcode";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

// Initialise PDF worker once (Vite resolves the URL at build time)
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

// ---------------------------------------------------------------------------
// Internal: scan a File object with html5-qrcode
// ---------------------------------------------------------------------------

async function scanFileWithHtml5QR(file: File): Promise<string | null> {
  const tempId = `_qr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const el = document.createElement("div");
  el.id = tempId;
  el.style.cssText = "display:none;position:absolute;left:-9999px;top:-9999px;";
  document.body.appendChild(el);
  try {
    const scanner = new Html5Qrcode(tempId, { verbose: false });
    return await scanner.scanFile(file, /* showImage= */ false).catch(() => null);
  } finally {
    try {
      document.body.removeChild(el);
    } catch {
      /* already removed */
    }
  }
}

// ---------------------------------------------------------------------------
// Internal: upscale an image file via canvas
// ---------------------------------------------------------------------------

async function upscaleImageFile(file: File, factor: number): Promise<File> {
  const img = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * factor);
  canvas.height = Math.round(img.height * factor);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise<File>((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(new File([blob], `up${factor}x_${file.name}`, { type: "image/png" }))
          : reject(new Error("Canvas toBlob returned null")),
      "image/png"
    )
  );
}

// ---------------------------------------------------------------------------
// Public: decode QR from any supported file (routes image vs PDF)
// ---------------------------------------------------------------------------

export async function decodeQRFromFile(file: File): Promise<string | null> {
  if (file.type === "application/pdf") {
    return decodeQRFromPDF(file);
  }
  return decodeQRFromImage(file);
}

// ---------------------------------------------------------------------------
// Public: decode QR from an image file — reliability levels 1-3
// ---------------------------------------------------------------------------

export async function decodeQRFromImage(file: File): Promise<string | null> {
  if (!isImageFile(file)) {
    throw new Error(
      "Unsupported file type. Please upload a JPEG, PNG, WebP image or a PDF."
    );
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new Error("Image is too large (max 10 MB).");
  }

  console.log(
    "[qrValidator] image →",
    file.name,
    `${(file.size / 1024).toFixed(1)} KB`,
    file.type,
  );

  // Level 1: original resolution
  let result = await scanFileWithHtml5QR(file);
  if (result) {
    console.log("[qrValidator] success (L1 original) →", result.slice(0, 80));
    return result;
  }

  // Level 2: 2× upscale — helps when QR is small relative to the ticket
  try {
    const up2x = await upscaleImageFile(file, 2);
    result = await scanFileWithHtml5QR(up2x);
    if (result) {
      console.log("[qrValidator] success (L2 2× upscale) →", result.slice(0, 80));
      return result;
    }
  } catch (e) {
    console.warn("[qrValidator] L2 upscale failed:", e);
  }

  // Level 3: 3× upscale
  try {
    const up3x = await upscaleImageFile(file, 3);
    result = await scanFileWithHtml5QR(up3x);
    if (result) {
      console.log("[qrValidator] success (L3 3× upscale) →", result.slice(0, 80));
      return result;
    }
  } catch (e) {
    console.warn("[qrValidator] L3 upscale failed:", e);
  }

  console.warn("[qrValidator] no QR found in image after 3 attempts");
  return null;
}

// ---------------------------------------------------------------------------
// Public: decode QR from a PDF file (renders each page to canvas, then scans)
// ---------------------------------------------------------------------------

export async function decodeQRFromPDF(file: File): Promise<string | null> {
  if (file.type !== "application/pdf") {
    throw new Error("File is not a PDF.");
  }
  if (file.size > 25 * 1024 * 1024) {
    throw new Error("PDF is too large (max 25 MB).");
  }

  console.log(
    "[qrValidator] PDF →",
    file.name,
    `${(file.size / 1024).toFixed(1)} KB`,
  );

  let pdf: Awaited<ReturnType<typeof pdfjsLib.getDocument>["promise"]>;
  try {
    const arrayBuffer = await file.arrayBuffer();
    pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
  } catch (err) {
    console.warn("[qrValidator] PDF load failed:", err);
    return null;
  }

  const pagesToScan = Math.min(pdf.numPages, 5);

  for (let pageNum = 1; pageNum <= pagesToScan; pageNum++) {
    const page = await pdf.getPage(pageNum);

    // Try multiple render scales per page (higher = better QR readability)
    for (const scale of [3.0, 2.0, 1.5]) {
      try {
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(viewport.width);
        canvas.height = Math.round(viewport.height);
        const ctx = canvas.getContext("2d");
        if (!ctx) continue;

        await page.render({ canvasContext: ctx, viewport }).promise;

        const blob = await new Promise<Blob | null>((res) =>
          canvas.toBlob(res, "image/png")
        );
        if (!blob) continue;

        const pageFile = new File(
          [blob],
          `pdf-p${pageNum}-${scale}x.png`,
          { type: "image/png" }
        );

        const qr = await scanFileWithHtml5QR(pageFile);
        if (qr) {
          console.log(
            "[qrValidator] PDF QR found — page",
            pageNum,
            "scale",
            scale,
            "→",
            qr.slice(0, 80),
          );
          return qr;
        }
      } catch (e) {
        console.warn(`[qrValidator] PDF p${pageNum}@${scale}x failed:`, e);
      }
    }
  }

  console.warn("[qrValidator] no QR found in PDF");
  return null;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

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
      const padded =
        payloadB64 + "==".slice(0, (4 - (payloadB64.length % 4)) % 4);
      const json = JSON.parse(
        atob(padded.replace(/-/g, "+").replace(/_/g, "/"))
      );
      return {
        raw,
        type: "jwt",
        fields: Object.fromEntries(
          Object.entries(json as Record<string, unknown>).map(([k, v]) => [
            k,
            String(v),
          ]),
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
  const ALLOWED = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/bmp",
  ];
  return ALLOWED.includes(file.type);
}
