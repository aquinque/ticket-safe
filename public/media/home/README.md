# Home page pictures

The home page is one screen with three slides that slide in by themselves: **Buy**, **Sell**, **Scan**. Each slide
has a picture behind its words. Drop your pictures in this folder, **with exactly these names**:

| Slide | File |
|---|---|
| 1. Buy | `buy.jpg` |
| 2. Sell (Ticket Studio) | `sell.jpg` |
| 3. Scan (entrance check) | `scan.jpg` |

## What a good file looks like

- **JPEG, about 1920 px on its long side, quality 75–80, under 400 KB.** A heavier file makes the page slower
  on a phone, where most visitors arrive from.
- **Any proportion works.** The picture is cropped to fill the screen. A portrait picture (like a Pinterest pin)
  is perfect on a phone; on a computer only a horizontal band of it shows, so keep what matters near the middle,
  or move the band with `position` in `src/content/home.ts` (for example `"50% 30%"` shows the upper part).
- **Real photos and footage only. No AI-generated images.** Nothing in the code makes or replaces a picture.
- Pictures found on Pinterest belong to whoever made them: use your own photos, or ones you are allowed to use.
- Until a file is here, its slide shows a navy gradient. Nothing breaks, no image is ever shown broken.

`buy.jpg`, `sell.jpg` and `scan.jpg` are right now three frames of the old home page video, only so that the
screen is not empty. Replace them.

## Changing the rest

- **Texts, buttons, links, the order of the slides, the part of each picture that stays in view:** `src/content/home.ts`.
  The page is in English; the French texts show when a visitor picks French.
- **Time per slide (6.5 s):** `SLIDE_INTERVAL_MS` in `src/lib/homePage.ts` and `--slide-ms` in `src/index.css`.
  Keep the two equal (a test checks it). How far a slide travels as it arrives is `--slide-shift` in `src/index.css`.

## WebP / AVIF (optional)

Add a `.webp` and/or `.avif` file **next to the JPEG, with the same name** (for example `buy.webp`), then list
the formats in `src/content/home.ts`:

```ts
buy: { image: { ...picture("buy"), formats: ["avif", "webp", "jpg"] }, tone: "cobalt", position: "50% 70%" },
```

Only list a format if its file exists: the browser does not fall back to the JPEG when a listed file is missing.
