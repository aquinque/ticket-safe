import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error -- plain ES module script, no type declarations
import { DEFAULT_IMAGE, EVENTS_QUERY, escapeAttr, eventWhen, renderEventPage, shareMeta, truncate } from "../../scripts/prerender-event-pages.mjs";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const halloween = {
  slug: "ebs-halloween-ayala-120",
  title: "EBS HALLOWEEN × AYALA 120",
  description: "ESCP Bachelor Society takes over Ayala 120 for Halloween night. Doors from midnight until 5am.",
  seo_description: null,
  date: "2026-11-06 23:01:00+00",
  location: "AYALA 120, Madrid",
  currency: "EUR",
};

describe("event link previews", () => {
  it("say what, when and where, in the event's local time", () => {
    const meta = shareMeta(halloween);
    expect(meta.title).toBe("EBS HALLOWEEN × AYALA 120");
    expect(meta.url).toBe("https://ticket-safe.eu/e/ebs-halloween-ayala-120");
    expect(meta.description.startsWith("Sat, 7 Nov 2026, 00:01 · AYALA 120, Madrid — ESCP Bachelor Society")).toBe(true);
    expect(eventWhen({ date: "2026-11-06T20:00:00Z", currency: "GBP" })).toBe("Fri, 6 Nov 2026, 20:00");
  });

  it("prefer the share description, and keep previews short", () => {
    expect(shareMeta({ ...halloween, seo_description: "Costumes required." }).description).toBe("Sat, 7 Nov 2026, 00:01 · AYALA 120, Madrid — Costumes required.");
    const long = shareMeta({ ...halloween, description: "word ".repeat(100) }).description;
    expect(long.length).toBeLessThanOrEqual(200);
    expect(long.endsWith("…")).toBe(true);
    expect(truncate("short", 200)).toBe("short");
  });

  it("use the absolute 1200x630 JPEG default picture when the event has none", () => {
    expect(shareMeta(halloween).image).toEqual(DEFAULT_IMAGE);
    expect(DEFAULT_IMAGE).toEqual({ url: "https://ticket-safe.eu/og-default.jpg", width: 1200, height: 630 });
    const index = read("index.html");
    expect(index).toContain('<meta property="og:image" content="https://ticket-safe.eu/og-default.jpg" />');
    expect(index).toContain('<meta name="twitter:image" content="https://ticket-safe.eu/og-default.jpg" />');
    expect(index).not.toContain("og-default.svg");
  });

  it("replace the generic tags of index.html instead of adding a second set", () => {
    const page = renderEventPage(read("index.html"), shareMeta(halloween));
    for (const tag of ['property="og:title"', 'property="og:description"', 'property="og:image"', 'property="og:url"', 'name="twitter:card"', 'name="description"', "<title>"]) {
      expect(page.split(tag).length - 1, tag).toBe(1);
    }
    expect(page).toContain('<meta name="twitter:card" content="summary_large_image" />');
    expect(page).toContain('<meta property="og:url" content="https://ticket-safe.eu/e/ebs-halloween-ayala-120" />');
    expect(page).toContain('<link rel="canonical" href="https://ticket-safe.eu/e/ebs-halloween-ayala-120" />');
    // The app still boots from the page.
    expect(page).toContain('<div id="root"></div>');
  });

  it("escape what organizers type", () => {
    expect(escapeAttr(`"><script>alert(1)</script>`)).toBe("&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;");
    const page = renderEventPage(read("index.html"), shareMeta({ ...halloween, title: `Party "<b>live</b>"` }));
    expect(page).not.toContain("<b>live</b>");
  });

  it("run after every build, and the scheduled check hashes the very same request", () => {
    expect(JSON.parse(read("package.json")).scripts.build).toBe("vite build && node scripts/prerender-event-pages.mjs dist");
    const workflow = read(".github/workflows/deploy.yml");
    const query = workflow.match(/query="([^"]+)"/)?.[1];
    expect(query).toBe(EVENTS_QUERY);
    expect(workflow).toContain('cron: "*/10 * * * *"');
    expect(workflow).toContain("if: needs.changes.outputs.build == 'true'");
  });

  it("never deploy Edge Functions from the site workflow, nor payment functions automatically", () => {
    expect(read(".github/workflows/deploy.yml")).not.toContain("functions deploy");
    const functions = read(".github/workflows/deploy-edge-functions.yml");
    expect(functions).not.toContain("schedule");
    const list = functions.match(/for fn in ([^;]+); do/)?.[1].trim().split(/\s+/);
    expect(list).toEqual(["ticket-access", "export-event-sales"]);
    for (const fn of list ?? []) expect(fn).not.toMatch(/checkout|webhook|payout|refund|stripe|revolut|payment/);
  });

  it("are not blocked for link-preview crawlers", () => {
    const robots = read("public/robots.txt");
    expect(robots).toMatch(/User-agent: facebookexternalhit\nAllow: \//);
    expect(robots).toMatch(/User-agent: Twitterbot\nAllow: \//);
    expect(robots).not.toMatch(/Disallow: \/e\//);
  });
});
