/**
 * externalTicketsCsv — tiny dependency-free CSV parser for the External Ticket
 * Import wizard. The platform deliberately has no CSV library (the door-list
 * export hand-builds CSV too), so we parse here with a small state machine that
 * handles quoted fields, embedded commas/newlines and "" escaping.
 *
 * Expected (flexible) columns: ticket_code, external_reference, ticket_type,
 * original_provider, notes. Header matching is case-insensitive with a few
 * common aliases.
 */
export interface ParsedExternalRow {
  external_code?: string;
  external_reference?: string;
  ticket_type?: string;
  original_provider?: string;
  notes?: string;
}

export interface ParsedCsv {
  rows: ParsedExternalRow[];
  headers: string[];
  rawCount: number;
}

// Map a normalised header to our canonical field.
function canonicalField(header: string): keyof ParsedExternalRow | null {
  const h = header.trim().toLowerCase().replace(/\s+/g, "_");
  if (["ticket_code", "code", "qr", "qr_code", "barcode"].includes(h)) return "external_code";
  if (["external_reference", "reference", "ref", "external_ref"].includes(h)) return "external_reference";
  if (["ticket_type", "type", "category", "tier"].includes(h)) return "ticket_type";
  if (["original_provider", "provider", "source", "club", "partner"].includes(h)) return "original_provider";
  if (["notes", "note", "comment", "comments"].includes(h)) return "notes";
  return null;
}

// Split raw CSV text into a matrix of cells.
function parseMatrix(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  const src = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field); field = "";
    } else if (c === "\n") {
      row.push(field); field = "";
      rows.push(row); row = [];
    } else {
      field += c;
    }
  }
  // flush last field/row
  row.push(field);
  if (row.length > 1 || row[0] !== "") rows.push(row);
  return rows;
}

export function parseExternalTicketsCsv(text: string): ParsedCsv {
  const matrix = parseMatrix(text).filter((r) => r.some((c) => c.trim() !== ""));
  if (matrix.length === 0) return { rows: [], headers: [], rawCount: 0 };

  const headerCells = matrix[0].map((h) => h.trim());
  const fieldMap = headerCells.map(canonicalField);
  const hasKnownHeader = fieldMap.some(Boolean);

  // If no recognisable header, treat the WHOLE file as one column of codes.
  if (!hasKnownHeader) {
    const rows = matrix
      .map((r) => (r[0] ?? "").trim())
      .filter(Boolean)
      .map((code) => ({ external_code: code }));
    return { rows, headers: ["ticket_code"], rawCount: rows.length };
  }

  const rows: ParsedExternalRow[] = [];
  for (let i = 1; i < matrix.length; i++) {
    const cells = matrix[i];
    const obj: ParsedExternalRow = {};
    fieldMap.forEach((field, idx) => {
      if (!field) return;
      const val = (cells[idx] ?? "").trim();
      if (val) obj[field] = val;
    });
    if (Object.keys(obj).length > 0) rows.push(obj);
  }
  return { rows, headers: headerCells, rawCount: rows.length };
}
