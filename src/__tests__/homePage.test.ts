import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  FADE_MS,
  FIRST_SCREEN_MEDIA_DELAY_MS,
  MAX_EVENTS_SHOWN,
  MIN_EVENTS_FOR_GRID,
  SLIDE_INTERVAL_MS,
  SWIPE_MIN_PX,
  canPlayVideo,
  hasEnoughEvents,
  isTypingTarget,
  keyDirection,
  nextSlide,
  pictureSources,
  previousSlide,
  slideState,
  slidesToPrepare,
  swipeDirection,
  videoSources,
} from "../lib/homePage";
import { HERO_SLIDES, HOME_COPY, HOME_LINKS } from "../content/home";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
/** The code without its comments, so a comment that explains what the code must not do is not mistaken for it. */
const code = (path: string) => read(path).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("the carousel's slides", () => {
  it("go round: after the last comes the first, before the first comes the last", () => {
    expect(nextSlide(0, 3)).toBe(1);
    expect(nextSlide(2, 3)).toBe(0);
    expect(previousSlide(1, 3)).toBe(0);
    expect(previousSlide(0, 3)).toBe(2);
  });

  it("are current, leaving (just left, still opaque underneath) or idle", () => {
    expect([0, 1, 2].map((i) => slideState(i, 1, null))).toEqual(["idle", "current", "idle"]);
    expect([0, 1, 2].map((i) => slideState(i, 1, 0))).toEqual(["leaving", "current", "idle"]);
    expect([0, 1, 2].map((i) => slideState(i, 0, 2))).toEqual(["current", "idle", "leaving"]);
  });

  it("only prepare the video of the slide in view and of the next one", () => {
    expect(slidesToPrepare(0, 3)).toEqual([0, 1]);
    expect(slidesToPrepare(2, 3)).toEqual([2, 0]);
    expect(slidesToPrepare(0, 1)).toEqual([0]);
  });

  it("keep the same time in the code and in the stylesheet: 6 s per slide, an 800 ms fade", () => {
    // The bar under the active indicator runs for --slide-ms and the zoom and fades follow --fade-ms.
    expect(SLIDE_INTERVAL_MS).toBe(6000);
    expect(FADE_MS).toBe(800);
    const css = read("src/index.css");
    expect(css).toMatch(new RegExp(`--slide-ms:\\s*${SLIDE_INTERVAL_MS}ms`));
    expect(css).toMatch(new RegExp(`--fade-ms:\\s*${FADE_MS}ms`));
  });
});

