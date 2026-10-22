import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { LEGAL_UPDATED, formatLegalDate } from "../lib/legalDates";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const PAGES: Record<keyof typeof LEGAL_UPDATED, string> = {
  privacy: "src/pages/Privacy.tsx",
  terms: "src/pages/TermsConditions.tsx",
  cookies: "src/pages/CookiePolicy.tsx",
  refunds: "src/pages/RefundPolicy.tsx",
  legalNotice: "src/pages/MentionsLegales.tsx",
};

describe("legal pages' last-updated dates", () => {
  it("writes the date the same way for every visitor", () => {
    expect(formatLegalDate("2026-10-22")).toBe("October 22, 2026");
    expect(formatLegalDate("2026-10-22", "fr-FR")).toBe("22 octobre 2026");
    expect(formatLegalDate("2026-01-01")).toBe("January 1, 2026");
  });

  it("holds real dates, none in the future", () => {
    for (const [name, iso] of Object.entries(LEGAL_UPDATED)) {
      expect(iso, name).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      const t = new Date(`${iso}T00:00:00Z`).getTime();
      expect(Number.isNaN(t), name).toBe(false);
      expect(t, name).toBeLessThanOrEqual(Date.now());
    }
  });

  it("is used by each page, not the visitor's clock", () => {
    for (const [key, page] of Object.entries(PAGES)) {
      const source = read(page);
      expect(source, page).toContain(`LEGAL_UPDATED.${key}`);
      expect(source, page).not.toContain("new Date().toLocaleDateString");
    }
  });
});

describe("the privacy policy", () => {
  const source = read("src/pages/Privacy.tsx");

  it("is readable without an account", () => {
    // The footer, the event page and the sign-up form all link to it.
    expect(source).not.toMatch(/navigate\(\s*["']\/auth/);
    expect(source).not.toMatch(/if \(!user\) return null/);
  });

  it("keeps consents and data requests for signed-in users", () => {
    expect(source).toContain("{user && (");
  });
});
