import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { buildCsv, CSV_BOM, csvCell, csvLine, csvMoney, csvText, salesCsvFilename } from "../../supabase/functions/_shared/csv.ts";

describe("csvCell", () => {
  it("leaves plain text, numbers and empty values alone", () => {
    expect(csvCell("Midnight Party")).toBe("Midnight Party");
    expect(csvCell(12)).toBe("12");
    expect(csvCell(0)).toBe("0");
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
    expect(csvCell(NaN)).toBe("");
    expect(csvCell(true)).toBe("yes");
    expect(csvCell(false)).toBe("no");
  });

  it("quotes a cell holding a comma", () => {
    expect(csvCell("Doe, Jane")).toBe('"Doe, Jane"');
  });

  it("doubles the quotes inside a quoted cell", () => {
    expect(csvCell('The "Big" Night')).toBe('"The ""Big"" Night"');
  });

  it("quotes line breaks and leading or trailing spaces", () => {
    expect(csvCell("line 1\nline 2")).toBe('"line 1\nline 2"');
    expect(csvCell("a\r\nb")).toBe('"a\r\nb"');
    expect(csvCell(" padded ")).toBe('" padded "');
  });

  it("writes dates as ISO 8601", () => {
    expect(csvCell(new Date("2026-11-07T03:00:00Z"))).toBe("2026-11-07T03:00:00.000Z");
  });
});

describe("csvText", () => {
  it("keeps accents as they are", () => {
    expect(csvText("Éloïse Müller")).toBe("Éloïse Müller");
  });

  it("neutralises a cell a spreadsheet would run as a formula", () => {
    expect(csvText("=HYPERLINK(\"x\")")).toBe("\"'=HYPERLINK(\"\"x\"\")\"");
    expect(csvText("+33 6 12")).toBe("'+33 6 12");
    expect(csvText("-1")).toBe("'-1");
    expect(csvText("@me")).toBe("'@me");
  });

  it("is empty for a missing value", () => {
    expect(csvText(null)).toBe("");
    expect(csvText(undefined)).toBe("");
  });
});

describe("buildCsv", () => {
  it("starts with the UTF-8 byte-order mark and separates lines with CRLF", () => {
    const csv = buildCsv(["a", "b"], [["1", "2"], ['"x, y"', ""]]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.startsWith(CSV_BOM)).toBe(true);
    expect(csv).toBe('﻿a,b\r\n1,2\r\n"x, y",\r\n');
  });

  it("quotes header cells that need it", () => {
    expect(csvLine(["Order id", "Buyer, name"].map(csvCell))).toBe('Order id,"Buyer, name"');
  });

  it("writes an empty file as the header alone", () => {
    expect(buildCsv(["only"], [])).toBe("﻿only\r\n");
  });
});

describe("csvMoney", () => {
  it("writes cents as major units with two decimals", () => {
    expect(csvMoney(1250)).toBe("12.50");
    expect(csvMoney(0)).toBe("0.00");
    expect(csvMoney(5)).toBe("0.05");
    expect(csvMoney(null)).toBe("");
  });
});

describe("salesCsvFilename", () => {
  const day = new Date("2026-11-07T10:00:00Z");

  it("follows {event-slug}-sales-{date}.csv", () => {
    expect(salesCsvFilename("midnight-party", day)).toBe("midnight-party-sales-2026-11-07.csv");
  });

  it("makes any slug safe for a file name and an HTTP header", () => {
    expect(salesCsvFilename("Soirée d'été / 2026", day)).toBe("soiree-d-ete-2026-sales-2026-11-07.csv");
    expect(salesCsvFilename("", day)).toBe("event-sales-2026-11-07.csv");
    expect(salesCsvFilename(null, day)).toBe("event-sales-2026-11-07.csv");
  });
});

describe("the module", () => {
  it("stays importable by Deno and by vitest alike (no import, no Deno API)", () => {
    const source = readFileSync("supabase/functions/_shared/csv.ts", "utf8");
    expect(source).not.toMatch(/^import /m);
    expect(source).not.toMatch(/Deno\./);
  });
});