describe("swipes and keys", () => {
  it("a swipe left shows the next slide and a swipe right the previous one", () => {
    expect(swipeDirection(-120, 8)).toBe("next");
    expect(swipeDirection(120, -8)).toBe("previous");
  });

  it("ignores a short move, and a move that is mostly up and down (someone scrolling)", () => {
    expect(swipeDirection(-(SWIPE_MIN_PX - 1), 0)).toBeNull();
    expect(swipeDirection(-SWIPE_MIN_PX, 0)).toBe("next");
    expect(swipeDirection(-100, 90)).toBeNull();
    expect(swipeDirection(60, 200)).toBeNull();
    expect(swipeDirection(0, 0)).toBeNull();
  });

  it("← goes back and → goes on; any other key, or a shortcut, does nothing", () => {
    expect(keyDirection("ArrowLeft")).toBe(-1);
    expect(keyDirection("ArrowRight")).toBe(1);
    expect(keyDirection("ArrowRight", true)).toBeNull();
    expect(keyDirection("ArrowUp")).toBeNull();
    expect(keyDirection("a")).toBeNull();
  });

  it("leaves the keys to a field the visitor is typing in", () => {
    for (const tag of ["input", "textarea", "select"]) expect(isTypingTarget(document.createElement(tag)), tag).toBe(true);
    expect(isTypingTarget(document.createElement("button"))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});

describe("which media may load", () => {
  const desktop = { isMobile: false, reducedMotion: false, saveData: false, effectiveType: "4g" };

  it("plays video on a desktop with a good connection", () => {
    expect(canPlayVideo(desktop)).toBe(true);
    expect(canPlayVideo({ ...desktop, effectiveType: undefined })).toBe(true);
    expect(canPlayVideo({ ...desktop, effectiveType: null })).toBe(true);
  });

  it("shows the still picture on a phone, with data saving on, on 2G/3G, or with reduced motion", () => {
    expect(canPlayVideo({ ...desktop, isMobile: true })).toBe(false);
    expect(canPlayVideo({ ...desktop, saveData: true })).toBe(false);
    expect(canPlayVideo({ ...desktop, reducedMotion: true })).toBe(false);
    for (const effectiveType of ["slow-2g", "2g", "3g"]) expect(canPlayVideo({ ...desktop, effectiveType }), effectiveType).toBe(false);
  });

  it("lists WebM before MP4, and MP4 alone when there is no WebM", () => {
    expect(videoSources({ mp4: "/a.mp4", webm: "/a.webm" })).toEqual([
      { src: "/a.webm", type: "video/webm" },
      { src: "/a.mp4", type: "video/mp4" },
    ]);
    expect(videoSources({ mp4: "/a.mp4" })).toEqual([{ src: "/a.mp4", type: "video/mp4" }]);
  });

  it("lists no extra picture format unless asked, then AVIF before WebP as same-name files", () => {
    const image = { src: "/media/home/slide-1.jpg", width: 1920, height: 1080 };
    expect(pictureSources(image)).toEqual([]);
    expect(pictureSources({ ...image, formats: ["avif", "webp", "jpg"] })).toEqual([
      { srcSet: "/media/home/slide-1.avif", type: "image/avif" },
      { srcSet: "/media/home/slide-1.webp", type: "image/webp" },
    ]);
  });

  it("starts the first picture after the first paint, so its weight never slows the page down", () => {
    // Lighthouse mobile scored 80 with a 340 kB picture loaded at once and 91 with it loaded this much later.
    expect(FIRST_SCREEN_MEDIA_DELAY_MS).toBeGreaterThanOrEqual(500);
    const carousel = read("src/components/home/HeroCarousel.tsx");
    expect(carousel).toContain("useAfterFirstPaint(FIRST_SCREEN_MEDIA_DELAY_MS)");
    expect(carousel).toMatch(/if \(!painted\) return;/);
    expect(carousel).toMatch(/loaded\.includes\(active\) \|\| missing\.includes\(active\)/);
  });

  it("keeps recharts out of every page's first load", () => {
    // The entry chunk only needs clsx; left unassigned it lands in the charts chunk and drags 105 kB along.
    expect(read("vite.config.ts")).toMatch(/"vendor-react":\s*\[[^\]]*"clsx"/);
  });
});

describe("the three slides", () => {
  it("say exactly what was asked, in English", () => {
    expect(HERO_SLIDES.map((s) => s.headline)).toEqual([
      "Organizing an event?",
      "The event platform for students",
      "Can't make it? Resell it safely.",
    ]);
    expect(HERO_SLIDES.map((s) => s.subline)).toEqual([
      "Create it in Ticket Studio, sell in minutes, withdraw your money whenever you want.",
      "Galas, parties, trips, conferences. One link, one ticket, zero fraud.",
      "Resale happens on TicketSafe, with every ticket checked first. The buyer gets a real ticket, the seller gets paid, the organizer stays in control.",
    ]);
  });

  it("have a button each: Ticket Studio, the events, the resale", () => {
    expect(HERO_SLIDES[0].cta).toEqual({ label: "Open Ticket Studio", target: "studio" });
    expect(HERO_SLIDES[1].cta).toEqual({ label: "Browse events", target: "events" });
    expect(HERO_SLIDES[2].cta).toEqual({ label: "Go to resale", target: "resale" });
  });

  it("point their buttons at routes that exist", () => {
    const app = read("src/App.tsx");
    for (const path of [HOME_LINKS.events, HOME_LINKS.studio, HOME_LINKS.studioOpen, HOME_LINKS.resale]) expect(app, path).toContain(`path="${path}"`);
    // /resale only redirects to the resale marketplace, so the button goes straight there.
    expect(app).toContain('path="/resale" element={<Navigate to="/marketplace/buy"');
    expect(HOME_LINKS.resale).toBe("/marketplace/buy");
    // /events itself only redirects to the events list, so the button goes straight there.
    expect(app).toContain('path="/events" element={<Navigate to="/tickets"');
    expect(HOME_LINKS.events).toBe("/tickets");
  });

  it("keep their own pictures in /media/home (organizers slide-3, platform slide-1, resale slide-2), none with a video yet", () => {
    expect(HERO_SLIDES.map((s) => s.media.image.src)).toEqual([
      "/media/home/slide-3.jpg",
      "/media/home/slide-1.jpg",
      "/media/home/slide-2.jpg",
    ]);
    // A listed video that is not there would only cost a failed request: list one when its files are dropped in.
    for (const slide of HERO_SLIDES) if (slide.media.video) expect(slide.media.video.mp4).toMatch(/^\/media\/home\/slide-\d\.mp4$/);
  });

  it("are all in English: no French or Spanish letters, words or leftover translations anywhere", () => {
    const everything = JSON.stringify([HERO_SLIDES, HOME_COPY]);
    expect(everything).not.toMatch(/[àâçéèêëîïôûùüÿœñáíóú¿¡]/i);
    const source = read("src/content/home.ts");
    expect(source).not.toMatch(/\bfr\b\s*[:=]|frenchTypography|HOME_CONTENT|useHomeLanguage/);
    const files = ["src/pages/Home.tsx", ...readdirSync(resolve(process.cwd(), "src/components/home")).map((f) => `src/components/home/${f}`)];
    for (const file of files) expect(read(file), file).not.toMatch(/[àâçéèêëîïôûùüÿœ]/i);
  });

  it("have no empty text", () => {
    for (const slide of HERO_SLIDES) {
      expect(slide.headline.trim()).not.toBe("");
      expect(slide.subline.trim()).not.toBe("");
    }
    const walk = (value: unknown): string[] =>
      typeof value === "string" ? [value] : value && typeof value === "object" ? Object.values(value).flatMap(walk) : [];
    for (const text of walk(HOME_COPY)) expect(text.trim()).not.toBe("");
  });
});

describe("the events and the trust line under the hero", () => {
  it("shows the events as soon as there is one, four at most", () => {
    // The site had one upcoming event and a "three at least" rule hid it behind "Coming soon": every event shows.
    expect(MIN_EVENTS_FOR_GRID).toBe(1);
    expect(MAX_EVENTS_SHOWN).toBe(4);
    expect(hasEnoughEvents(0)).toBe(false);
    expect(hasEnoughEvents(1)).toBe(true);
    expect(hasEnoughEvents(3)).toBe(true);
  });

  it("say \"Coming soon near you\" with the organizer button only when there is none, and \"Trusted by…\" with logos", () => {
    expect(HOME_COPY.events.title).toBe("Upcoming events");
    expect(HOME_COPY.events.soon.title).toBe("Coming soon near you");
    expect(HOME_COPY.events.soon.cta).toEqual({ label: "Open Ticket Studio", target: "studio" });
    expect(HOME_COPY.trusted).toBe("Trusted by student associations across Europe");
    expect(read("src/components/home/TrustedBy.tsx")).toMatch(/if \(partners\.length === 0\) return null;/);
    expect(read("src/components/home/UpcomingEvents.tsx")).toMatch(/!hasEnoughEvents\(events\.length\)/);
  });
});

describe("what the README promises is what the content asks for", () => {
  const readme = read("public/media/home/README.md");

  it("lists every picture and video file the slides use", () => {
    for (const slide of HERO_SLIDES) {
      expect(readme, slide.media.image.src).toContain(slide.media.image.src.replace("/media/home/", ""));
    }
    for (const n of [1, 2, 3]) {
      expect(readme).toContain(`slide-${n}.mp4`);
      expect(readme).toContain(`slide-${n}.webm`);
    }
  });

  it("gives the sizes: 1920×1080 under 400 KB, 1080p of 8 to 12 s under 3 MB", () => {
    expect(readme).toMatch(/1920 × 1080/);
    expect(readme).toMatch(/under 400 KB/);
    expect(readme).toMatch(/8 to 12 seconds/);
    expect(readme).toMatch(/under 3 MB/);
  });

  it("gives, for each slide, its Pinterest references and search keywords (to look at, not to download)", () => {
    for (const pin of [
      "1010706341356354231", "793478028125109049", "4590575510044889152", "706783735316670526",
      "918804761496117793", "1090011916097831278", "969822101035231810",
      "446771225557513977", "631348441549316578", "1134766437382648347",
    ]) {
      expect(readme, pin).toContain(`https://fr.pinterest.com/pin/${pin}/`);
    }
    for (const keyword of ["concert crowd lights", "nightclub party crowd", "disco ball club", "gala dinner venue", "confetti party", "festival crowd night"]) {
      expect(readme, keyword).toContain(keyword);
    }
    expect(readme).toMatch(/Do not download them/);
    expect(readme).toMatch(/No AI-generated images/);
  });
});

describe("the page itself", () => {
  const carousel = read("src/components/home/HeroCarousel.tsx");
  const home = read("src/pages/Home.tsx");
  const sources = [home, ...readdirSync(resolve(process.cwd(), "src/components/home")).map((f) => read(`src/components/home/${f}`))];

  it("has exactly one h1, the first slide's headline; the other slides' are h2", () => {
    // The tag is chosen in one place, so there is one h1 in the page, never zero or two.
    expect(sources.join("\n").match(/<h1[\s>]/g) ?? []).toHaveLength(0);
    expect(carousel).toContain('const Heading = i === 0 ? "h1" : "h2";');
    expect(carousel).toContain('id={i === 0 ? "hero-title" : undefined}');
  });

  it("is one hero of the height of the screen, with nothing else above the fold", () => {
    expect(carousel).toContain('id="hero"');
    expect(read("src/index.css")).toMatch(/\.home-hero-inner \{[^}]*min-height: 100svh;/);
    // The events come after the carousel in the page.
    expect(home.indexOf("<HeroCarousel")).toBeLessThan(home.indexOf("<UpcomingEvents"));
    expect(home.indexOf("<UpcomingEvents")).toBeLessThan(home.indexOf("<TrustedBy"));
  });

  it("never touches the address or the browser history when the slide changes", () => {
    for (const file of ["src/components/home/HeroCarousel.tsx", "src/hooks/useCarouselSignals.ts", "src/lib/homePage.ts"]) {
      expect(code(file), file).not.toMatch(/pushState|replaceState|location\.hash|location\.assign|history\.|navigate\(|useNavigate|href="#/);
    }
  });

  it("is a labelled carousel: slides in groups, indicators and arrows with English labels", () => {
    expect(carousel).toContain('aria-roledescription="carousel"');
    expect(carousel).toContain('aria-roledescription="slide"');
    expect(carousel).toContain("HOME_COPY.carousel.goTo");
    expect(carousel).toContain("HOME_COPY.carousel.previous");
    expect(carousel).toContain("HOME_COPY.carousel.next");
    expect(HOME_COPY.carousel.goTo).toBe("Go to slide {n} of {total}");
  });

  it("pauses on a mouse over it, on keyboard focus, on a hidden tab and when scrolled away, and goes on afterwards", () => {
    expect(carousel).toMatch(/const paused = mouseInside \|\| keyboardInside \|\| pageHidden \|\| !onScreen;/);
    expect(read("src/hooks/useCarouselSignals.ts")).toContain("visibilitychange");
    expect(carousel).toContain("remaining.current");
  });

  it("zooms 1 to 1.05, fades 800 ms, and stops zooming with reduced motion while the slideshow goes on", () => {
    const css = read("src/index.css");
    expect(css).toMatch(/@keyframes home-zoom \{\s*from \{ transform: scale\(1\); \}\s*to \{ transform: scale\(1\.05\); \}/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*\.home-zoom \{ animation: none !important; \}/);
    // Autoplay does not depend on motion: the carousel never reads the reduced-motion setting for its timer.
    expect(carousel).not.toContain("useReducedMotion");
  });

  it("shows the arrows on desktop with a mouse only", () => {
    expect(read("src/index.css")).toMatch(/@media \(min-width: 768px\) and \(hover: hover\) and \(pointer: fine\) \{\s*\.home-arrow \{ display: flex; \}/);
  });

  it("keeps the site's own header and footer, and its meta tags", () => {
    expect(home).toContain('import HeaderNight from "@/components/HeaderNight"');
    expect(home).toContain('import Footer from "@/components/Footer"');
    expect(home).toContain('title="TicketSafe — Your nights."');
  });

  it("uses the site's primary button and its dark colour, not a style of its own", () => {
    expect(read("src/components/home/HomeCta.tsx")).toContain('variant="primary"');
    expect(read("src/index.css")).toMatch(/\.home-shade \{[\s\S]*hsl\(var\(--shade\)/);
  });

  it("shows no picture bundled in src/assets: only the real photos and footage dropped into public/media/home", () => {
    for (const source of sources) expect(source).not.toMatch(/@\/assets|\.\.\/assets|\/assets\//);
  });

  it("adds no dependency for the carousel", () => {
    const pkg = JSON.parse(read("package.json")) as { dependencies: Record<string, string> };
    for (const name of ["gsap", "lenis", "@studio-freight/lenis", "swiper", "framer-motion", "locomotive-scroll"]) {
      expect(pkg.dependencies[name], name).toBeUndefined();
    }
    expect(carousel).not.toMatch(/embla|swiper|gsap|lenis/i);
  });
});
