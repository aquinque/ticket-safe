import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  FIRST_SCREEN_MEDIA_DELAY_MS,
  frenchTypography,
  MAX_EVENTS_SHOWN,
  MIN_EVENTS_FOR_GRID,
  canPlayVideo,
  hasEnoughEvents,
  pictureSources,
  resolveHomeLanguage,
  revealDelay,
  videoSources,
} from "../lib/homePage";
import { HOME_CONTENT, HOME_LINKS, HOME_MEDIA, SECTION_IDS, type HomeCopy } from "../content/home";
import { STUDIO_FEE_FIXED_EUR, STUDIO_FEE_MAX_EUR, STUDIO_FEE_PERCENT } from "../lib/studioFee";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("which background media may load", () => {
  const desktop = { isMobile: false, reducedMotion: false, saveData: false, effectiveType: "4g" };

  it("plays video on a desktop with a good connection", () => {
    expect(canPlayVideo(desktop)).toBe(true);
    expect(canPlayVideo({ ...desktop, effectiveType: undefined })).toBe(true);
    expect(canPlayVideo({ ...desktop, effectiveType: null })).toBe(true);
  });

  it("shows the poster only on a phone", () => {
    expect(canPlayVideo({ ...desktop, isMobile: true })).toBe(false);
  });

  it("shows the poster only when data saving is on", () => {
    expect(canPlayVideo({ ...desktop, saveData: true })).toBe(false);
  });

  it("shows the poster only on a slow connection", () => {
    for (const effectiveType of ["slow-2g", "2g", "3g"]) expect(canPlayVideo({ ...desktop, effectiveType })).toBe(false);
  });

  it("shows the poster only for visitors who asked for less motion", () => {
    expect(canPlayVideo({ ...desktop, reducedMotion: true })).toBe(false);
  });
});

