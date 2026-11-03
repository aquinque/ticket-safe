#!/usr/bin/env node
/**
 * Link previews for event pages (WhatsApp, Instagram, iMessage, Facebook, X).
 *
 * The site is a single-page app on GitHub Pages: a deep link such as /e/<slug> has no file, so Pages answers with
 * 404.html (status 404) whose only content is a script that redirects to the app. Link-preview crawlers run no
 * script, so they never saw an event's title, text or picture.
 *
 * After `vite build`, this script writes one static page per published event, dist/e/<slug>.html (Pages serves it at
 * /e/<slug> with status 200): the app's own index.html, with the event's title, description, canonical URL and
 * Open Graph / Twitter tags in the head. The app boots from it exactly as from index.html. The picture is the event's
 * share picture or banner, cropped to 1200x630 and saved as dist/og/e/<slug>-<hash>.jpg (the hash changes the URL when
 * the picture changes, since the apps cache previews by image URL); an event without a picture gets
 * https://ticket-safe.eu/og-default.jpg.
 *
 * It also writes dist/og/events-hash.txt, the SHA-256 of the event list it used: the scheduled run of the deploy
 * workflow compares it with the live list and only rebuilds the site when an event was published or edited.
 *
 * Usage: node scripts/prerender-event-pages.mjs [distDir]
 * Reads VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY (public values). OG_EVENTS_FIXTURE=<file.json> reads the
 * events from a file instead (tests). A failure to read the events never fails the build: the pages are skipped.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const SITE = "https://ticket-safe.eu";
export const DEFAULT_IMAGE = { url: `${SITE}/og-default.jpg`, width: 1200, height: 630 };
export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** The columns the pages need, the published events only (the same request feeds the change check, see deploy.yml). */
export const EVENTS_QUERY =
  "/rest/v1/events?select=slug,title,description,seo_description,og_image_url,banner_url,date,location,currency" +
  "&status=eq.published&slug=not.is.null&order=slug.asc&limit=2000";

export const escapeAttr = (value) =>
  String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Description text without markup or runs of whitespace. */
export const plainText = (value) =>
  String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/[*_#>`~]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Cuts at a word boundary and adds an ellipsis when the text is longer than `max` characters. */
export function truncate(value, max) {
  if (value.length <= max) return value;
  const cut = value.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.–—-]+$/, "")}…`;
}

const zoneOf = (event) => (String(event.currency ?? "").toUpperCase() === "GBP" ? "Europe/London" : "Europe/Paris");

/** ["Wed 11 Nov", "22:00"] in the event's time zone (London for events sold in pounds, Paris otherwise). */
export function eventDayTime(event) {
  if (!event.date) return [];
  const date = new Date(event.date);
  if (Number.isNaN(date.getTime())) return [];
  const timeZone = zoneOf(event);
  const day = date.toLocaleDateString("en-GB", { timeZone, weekday: "short", day: "numeric", month: "short" }).replace(",", "");
  const time = date.toLocaleTimeString("en-GB", { timeZone, hour: "2-digit", minute: "2-digit" });
  return [day, time];
}

/** "Wed 11 Nov · 22:00 · Pavillon Royal" */
export function eventWhen(event) {
  return [...eventDayTime(event), plainText(event.location)].filter(Boolean).join(" · ");
}

export const PREVIEW_CALL = "Get your ticket on TicketSafe";

/** What the preview shows: the event's name, then "Wed 11 Nov · 22:00 · Pavillon Royal — Get your ticket on TicketSafe". */
export function shareMeta(event, image = DEFAULT_IMAGE) {
  const title = plainText(event.title) || "Event";
  const facts = eventWhen(event);
  const description = truncate(facts ? `${facts} — ${PREVIEW_CALL}` : PREVIEW_CALL, 200);
  return { title, description, url: `${SITE}/e/${event.slug}`, image };
}

/** The head tags of an event page. */
export function headTags(meta) {
  const t = escapeAttr(meta.title);
  const d = escapeAttr(meta.description);
  const u = escapeAttr(meta.url);
  const i = escapeAttr(meta.image.url);
  const alt = escapeAttr(`${meta.title} on TicketSafe`);
  return [
    `<title>${escapeAttr(`${meta.title} · TicketSafe`)}</title>`,
    `<meta name="description" content="${d}" />`,
    `<link rel="canonical" href="${u}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="TicketSafe" />`,
    `<meta property="og:locale" content="en_GB" />`,
    `<meta property="og:url" content="${u}" />`,
    `<meta property="og:title" content="${t}" />`,
    `<meta property="og:description" content="${d}" />`,
    `<meta property="og:image" content="${i}" />`,
    `<meta property="og:image:secure_url" content="${i}" />`,
    `<meta property="og:image:type" content="image/jpeg" />`,
    `<meta property="og:image:width" content="${meta.image.width}" />`,
    `<meta property="og:image:height" content="${meta.image.height}" />`,
    `<meta property="og:image:alt" content="${alt}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${t}" />`,
    `<meta name="twitter:description" content="${d}" />`,
    `<meta name="twitter:image" content="${i}" />`,
    `<meta name="twitter:image:alt" content="${alt}" />`,
  ].join("\n    ");
}

