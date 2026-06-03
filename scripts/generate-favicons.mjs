/**
 * Generate raster favicons (PNG + ICO) from public/favicon.svg.
 *
 * Run after editing the SVG:
 *   node scripts/generate-favicons.mjs
 *
 * Why we ship PNGs alongside the SVG:
 *   Google's search-result favicon picker explicitly requires a square
 *   PNG (or ICO) at >= 48 px. SVG alone is not guaranteed to be indexed.
 *   See https://developers.google.com/search/docs/appearance/favicon-in-search
 *
 * Sizes generated:
 *   - favicon-16x16.png, favicon-32x32.png, favicon-48x48.png  (legacy browsers)
 *   - favicon-96x96.png, favicon-192x192.png, favicon-512x512.png  (Android / PWA)
 *   - apple-touch-icon.png (180x180, Apple iOS Home Screen icon)
 *
 * Note: we don't generate favicon.ico because modern Chrome / Firefox /
 * Safari 17+ already prefer the SVG declaration. Older browsers fall back
 * to /favicon-32x32.png declared as <link rel="alternate icon">.
 */

import sharp from "sharp";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "public", "favicon.svg");
const outDir = path.join(root, "public");

const targets = [
  { size: 16,  name: "favicon-16x16.png" },
  { size: 32,  name: "favicon-32x32.png" },
  { size: 48,  name: "favicon-48x48.png" },
  { size: 96,  name: "favicon-96x96.png" },
  { size: 180, name: "apple-touch-icon.png" },
  { size: 192, name: "favicon-192x192.png" },
  { size: 512, name: "favicon-512x512.png" },
];

const svg = await readFile(src);

for (const t of targets) {
  const out = path.join(outDir, t.name);
  await sharp(svg, { density: 384 })
    .resize(t.size, t.size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toFile(out);
  console.log(`  ✓ ${t.name}  (${t.size}×${t.size})`);
}

console.log("\nDone. Don't forget to commit the new PNGs.");
