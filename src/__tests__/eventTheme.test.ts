import { describe, expect, it } from "vitest";
import { NIGHT, contrast, ensureContrast, eventThemeVars, hexToHslTriplet, readableOn } from "@/lib/eventTheme";

describe("eventTheme", () => {
  it("turns hex into the HSL triplet Tailwind tokens use", () => {
    expect(hexToHslTriplet("#FFFFFF")).toBe("0 0% 100%");
    expect(hexToHslTriplet("#000000")).toBe("0 0% 0%");
    expect(hexToHslTriplet("#3A5FE6")).toBe("227 77% 56%");
  });

  it("keeps the organizer's primary colour and derives a readable button label", () => {
    const red = eventThemeVars({ primary: "#b51a00" });
    expect(red["--event-primary"]).toBe("#B51A00");
    expect(red["--event-primary-fg"]).toBe("#FFFFFF");

    const yellow = eventThemeVars({ primary: "#F5C400" });
    expect(yellow["--event-primary"]).toBe("#F5C400");
    expect(yellow["--event-primary-fg"]).toBe("#0B1024");
    expect(contrast(yellow["--event-primary"], yellow["--event-primary-fg"])).toBeGreaterThanOrEqual(4.5);
  });

  it("falls back to the night theme when the colour is missing or malformed", () => {
    expect(eventThemeVars({ primary: null })["--event-primary"]).toBe(NIGHT.primary);
    expect(eventThemeVars({ primary: "red" })["--event-primary"]).toBe(NIGHT.primary);
    expect(eventThemeVars({ primary: "#fff" })["--event-bg"]).toBe(NIGHT.background);
  });

  it("keeps a chosen background but swaps an unreadable text colour", () => {
    const bad = eventThemeVars({ primary: "#B51A00", background: "#FFFFFF", text: "#F2F2F2" });
    expect(bad["--event-bg"]).toBe("#FFFFFF");
    expect(bad["--event-text"]).toBe("#0B1024");
    expect(contrast(bad["--event-bg"], bad["--event-text"])).toBeGreaterThanOrEqual(4.5);

    const good = eventThemeVars({ primary: "#B51A00", background: "#FFFFFF", text: "#222222" });
    expect(good["--event-text"]).toBe("#222222");
  });

  it("derives surfaces in the background's own direction", () => {
    const onDark = eventThemeVars({ primary: "#3A5FE6" });
    expect(onDark["--event-card"] > onDark["--event-bg"]).toBe(true); // lighter hex sorts after
    const onLight = eventThemeVars({ primary: "#3A5FE6", background: "#FFFFFF" });
    expect(onLight["--event-card"]).not.toBe("#FFFFFF");
    expect(contrast(onLight["--event-text"], onLight["--event-bg"])).toBeGreaterThanOrEqual(4.5);
  });

  it("nudges only the text use of a primary that vanishes on the page", () => {
    const navyOnNavy = ensureContrast("#1A2744", "#1A2744", 3);
    expect(navyOnNavy).not.toBe("#1A2744");
    expect(contrast(navyOnNavy, "#1A2744")).toBeGreaterThanOrEqual(3);
    expect(ensureContrast("#FFFFFF", "#1A2744", 3)).toBe("#FFFFFF");
    expect(readableOn("#000000")).toBe("#FFFFFF");
  });
});
