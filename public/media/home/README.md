# Home page media

The home page opens on a full-screen carousel of **3 slides**. Each slide has a big picture (or a looping video)
behind one sentence. Drop the files in this folder, **with exactly these names**:

| Slide | Picture (required) | Video (optional) |
|---|---|---|
| 1. Organizers: "Organizing an event?" | `slide-3.jpg` | `slide-3.mp4` + `slide-3.webm` |
| 2. Platform: "The event platform for students" | `slide-1.jpg` | `slide-1.mp4` + `slide-1.webm` |
| 3. Secure resale: "Can't make it? Resell it safely." | `slide-2.jpg` | `slide-2.mp4` + `slide-2.webm` |

Until a file is here, its slide shows a gradient in the site's colours. Nothing breaks and no image is ever shown broken.

## Sizes

- **Picture:** JPEG, 1920 × 1080, **under 400 KB**.
- **Video:** 1080p, **8 to 12 seconds**, a loop that does not jump, **no sound**, **under 3 MB** each (MP4 and WebM).
- Videos only play on a computer with a good connection. Phones, data saver, 2G/3G and "reduce motion" show the
  picture, so the picture is what most visitors see: take care of it.

## What to look for (art direction)

Real photos and real footage of parties and events. **No AI-generated images.** Dark, coloured lights, a crowd,
**no sharp face in the foreground, no school logo**. The page dims the picture with a dark gradient, so a bright
or busy one still works, but a dark one looks best.

Use only media you may use commercially: **Pexels**, **Coverr** and **Mixkit** all allow it (check the licence of
each file you pick).

## References (Pinterest)

These pins only set the mood. **Do not download them**: they belong to their authors. Find free equivalents with the
same framing, light and atmosphere using the keywords.

### Slide 1: Platform (energy, crowd, lights)

- https://fr.pinterest.com/pin/1010706341356354231/ (8 s video, backlit crowd in red light: the reference for a loop)
- https://fr.pinterest.com/pin/793478028125109049/ (confetti and raised hands, student party)
- https://fr.pinterest.com/pin/4590575510044889152/ (open-air rave)
- https://fr.pinterest.com/pin/706783735316670526/ (blue and red stage, raised hands)

Search: `concert crowd lights`, `festival crowd night`, `confetti party`

### Slide 2: Secure resale (calmer, intimate, "after the party")

- https://fr.pinterest.com/pin/918804761496117793/ (direct-flash party, film look)
- https://fr.pinterest.com/pin/1090011916097831278/ (summer terrace, string lights, student crowd)
- https://fr.pinterest.com/pin/969822101035231810/ (10 s video, crowd with lit phones)

Search: `nightclub party crowd`, `phones in the crowd night`, `terrace party string lights`

### Slide 3: Organizers (gala, hall, backstage / DJ)

- https://fr.pinterest.com/pin/446771225557513977/ (gala hall, ceiling of lanterns)
- https://fr.pinterest.com/pin/631348441549316578/ (gala, purple dance floor)
- https://fr.pinterest.com/pin/1134766437382648347/ (30 s video, DJ and disco balls, club)

Search: `gala dinner venue`, `disco ball club`, `dj booth club lights`

## Preparing the files

From any source (`source.jpg`, `source.mov`):

```sh
# Picture
ffmpeg -i source.jpg -vf "scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080" -q:v 4 slide-1.jpg
# Video: MP4 (plays everywhere), then WebM (smaller, taken first when it exists)
ffmpeg -i source.mov -t 10 -vf "scale=1920:-2" -an -c:v libx264 -crf 28 -preset slow -movflags +faststart slide-1.mp4
ffmpeg -i source.mov -t 10 -vf "scale=1920:-2" -an -c:v libvpx-vp9 -crf 36 -b:v 0 slide-1.webm
# A poster from the video, if you have no separate picture
ffmpeg -i source.mov -ss 1 -frames:v 1 -vf "scale=1920:-2" -q:v 4 slide-1.jpg
```

## Switching a video on

The page does not look for videos by itself (a missing file would only cost a failed request). Once
`slide-N.mp4` / `slide-N.webm` are here, list them for that slide in `src/content/home.ts`:

```ts
media: {
  image: picture("slide-1"),
  video: { mp4: "/media/home/slide-1.mp4", webm: "/media/home/slide-1.webm" },
  tone: "cobalt",
},
```

The picture is always the video's poster. Only the video of the slide in view and of the next one is loaded.

## WebP / AVIF (optional)

Add a `.webp` and/or `.avif` file next to the JPEG with the same name (for example `slide-1.webp`), then list the
formats in `src/content/home.ts`: `image: { ...picture("slide-1"), formats: ["avif", "webp", "jpg"] }`. Only list a
format whose file exists: the browser does not fall back to the JPEG when a listed file is missing.

## Texts, buttons and links

All in `src/content/home.ts`, in English. `position` there (for example `"50% 30%"`) chooses the part of a picture
that stays in view on a wide screen.
