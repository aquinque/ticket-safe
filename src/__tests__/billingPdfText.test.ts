import { describe, it, expect } from "vitest";
import {
  formatDateFr,
  formatEurFr,
  formatUnitPriceFr,
  isWinAnsi,
  parisDateKey,
  pdfSafe,
} from "../../supabase/functions/_shared/pdfText.ts";

const drawable = (s: string) => [...s].every((c) => isWinAnsi(c.codePointAt(0) as number));

describe("formatEurFr", () => {
  it("formats amounts with a decimal comma and non-breaking spaces", () => {
    expect(formatEurFr(0)).toBe("0,00 €");
    expect(formatEurFr(5)).toBe("0,05 €");
    expect(formatEurFr(120)).toBe("1,20 €");
    expect(formatEurFr(2104425)).toBe("21 044,25 €");
    expect(formatEurFr(123456789)).toBe("1 234 567,89 €");
  });

  it("uses a plain hyphen for negative amounts and rounds to the cent", () => {
    expect(formatEurFr(-1250)).toBe("-12,50 €");
    expect(formatEurFr(12.4)).toBe("0,12 €");
    expect(formatEurFr(Number.NaN)).toBe("0,00 €");
  });

  // The regression: Intl writes 21 044,25 with U+202F, which the PDF font can't draw, and
  // every amount from 1 000 € up used to make the document fail.
  it("only emits characters the PDF font can draw", () => {
    for (const cents of [0, 99, 100000, 2104425, -2104425, 99999999999]) {
      expect(drawable(formatEurFr(cents))).toBe(true);
    }
  });
});

describe("formatUnitPriceFr", () => {
  it("shows a whole number of cents to the cent, and a fraction of a cent to four decimals", () => {
    expect(formatUnitPriceFr(120)).toBe("1,20\u00a0€");
    expect(formatUnitPriceFr(58.3333)).toBe("0,5833\u00a0€");
    expect(formatUnitPriceFr(93.3333)).toBe("0,9333\u00a0€");
    expect(drawable(formatUnitPriceFr(116.6667))).toBe(true);
  });
});

describe("pdfSafe", () => {
  it("keeps French text as it is", () => {
    expect(pdfSafe("Soirée d'intégration – ESCP « Paris » n° 2 · 5 €")).toBe("Soirée d'intégration – ESCP « Paris » n° 2 · 5 €");
  });

  it("replaces what the font can't draw instead of failing", () => {
    expect(pdfSafe("Total − 5")).toBe("Total - 5");
    expect(pdfSafe("21 044,25")).toBe("21 044,25");
    expect(pdfSafe("Party 🎉 night")).toBe("Party night");
    expect(pdfSafe("Łódź")).toBe("Lódz"); // ó is in Windows-1252 and stays; Ł and ź get their plain letter
    expect(pdfSafe("a​b")).toBe("ab");
  });

  it("flattens line breaks and copes with empty values", () => {
    expect(pdfSafe("a\nb\r\nc")).toBe("a b c");
    expect(pdfSafe(null)).toBe("");
    expect(pdfSafe(undefined)).toBe("");
  });

  it("always returns something drawable", () => {
    const nasty = "Évé−nement №1 ✓ 日本 😀 ő č ſ \u0000 ﻿";
    expect(drawable(pdfSafe(nasty))).toBe(true);
  });
});

describe("dates in Paris time", () => {
  it("writes the day the way a French document does, whatever the server's time zone", () => {
    expect(formatDateFr("2026-10-17T10:26:14Z")).toBe("17 octobre 2026");
    expect(formatDateFr("2026-08-31T23:30:00Z")).toBe("1er septembre 2026"); // 01:30 in Paris
    expect(formatDateFr("2026-10-31T23:30:00Z")).toBe("1er novembre 2026"); // 00:30 in Paris
  });

  it("returns a dash for a missing or invalid date", () => {
    expect(formatDateFr(null)).toBe("—");
    expect(formatDateFr("not a date")).toBe("—");
  });

  it("gives the Paris calendar day as a date key", () => {
    expect(parisDateKey("2026-10-31T23:30:00Z")).toBe("2026-11-01");
    expect(parisDateKey("2026-10-31T12:00:00Z")).toBe("2026-10-31");
    expect(parisDateKey(null)).toBeNull();
  });
});
