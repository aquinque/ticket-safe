import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  FIRST_SCREEN_MEDIA_DELAY_MS,
  SLIDE_INTERVAL_MS,
  SWIPE_MIN_PX,
  frenchTypography,
  nextSlide,
  pictureSources,
  previousSlide,
  resolveHomeLanguage,
  slideForKey,
  slidePlace,
  swipeDirection,
} from "../lib/homePage";
import { HOME_CONTENT, HOME_LINKS, HOME_SLIDE_MEDIA, SLIDE_IDS, type HomeCopy } from "../content/home";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("the slides", () => {
  it("go round: after the last comes the first, before the first comes the last", () => {
    expect(nextSlide(0, 3)).toBe(1);
    expect(nextSlide(2, 3)).toBe(0);
    expect(previousSlide(1, 3)).toBe(0);
    expect(previousSlide(0, 3)).toBe(2);
  });

  it("wait in three places: in view, parked on the right (next), and on the left (the one that just left)", () => {
    expect([0, 1, 2].map((i) => slidePlace(i, 0, 3))).toEqual(["current", "next", "previous"]);
    expect([0, 1, 2].map((i) => slidePlace(i, 1, 3))).toEqual(["previous", "current", "next"]);
    expect([0, 1, 2].map((i) => slidePlace(i, 2, 3))).toEqual(["next", "previous", "current"]);
  });

  it("always move the same way going forward: parked right, in view, left, then carried back to the right", () => {
    // The slide that leaves goes to the left; the one that arrives comes from the right; the one that was on the
    // left is carried to the right while nobody can see it.
    const cycle = [0, 1, 2, 3, 4, 5].map((active) => slidePlace(1, active, 3));
    expect(cycle).toEqual(["next", "current", "previous", "next", "current", "previous"]);
  });

  it("copes with two slides or one", () => {
    expect([0, 1].map((i) => slidePlace(i, 0, 2))).toEqual(["current", "next"]);
    expect(slidePlace(0, 0, 1)).toBe("current");
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

  it("moves between the tabs with the arrows, Home and End, and ignores other keys", () => {
    expect(slideForKey("ArrowRight", 0, 3)).toBe(1);
    expect(slideForKey("ArrowRight", 2, 3)).toBe(0);
    expect(slideForKey("ArrowLeft", 0, 3)).toBe(2);
    expect(slideForKey("Home", 2, 3)).toBe(0);
    expect(slideForKey("End", 0, 3)).toBe(2);
    expect(slideForKey("Enter", 0, 3)).toBeNull();
    expect(slideForKey("a", 0, 3)).toBeNull();
  });

  it("keeps the time per slide the same in the code and in the stylesheet", () => {
    // The bar under the tab runs for --slide-ms and moving on is triggered by its end, so they must agree.
    const css = read("src/index.css");
    expect(css).toMatch(new RegExp(`--slide-ms:\\s*${SLIDE_INTERVAL_MS}ms`));
  });
});

describe("how a picture is described", () => {
  const image = { src: "/media/home/buy.jpg", width: 1080, height: 1920 };

  it("lists no extra format unless asked: only the JPEG exists until someone adds the others", () => {
    expect(pictureSources(image)).toEqual([]);
    expect(pictureSources({ ...image, formats: ["jpg"] })).toEqual([]);
  });

  it("lists AVIF then WebP when asked, as same-name files", () => {
    expect(pictureSources({ ...image, formats: ["avif", "webp", "jpg"] })).toEqual([
      { srcSet: "/media/home/buy.avif", type: "image/avif" },
      { srcSet: "/media/home/buy.webp", type: "image/webp" },
    ]);
    expect(pictureSources({ ...image, formats: ["webp", "jpg"] })).toEqual([{ srcSet: "/media/home/buy.webp", type: "image/webp" }]);
  });
});

describe("which language the copy is in", () => {
  it("is English unless the visitor picked French", () => {
    expect(resolveHomeLanguage("en")).toBe("en");
    expect(resolveHomeLanguage(null)).toBe("en");
    expect(resolveHomeLanguage(undefined)).toBe("en");
    expect(resolveHomeLanguage("fr")).toBe("fr");
  });

  it("gives English to a language it has no copy for", () => {
    expect(resolveHomeLanguage("es")).toBe("en");
    expect(resolveHomeLanguage("de")).toBe("en");
  });

  it("follows the site language, so the default is the site's own default (English)", () => {
    expect(read("src/hooks/useHomeLanguage.ts")).toContain("useI18n()");
    expect(read("src/contexts/I18nContext.tsx")).toMatch(/return 'en';/);
  });
});

describe("the first screen's pictures", () => {
  it("start after the first paint, so their weight never slows the page down", () => {
    // Lighthouse mobile scored 80 with a 340 kB picture loaded at once and 91 with it loaded this much later.
    expect(FIRST_SCREEN_MEDIA_DELAY_MS).toBeGreaterThanOrEqual(500);
  });

  it("are requested one after the other: the first after the delay, the next once the current one is there", () => {
    const slider = read("src/components/home/HomeSlider.tsx");
    expect(slider).toContain("useAfterFirstPaint(FIRST_SCREEN_MEDIA_DELAY_MS)");
    expect(slider).toMatch(/if \(!painted\) return;/);
    expect(slider).toMatch(/loaded\.includes\(active\) \|\| missing\.includes\(active\)/);
  });

  it("keep recharts out of every page's first load", () => {
    // The entry chunk only needs clsx; left unassigned it lands in the charts chunk and drags 105 kB along.
    expect(read("vite.config.ts")).toMatch(/"vendor-react":\s*\[[^\]]*"clsx"/);
  });
});

describe("the home content", () => {
  const langs = Object.keys(HOME_CONTENT) as (keyof typeof HOME_CONTENT)[];

  /** Every key path of an object, so both languages can be checked to say the same things. */
  const shape = (value: unknown, prefix = ""): string[] =>
    Array.isArray(value)
      ? [`${prefix}[${value.length}]`, ...value.flatMap((v, i) => shape(v, `${prefix}[${i}]`))]
      : value && typeof value === "object"
        ? Object.entries(value).flatMap(([k, v]) => shape(v, prefix ? `${prefix}.${k}` : k))
        : [prefix];

  it("exists in French and English with the same structure", () => {
    expect(langs.sort()).toEqual(["en", "fr"]);
    expect(shape(HOME_CONTENT.en)).toEqual(shape(HOME_CONTENT.fr));
  });

  it("has no empty text", () => {
    const empty = (value: unknown, path: string): string[] =>
      typeof value === "string"
        ? value.trim() === ""
          ? [path]
          : []
        : value && typeof value === "object"
          ? Object.entries(value).flatMap(([k, v]) => empty(v, `${path}.${k}`))
          : [];
    for (const lang of langs) expect(empty(HOME_CONTENT[lang], lang)).toEqual([]);
  });

  it("is the three main functions, in order: buy, sell, scan", () => {
    expect([...SLIDE_IDS]).toEqual(["buy", "sell", "scan"]);
    for (const lang of langs) expect(Object.keys(HOME_CONTENT[lang].slides)).toEqual([...SLIDE_IDS]);
    expect(Object.keys(HOME_SLIDE_MEDIA)).toEqual([...SLIDE_IDS]);
  });

  it("is titled just \"Ticketing platform\"", () => {
    expect(HOME_CONTENT.en.title).toBe("Ticketing platform");
    expect(HOME_CONTENT.fr.title).toBe("Plateforme de billetterie");
  });

  it("puts a no-break space before French double punctuation, never a plain one", () => {
    expect(frenchTypography("Tu viens ? Oui : 4 % + 0,80 €")).toBe("Tu viens\u00A0? Oui\u00A0: 4\u00A0% + 0,80\u00A0€");
    expect(frenchTypography({ a: ["Prêt ?", "Non"], n: 3 })).toEqual({ a: ["Prêt\u00A0?", "Non"], n: 3 });
    const joined = JSON.stringify(HOME_CONTENT.fr);
    expect(joined).not.toMatch(/ [?!:;%€»]/);
    expect(joined).toContain("venir\u00A0?");
  });

  it("says in French what the English says", () => {
    const fr = JSON.parse(JSON.stringify(HOME_CONTENT.fr).replace(/\u00a0/g, " ")) as HomeCopy;
    expect(fr.slides.buy.title).toBe("Achète en 30 secondes");
    expect(fr.slides.buy.body).toBe("Ton billet est dans ton téléphone. Tu ne peux plus venir ? Revends rapidement.");
    expect(fr.slides.buy.cta.label).toBe("Voir les événements");
    expect(fr.slides.sell.title).toBe("Vends en 5 minutes");
    expect(fr.slides.sell.cta.label).toBe("Ouvrir Ticket Studio");
    expect(fr.slides.scan.title).toBe("Scanne à l'entrée");
  });

  it("never promises that anything is sold or resold \"safely\", and never talks about scams, fraud or fake tickets", () => {
    // "Safe" is only part of the name TicketSafe. Say what the product does ("resell quickly") instead.
    for (const lang of langs) {
      const words = JSON.stringify(HOME_CONTENT[lang]).replace(/TicketSafe/g, "");
      expect(words, lang).not.toMatch(/safe|secur|sécur|scam|fraud|arnaq|fake|faux|zéro/i);
    }
    expect(HOME_CONTENT.en.slides.buy.body).toContain("Resell quickly");
    expect(HOME_CONTENT.fr.slides.buy.body).toContain("Revends rapidement");
  });

  it("keeps the header, footer and link previews shown with the home page free of those promises too", () => {
    for (const file of ["src/components/Footer.tsx", "src/components/HeaderNight.tsx", "index.html", "src/pages/Home.tsx"]) {
      expect(read(file), file).not.toMatch(/safely|No scams/i);
    }
    for (const lang of ["en", "fr", "es"]) {
      expect(JSON.parse(read(`src/locales/${lang}.json`)).footer.tagline, lang).not.toMatch(/safely|sécurité|seguridad/i);
    }
  });

  it("points every call to action at a route that exists", () => {
    const app = read("src/App.tsx");
    for (const path of [HOME_LINKS.events, HOME_LINKS.studio, HOME_LINKS.studioOpen]) {
      expect(app, path).toContain(`path="${path}"`);
    }
    for (const lang of langs) {
      for (const slide of Object.values(HOME_CONTENT[lang].slides)) expect(["events", "studio"]).toContain(slide.cta.target);
    }
  });

  it("points every picture into /media/home", () => {
    for (const [id, media] of Object.entries(HOME_SLIDE_MEDIA)) {
      expect(media.image.src, id).toMatch(/^\/media\/home\/[a-z]+\.jpg$/);
      expect(media.position, id).toMatch(/^\d+% \d+%$/);
    }
  });
});

describe("what the README promises is what the content asks for", () => {
  const readme = read("public/media/home/README.md");

  it("lists every picture the content refers to", () => {
    for (const media of Object.values(HOME_SLIDE_MEDIA)) {
      expect(readme, media.image.src).toContain(media.image.src.replace("/media/home/", ""));
    }
  });

  it("says: real photos only, no AI images", () => {
    expect(readme).toMatch(/No AI-generated images/);
  });

  it("keeps the README in the folder the owner drops files into, next to a picture for every slide", () => {
    const files = readdirSync(resolve(process.cwd(), "public/media/home"));
    expect(files).toContain("README.md");
    // Placeholders so the screen is never empty; replacing them must not break this, so only existence is checked.
    for (const media of Object.values(HOME_SLIDE_MEDIA)) expect(files, media.image.src).toContain(media.image.src.split("/").pop());
  });
});

describe("the page itself", () => {
  const slider = read("src/components/home/HomeSlider.tsx");
  const home = read("src/pages/Home.tsx");
  const sources = [home, ...readdirSync(resolve(process.cwd(), "src/components/home")).map((f) => read(`src/components/home/${f}`))];

  it("has exactly one h1, with the title", () => {
    const h1s = sources.join("\n").match(/<h1[\s>]/g) ?? [];
    expect(h1s).toHaveLength(1);
    expect(slider).toMatch(/<h1\s[^>]*id="hero-title"/);
    expect(slider).toContain("{copy.title}");
  });

  it("is a labelled slideshow of three tab panels with a tab each, and a way to pause it", () => {
    expect(slider).toContain('aria-roledescription="carousel"');
    expect(slider).toContain('aria-labelledby="hero-title"');
    expect(slider).toContain('role="tablist"');
    expect(slider).toContain('role="tab"');
    expect(slider).toContain('role="tabpanel"');
    expect(slider).toContain("copy.pause");
    expect(slider).toContain("copy.play");
  });

  it("moves on when the progress bar is full, so pausing the bar pauses the slideshow", () => {
    expect(slider).toContain("onAnimationEnd={i === active ? advance : undefined}");
    const css = read("src/index.css");
    expect(css).toMatch(/\.home-hero\[data-paused="true"\] \.home-progress-fill \{ animation-play-state: paused; \}/);
  });

  it("stops moving when the visitor asks for less motion", () => {
    expect(slider).toContain("useReducedMotion()");
    expect(read("src/index.css")).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*home-progress-fill/);
  });

  it("keeps the site's own header and footer, and the meta tags it has", () => {
    expect(home).toContain('import HeaderNight from "@/components/HeaderNight"');
    expect(home).toContain('import Footer from "@/components/Footer"');
    expect(home).toContain('title="TicketSafe — Your nights."');
    expect(home).toContain('description="Buy tickets directly from your student union, or organization, or resell yours quickly."');
  });

  it("shows no picture bundled in src/assets: only the real photos and footage dropped into public/media/home", () => {
    for (const source of sources) expect(source).not.toMatch(/@\/assets|\.\.\/assets|\/assets\//);
  });

  it("plays no video and adds no dependency for the slider", () => {
    expect(sources.join("\n")).not.toContain("<video");
    const pkg = JSON.parse(read("package.json")) as { dependencies: Record<string, string> };
    for (const name of ["gsap", "lenis", "@studio-freight/lenis", "swiper", "framer-motion", "locomotive-scroll"]) {
      expect(pkg.dependencies[name], name).toBeUndefined();
    }
    expect(slider).not.toMatch(/embla|swiper|gsap|lenis/i);
  });
});
