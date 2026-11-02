/**
 * CSV writing for exports (RFC 4180, comma separated, CRLF, UTF-8 with a byte-order mark so
 * Excel opens accents correctly). Hand-written on purpose: the project has no CSV library.
 *
 * Pure (no Deno API, no import); unit tested from src/__tests__/csv.test.ts.
 */
export const CSV_BOM = "﻿";
export const CSV_LINE_BREAK = "\r\n";

/** Spreadsheets run a cell that starts with one of these as a formula; a leading apostrophe keeps it as text. */
const FORMULA_START = /^[=+\-@\t\r]/;

/**
 * One cell: numbers and booleans as they are, null/undefined empty, everything else quoted when it
 * holds a comma, a quote, a line break or leading/trailing spaces (quotes doubled inside).
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "boolean") return value ? "yes" : "no";
  const text = value instanceof Date ? value.toISOString() : String(value);
  const needsQuotes = /[",\r\n]/.test(text) || text !== text.trim();
  return needsQuotes ? `"${text.replace(/"/g, '""')}"` : text;
}

/** A free-text cell (a name, an email): same escaping, plus the formula guard. */
export function csvText(value: string | null | undefined): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return csvCell(FORMULA_START.test(text) ? `'${text}` : text);
}

export function csvLine(cells: string[]): string {
  return cells.join(",");
}

/** The whole file: BOM, header line, one line per row, CRLF between lines and after the last one. */
export function buildCsv(header: string[], rows: string[][]): string {
  const lines = [csvLine(header.map(csvCell)), ...rows.map(csvLine)];
  return CSV_BOM + lines.join(CSV_LINE_BREAK) + CSV_LINE_BREAK;
}

/** Money in major units with two decimals ("12.50"), from integer minor units. */
export function csvMoney(cents: number | null | undefined): string {
  if (cents === null || cents === undefined || !Number.isFinite(cents)) return "";
  return (cents / 100).toFixed(2);
}

/** `{event-slug}-sales-{date}.csv`, safe for every file system and HTTP header. */
export function salesCsvFilename(slug: string | null | undefined, date: Date): string {
  const safe = (slug ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${safe || "event"}-sales-${date.toISOString().slice(0, 10)}.csv`;
}