/** index.html with its generic title, description, canonical, Open Graph and Twitter tags replaced by the event's. */
export function renderEventPage(indexHtml, meta) {
  const stripped = indexHtml
    .replace(/<title>[\s\S]*?<\/title>\s*/i, "")
    .replace(/<meta\s+(?:property|name)="(?:og:[^"]*|twitter:[^"]*|description)"[^>]*>\s*/gi, "")
    .replace(/<link\s+rel="canonical"[^>]*>\s*/gi, "");
  const anchor = stripped.match(/<meta\s+name="viewport"[^>]*>/i);
  if (!anchor) throw new Error("index.html has no viewport meta to anchor the event tags after");
  const at = (anchor.index ?? 0) + anchor[0].length;
  return `${stripped.slice(0, at)}\n    ${headTags(meta)}\n${stripped.slice(at)}`;
}

const xml = (v) => String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Splits a title into at most `maxLines` lines of about `width` characters, the last one cut with an ellipsis. */
export function wrapTitle(title, width = 22, maxLines = 3) {
  const words = plainText(title).split(" ").filter(Boolean);
  const lines = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (next.length > width && line) { lines.push(line); line = w; } else line = next;
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = truncate(`${kept[maxLines - 1]} ${lines.slice(maxLines).join(" ")}`, width);
    return kept;
  }
  return lines.map((l) => (l.length > width + 6 ? truncate(l, width + 6) : l));
}