describe("how media is described to the browser", () => {
  it("lists WebM first and MP4 as the fallback, or the MP4 alone", () => {
    expect(videoSources({ mp4: "/a.mp4", webm: "/a.webm" })).toEqual([
      { src: "/a.webm", type: "video/webm" },
      { src: "/a.mp4", type: "video/mp4" },
    ]);
    expect(videoSources({ mp4: "/a.mp4" })).toEqual([{ src: "/a.mp4", type: "video/mp4" }]);
  });

  it("only offers the image formats that are listed", () => {
    const image = { src: "/media/home/revente.jpg", width: 1920, height: 1080 };
    expect(pictureSources(image)).toEqual([]);
    expect(pictureSources({ ...image, formats: ["jpg"] })).toEqual([]);
    expect(pictureSources({ ...image, formats: ["avif", "webp", "jpg"] })).toEqual([
      { srcSet: "/media/home/revente.avif", type: "image/avif" },
      { srcSet: "/media/home/revente.webp", type: "image/webp" },
    ]);
    expect(pictureSources({ ...image, formats: ["webp", "jpg"] })).toEqual([{ srcSet: "/media/home/revente.webp", type: "image/webp" }]);
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

describe("the first screen's media", () => {
  it("starts after the first paint, so its weight never slows the page down", () => {
    // Lighthouse mobile scored 80 with a 340 kB poster loaded at once and 91 with it loaded this much later.
    expect(FIRST_SCREEN_MEDIA_DELAY_MS).toBeGreaterThanOrEqual(500);
  });

  it("is applied to the hero image and video", () => {
    const media = read("src/components/home/HomeMedia.tsx");
    expect(media).toContain("useAfterFirstPaint(FIRST_SCREEN_MEDIA_DELAY_MS)");
    expect(media).toMatch(/mayLoad = !priority \|\| painted/);
  });

  it("keeps recharts out of every page's first load", () => {
    // The entry chunk only needs clsx; left unassigned it lands in the charts chunk and drags 105 kB along.
    expect(read("vite.config.ts")).toMatch(/"vendor-react":\s*\[[^\]]*"clsx"/);
  });
});

describe("the upcoming events block", () => {
  it("needs three events for the grid and shows at most four", () => {
    expect(MIN_EVENTS_FOR_GRID).toBe(3);
    expect(MAX_EVENTS_SHOWN).toBe(4);
    expect(hasEnoughEvents(0)).toBe(false);
    expect(hasEnoughEvents(2)).toBe(false);
    expect(hasEnoughEvents(3)).toBe(true);
    expect(hasEnoughEvents(40)).toBe(true);
  });

  it("staggers the reveal with a CSS variable", () => {
    expect(revealDelay(2)).toEqual({ "--i": 2 });
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

  it("has the nine sections in the planned order", () => {
    expect([...SECTION_IDS]).toEqual([
      "hero", "organisateurs", "associatif", "soirees", "revente", "reunions", "plateforme", "evenements", "rejoindre",
    ]);
    for (const lang of langs) expect(Object.keys(HOME_CONTENT[lang].dots).sort()).toEqual([...SECTION_IDS].sort());
    expect(Object.keys(HOME_MEDIA).sort()).toEqual([...SECTION_IDS].sort());
  });

  it("puts a no-break space before French double punctuation, never a plain one", () => {
    expect(frenchTypography("Tu viens ? Oui : 4 % + 0,80 €")).toBe("Tu viens\u00A0? Oui\u00A0: 4\u00A0% + 0,80\u00A0€");
    expect(frenchTypography({ a: ["Prêt ?", "Non"], n: 3 })).toEqual({ a: ["Prêt\u00A0?", "Non"], n: 3 });
    const joined = JSON.stringify(HOME_CONTENT.fr);
    expect(joined).not.toMatch(/ [?!:;%€»]/);
    expect(joined).toContain("venir\u00A0?");
  });

  it("says what was asked in French", () => {
    // The typography above only swaps plain spaces for no-break ones; the words are the ones that were asked for.
    const fr = JSON.parse(JSON.stringify(HOME_CONTENT.fr).replace(/\u00a0/g, " ")) as HomeCopy;
    expect(fr.hero.title).toBe("La billetterie des événements étudiants");
    expect(fr.hero.subtitle).toBe("Vends tes billets, revends-les rapidement.");
    expect(fr.hero.primary.label).toBe("Voir les événements");
    expect(fr.hero.secondary.label).toBe("Organiser un événement");
    expect(fr.organisateurs.title).toBe("Vends tes billets en 5 minutes");
    expect(fr.organisateurs.bullets).toHaveLength(3);
    expect(fr.organisateurs.cta.label).toBe("Ouvrir Ticket Studio");
    expect(fr.associatif.title).toBe("Pensé pour les BDE et les assos");
    expect(fr.associatif.trustedTitle).toBe("Ils nous font confiance");
    expect(fr.soirees.title).toBe("Un scan, et tu entres");
    expect(fr.revente.title).toBe("Tu ne peux plus venir ? Revends rapidement");
    expect(fr.reunions.title).toBe("Et aussi les conférences, forums, réunions");
    expect(fr.plateforme.title).toBe("Une plateforme, trois espaces");
    expect(fr.plateforme.cards.map((c) => c.title)).toEqual(["Acheteur", "Organisateur — Ticket Studio", "Contrôle à l'entrée"]);
    expect(fr.evenements.soon.title).toBe("Bientôt près de chez toi");
    expect(fr.final.title).toBe("Prêt pour ton prochain event ?");
  });

  it("never promises that anything is sold or resold \"safely\", and never talks about scams, fraud or fake tickets", () => {
    // "Safe" is only part of the name TicketSafe. Say what the product does ("resell quickly") instead.
    for (const lang of langs) {
      const words = JSON.stringify(HOME_CONTENT[lang]).replace(/TicketSafe/g, "");
      expect(words, lang).not.toMatch(/safe|secur|sécur|scam|fraud|arnaq|fake|faux|zéro/i);
    }
    expect(HOME_CONTENT.en.hero.subtitle).toBe("Sell your tickets, resell them quickly.");
    expect(HOME_CONTENT.en.revente.title).toBe("Can't make it? Resell quickly");
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
  });

  it("states the service fee from the site-wide constants, in both languages", () => {
    const fixedFr = STUDIO_FEE_FIXED_EUR.toFixed(2).replace(".", ",");
    const maxFr = STUDIO_FEE_MAX_EUR.toFixed(2).replace(".", ",");
    const frPricing = HOME_CONTENT.fr.plateforme.pricing.replace(/\u00a0/g, " ");
    expect(frPricing).toContain(`${STUDIO_FEE_PERCENT} % + ${fixedFr} € par billet, ${maxFr} € maximum`);
    expect(HOME_CONTENT.en.plateforme.pricing).toContain(`${STUDIO_FEE_PERCENT}% + €${STUDIO_FEE_FIXED_EUR.toFixed(2)} per ticket`);
    expect(frPricing).toContain("Rien à payer pour l'organisateur");
  });

  it("points every media path into /media/home and gives every video a poster", () => {
    for (const [id, spec] of Object.entries(HOME_MEDIA)) {
      if (spec.image) expect(spec.image.src, id).toMatch(/^\/media\/home\/[a-z]+\.jpg$/);
      if (spec.video) {
        expect(spec.video.mp4, id).toMatch(/^\/media\/home\/[a-z]+\.mp4$/);
        expect(spec.image, `${id}: a video needs a poster`).toBeDefined();
      }
    }
  });
});

describe("what the README promises is what the content asks for", () => {
  const readme = read("public/media/home/README.md");

  it("lists every file the content refers to", () => {
    for (const spec of Object.values(HOME_MEDIA)) {
      for (const file of [spec.image?.src, spec.video?.mp4, spec.video?.webm]) {
        if (file) expect(readme, file).toContain(file.replace("/media/home/", ""));
      }
    }
  });

  it("keeps the README in the folder the owner drops files into", () => {
    expect(readdirSync(resolve(process.cwd(), "public/media/home"))).toContain("README.md");
  });
});

describe("the page itself", () => {
  const sources = [
    "src/pages/Home.tsx",
    ...readdirSync(resolve(process.cwd(), "src/components/home")).map((f) => `src/components/home/${f}`),
  ].map(read);

  it("has exactly one h1, in the hero", () => {
    const h1s = sources.join("\n").match(/<h1[\s>]/g) ?? [];
    expect(h1s).toHaveLength(1);
    expect(read("src/pages/Home.tsx")).toMatch(/<h1\s[^>]*id="hero-title"/);
  });

  it("names every section with an h2 the section points at", () => {
    const joined = sources.join("\n");
    // SectionText writes `${id}-title`; the two sections that write their own heading do it by hand.
    expect(joined).toContain("id={`${id}-title`}");
    expect(joined).toContain('id="evenements-title"');
    expect(joined).toContain('id="rejoindre-title"');
  });

  it("keeps the site's own header and footer, and the meta tags it had", () => {
    const home = read("src/pages/Home.tsx");
    expect(home).toContain('import HeaderNight from "@/components/HeaderNight"');
    expect(home).toContain('import Footer from "@/components/Footer"');
    expect(home).toContain('title="TicketSafe — Your nights."');
    expect(home).toContain('description="Buy tickets directly from your student union, or organization, or resell yours quickly."');
  });

  it("shows no picture bundled in src/assets: only the real photos and footage dropped into public/media/home", () => {
    for (const source of sources) expect(source).not.toMatch(/@\/assets|\.\.\/assets|\/assets\//);
  });

  it("gives the resale section no call to action", () => {
    const home = read("src/pages/Home.tsx");
    const resale = home.slice(home.indexOf('id="revente"'), home.indexOf('id="reunions"'));
    expect(resale).not.toContain("HomeCta");
    expect(resale).not.toContain("<Link");
  });

  it("adds no dependency for it", () => {
    const pkg = JSON.parse(read("package.json")) as { dependencies: Record<string, string> };
    for (const name of ["gsap", "lenis", "@studio-freight/lenis", "swiper", "framer-motion", "locomotive-scroll"]) {
      expect(pkg.dependencies[name], name).toBeUndefined();
    }
  });
});
