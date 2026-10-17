/**
 * Text, amount and date helpers for the billing PDFs.
 *
 * Pure (no Deno API, no pdf-lib), so it is unit-tested from the web app's test
 * suite (src/__tests__/billingPdfText.test.ts).
 *
 * The PDFs use pdf-lib's built-in Helvetica, which can only draw Windows-1252
 * ("WinAnsi") characters, and drawText() throws on anything else. A true minus
 * sign, the narrow no-break space Intl puts in "21 044,25" or an emoji in an event
 * title would turn into a 500 instead of a document. So every string that reaches a
 * PDF goes through pdfSafe(), and amounts and dates through the formatters below,
 * which only ever emit characters the font can draw.
 */

const NBSP = " ";
const PARIS = "Europe/Paris";

// The 0x80–0x9F block of Windows-1252, whose characters sit outside Latin-1.
const WIN_ANSI_EXTRA = new Set([
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0x017d,
  0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e, 0x0178,
]);

// Letters that don't decompose into base + accent but have an obvious plain form.
const PLAIN_LETTER: Record<string, string> = { "ł": "l", "Ł": "L", "đ": "d", "Đ": "D", "ı": "i" };

export function isWinAnsi(codePoint: number): boolean {
  return (codePoint >= 0x20 && codePoint <= 0x7e) || (codePoint >= 0xa0 && codePoint <= 0xff) || WIN_ANSI_EXTRA.has(codePoint);
}

/** Makes any string drawable with the built-in PDF fonts, keeping as much of it as possible. */
export function pdfSafe(input: string | null | undefined): string {
  const s = String(input ?? "")
    .normalize("NFC")
    .replace(/[−‐‑‒―]/g, "-") // minus sign and hyphen variants
    .replace(/[ -   　]/g, " ") // exotic spaces, among them Intl's narrow no-break space
    .replace(/[​-‍⁠﻿]/g, "") // zero-width characters
    .replace(/[\r\n\t]+/g, " ");

  let out = "";
  for (const ch of s) {
    if (isWinAnsi(ch.codePointAt(0) as number)) {
      out += ch;
      continue;
    }
    // Outside Windows-1252 (ő, č, ł…): keep the plain letter when there is one; emoji and the like are dropped.
    const plain = PLAIN_LETTER[ch] ?? ch.normalize("NFD").replace(/[̀-ͯ]/g, "");
    if (plain !== ch && [...plain].every((c) => isWinAnsi(c.codePointAt(0) as number))) out += plain;
  }
  return out.replace(/ {2,}/g, " ").trim();
}

/** 2104425 → "21 044,25 €" (non-breaking spaces, so an amount never wraps in the middle). */
export function formatEurFr(cents: number): string {
  const n = Math.round(Number.isFinite(cents) ? cents : 0);
  const abs = Math.abs(n);
  const euros = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  return `${n < 0 ? "-" : ""}${euros},${String(abs % 100).padStart(2, "0")}${NBSP}€`;
}

/** A unit price in cents: to the cent when it is a whole number of cents, to four decimals otherwise ("0,9333 €"). */
export function formatUnitPriceFr(cents: number): string {
  if (Math.abs(cents - Math.round(cents)) < 1e-9) return formatEurFr(cents);
  const [euros, decimals] = (Math.abs(cents) / 100).toFixed(4).split(".");
  return `${cents < 0 ? "-" : ""}${euros.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP)},${decimals}${NBSP}€`;
}

const dateParts = (d: Date, options: Intl.DateTimeFormatOptions, locale: string) =>
  new Intl.DateTimeFormat(locale, { ...options, timeZone: PARIS }).formatToParts(d);

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "1er novembre 2026", in Paris time, whatever the server's time zone. */
export function formatDateFr(value: string | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return "—";
  const parts = dateParts(d, { day: "numeric", month: "long", year: "numeric" }, "fr-FR");
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const day = get("day");
  return `${day === "1" ? "1er" : day} ${get("month")} ${get("year")}`;
}

/** "2026-11-01": the calendar day in Paris, for date columns. */
export function parisDateKey(value: string | Date | null | undefined): string | null {
  const d = toDate(value);
  if (!d) return null;
  const parts = dateParts(d, { year: "numeric", month: "2-digit", day: "2-digit" }, "en-GB");
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