/** The 1200x630 card used when an event has no picture: TicketSafe navy, the event's name and date. */
export function defaultCardSvg(event) {
  // Bold sans glyphs average about 0.7 em: pick the largest size whose lines fit 1040 px.
  let size = 96;
  let lines = wrapTitle(event.title || "Event", Math.floor(1040 / (0.7 * size)), 3);
  for (const s of [96, 84, 72, 64]) {
    size = s;
    lines = wrapTitle(event.title || "Event", Math.floor(1040 / (0.7 * s)), 3);
    if (lines.length <= (s >= 84 ? 2 : 3)) break;
  }
  const lineHeight = size * 1.1;
  const top = 190 + size;
  const title = lines
    .map((l, i) => `<text x="80" y="${Math.round(top + i * lineHeight)}" font-size="${size}" font-weight="700" fill="#eef2f8">${xml(l)}</text>`)
    .join("");
  const when = xml(eventWhen(event));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${OG_WIDTH}" height="${OG_HEIGHT}" viewBox="0 0 ${OG_WIDTH} ${OG_HEIGHT}">
  <defs><radialGradient id="g" cx="100%" cy="0%" r="90%"><stop offset="0" stop-color="#3a5fe6" stop-opacity="0.55"/><stop offset="1" stop-color="#1a2744" stop-opacity="0"/></radialGradient></defs>
  <rect width="100%" height="100%" fill="#1a2744"/><rect width="100%" height="100%" fill="url(#g)"/>
  <g font-family="DejaVu Sans, Liberation Sans, Arial, Helvetica, sans-serif">
    <text x="80" y="110" font-size="30" font-weight="700" letter-spacing="6" fill="#aec6ff">TICKETSAFE</text>
    ${title}
    <text x="80" y="540" font-size="40" fill="#9fb0cc">${when}</text>
  </g>
</svg>`;
}

/** The default card for an event as a JPEG in dist/og/e/, or null if it cannot be drawn. */
export async function defaultEventImage(event, distDir, { sharp }) {
  try {
    const jpeg = await sharp(Buffer.from(defaultCardSvg(event))).jpeg({ quality: 86, mozjpeg: true }).toBuffer();
    const hash = createHash("sha256").update(jpeg).digest("hex").slice(0, 10);
    const file = `og/e/${event.slug}-card-${hash}.jpg`;
    await mkdir(path.join(distDir, "og/e"), { recursive: true });
    await writeFile(path.join(distDir, file), jpeg);
    return { url: `${SITE}/${file}`, width: OG_WIDTH, height: OG_HEIGHT };
  } catch (err) {
    console.warn(`[prerender] ${event.slug}: default card not drawn (${err instanceof Error ? err.message : err})`);
    return null;
  }
}

/** The event's picture as a 1200x630 JPEG, or null when there is none or it cannot be read. */
export async function eventImage(event, distDir, { fetchImpl = fetch, sharp } = {}) {
  // The event's own picture (the banner shown on its page); a picture saved by the former
  // "Social sharing" option is only used for events that have no banner.
  const source = event.banner_url || event.og_image_url;
  const allowHttp = process.env.OG_ALLOW_HTTP === "1";
  if (!source || !(source.startsWith("https://") || (allowHttp && source.startsWith("http://")))) return null;
  try {
    const res = await fetchImpl(source, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const input = Buffer.from(await res.arrayBuffer());
    const jpeg = await sharp(input, { failOn: "none" })
      .rotate()
      .resize(OG_WIDTH, OG_HEIGHT, { fit: "cover", position: "centre" })
      .flatten({ background: "#0b1020" })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();
    const hash = createHash("sha256").update(jpeg).digest("hex").slice(0, 10);
    const file = `og/e/${event.slug}-${hash}.jpg`;
    await mkdir(path.join(distDir, "og/e"), { recursive: true });
    await writeFile(path.join(distDir, file), jpeg);
    return { url: `${SITE}/${file}`, width: OG_WIDTH, height: OG_HEIGHT };
  } catch (err) {
    console.warn(`[prerender] ${event.slug}: picture not usable (${err instanceof Error ? err.message : err}), default picture used`);
    return null;
  }
}

async function readEvents() {
  if (process.env.OG_EVENTS_FIXTURE) {
    const text = await readFile(process.env.OG_EVENTS_FIXTURE, "utf8");
    return { text, events: JSON.parse(text) };
  }
  const base = (process.env.VITE_SUPABASE_URL ?? "").replace(/\/+$/, "");
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";
  if (!base || !key) throw new Error("VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY not set");
  const res = await fetch(base + EVENTS_QUERY, { headers: { apikey: key, Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`events request answered ${res.status}`);
  const text = await res.text();
  return { text, events: JSON.parse(text) };
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}

export async function main(distDir = "dist") {
  const indexHtml = await readFile(path.join(distDir, "index.html"), "utf8");
  let loaded;
  try {
    loaded = await readEvents();
  } catch (err) {
    const msg = `event link previews skipped: ${err instanceof Error ? err.message : err}`;
    console.warn(process.env.GITHUB_ACTIONS ? `::warning::${msg}` : `[prerender] ${msg}`);
    return { pages: 0 };
  }
  const { default: sharp } = await import("sharp");
  const events = (Array.isArray(loaded.events) ? loaded.events : []).filter((e) => e && typeof e.slug === "string" && SLUG_RE.test(e.slug));
  await mkdir(path.join(distDir, "e"), { recursive: true });
  await mkdir(path.join(distDir, "og"), { recursive: true });
  let withPicture = 0;
  await mapLimit(events, 4, async (event) => {
    const own = await eventImage(event, distDir, { sharp });
    if (own) withPicture++;
    const image = own ?? (await defaultEventImage(event, distDir, { sharp })) ?? DEFAULT_IMAGE;
    await writeFile(path.join(distDir, "e", `${event.slug}.html`), renderEventPage(indexHtml, shareMeta(event, image)));
  });
  await writeFile(path.join(distDir, "og/events-hash.txt"), `${createHash("sha256").update(loaded.text).digest("hex")}\n`);
  // The list the crawler check (scripts/check-link-previews.sh) walks after each deploy.
  await writeFile(path.join(distDir, "og/slugs.txt"), events.map((e) => e.slug).join("\n") + "\n");
  console.log(`[prerender] ${events.length} event pages written (${withPicture} with their own picture, ${events.length - withPicture} with a TicketSafe card)`);
  return { pages: events.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv[2] ?? "dist").catch((err) => {
    // Previews are a nice-to-have: never let them break the deploy of the site itself.
    console.warn(`[prerender] failed: ${err instanceof Error ? err.stack : err}`);
  });
}
