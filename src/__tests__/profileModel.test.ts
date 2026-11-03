import { describe, expect, it, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import {
  initialsOf,
  nameError,
  newEmailError,
  passwordChangeError,
  passwordRules,
  recapLine,
  schoolError,
  signInMethods,
} from "@/components/profile/profileModel";
import { RESET_RETURN_KEY, RESET_RETURN_TTL_MS, peekResetReturn, rememberResetReturn, requestNewResetLinkPath, takeResetReturn } from "@/lib/resetReturn";
import en from "@/locales/en.json";
import fr from "@/locales/fr.json";
import es from "@/locales/es.json";

/** A tiny t() over the English file, like I18nContext's. */
const t = (key: string, params?: Record<string, string | number>) => {
  let v: unknown = en;
  for (const k of key.split(".")) v = (v as Record<string, unknown>)?.[k];
  if (typeof v !== "string") throw new Error(`missing ${key}`);
  return v.replace(/\{(\w+)\}/g, (_, p) => String(params?.[p]));
};

const flat = (o: Record<string, unknown>, p = ""): string[] =>
  Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" ? flat(v as Record<string, unknown>, `${p}${k}.`) : [`${p}${k}`]));

describe("profile header", () => {
  it("initials come from the name, else the email", () => {
    expect(initialsOf("Alex Morgan")).toBe("AM");
    expect(initialsOf("  léa  ")).toBe("L");
    expect(initialsOf("Jean Pierre Martin")).toBe("JP");
    expect(initialsOf("", "zoe@example.com")).toBe("Z");
    expect(initialsOf("", "")).toBe("?");
  });

  it("recap leaves out zeros and is empty when everything is zero", () => {
    expect(recapLine({ events: 0, tickets: 0, spent: [], resales: 0 }, t)).toBe("");
    expect(recapLine({ events: 3, tickets: 5, spent: [{ value: 42, currency: "EUR" }], resales: 1 }, t)).toBe("3 events · 5 tickets · €42 spent · 1 resale");
    expect(recapLine({ events: 1, tickets: 1, spent: [{ value: 0, currency: "EUR" }], resales: 0 }, t)).toBe("1 event · 1 ticket");
    expect(recapLine({ events: 2, tickets: 2, spent: [{ value: 12.5, currency: "EUR" }, { value: 10, currency: "GBP" }], resales: 2 }, t)).toBe(
      "2 events · 2 tickets · €12.50 + £10 spent · 2 resales",
    );
  });

  it("sign-in methods default to email and password", () => {
    expect(signInMethods(undefined)).toEqual(["email"]);
    expect(signInMethods([{ provider: "email" }, { provider: "google" }, { provider: "email" }])).toEqual(["email", "Google"]);
  });
});

describe("inline validation", () => {
  it("names are required, short and contain a letter", () => {
    expect(nameError("", "first")?.key).toBe("account.errors.firstNameRequired");
    expect(nameError("  ", "last")?.key).toBe("account.errors.lastNameRequired");
    expect(nameError("1234", "first")?.key).toBe("account.errors.nameLetters");
    expect(nameError("x".repeat(61), "first")?.key).toBe("account.errors.tooLong");
    expect(nameError("Zoë", "first")).toBeNull();
  });

  it("school is optional but bounded", () => {
    expect(schoolError("")).toBeNull();
    expect(schoolError("x".repeat(81))?.key).toBe("account.errors.tooLong");
  });

  it("a new email must be valid and new", () => {
    expect(newEmailError("nope", "a@b.co")?.key).toBe("account.errors.emailInvalid");
    expect(newEmailError(" A@B.co ", "a@b.co")?.key).toBe("account.errors.emailSame");
    expect(newEmailError("new@b.co", "a@b.co")).toBeNull();
  });

  it("password change points at the field to fix", () => {
    expect(passwordChangeError({ current: "", next: "longenough", confirm: "longenough" })?.field).toBe("current");
    expect(passwordChangeError({ current: "old-pass1", next: "short", confirm: "short" })?.field).toBe("next");
    expect(passwordChangeError({ current: "same-pass1", next: "same-pass1", confirm: "same-pass1" })?.message.key).toBe("account.errors.passwordSame");
    expect(passwordChangeError({ current: "old-pass1", next: "new-pass12", confirm: "new-pass13" })?.field).toBe("confirm");
    expect(passwordChangeError({ current: "old-pass1", next: "new-pass12", confirm: "new-pass12" })).toBeNull();
    expect(passwordRules("new-pass12", "old-pass1", "new-pass12").every((r) => r.ok)).toBe(true);
    expect(passwordRules("", "", "").some((r) => r.ok)).toBe(false);
  });
});

describe("translations", () => {
  it("every account key exists in English, French and Spanish", () => {
    const keys = flat(en.account as Record<string, unknown>);
    expect(keys.length).toBeGreaterThan(100);
    expect(flat(fr.account as Record<string, unknown>).sort()).toEqual([...keys].sort());
    expect(flat(es.account as Record<string, unknown>).sort()).toEqual([...keys].sort());
  });

  it("every account.* key used by the profile code exists", () => {
    const files = ["src/pages/Profile.tsx", "src/components/profile/PasswordChangeRow.tsx", "src/components/profile/profileModel.ts"];
    const used = new Set<string>();
    for (const f of files) for (const m of readFileSync(f, "utf8").matchAll(/["'`](account\.[A-Za-z_.]+)["'`]/g)) used.add(m[1]);
    const known = new Set(flat(en.account as Record<string, unknown>).map((k) => `account.${k}`));
    const dynamic = [...used].filter((k) => k.endsWith("."));
    expect(dynamic).toEqual([]);
    expect([...used].filter((k) => !known.has(k))).toEqual([]);
  });
});

describe("password reset brings the person back", () => {
  beforeEach(() => localStorage.clear());
  const now = 1_800_000_000_000;

  it("returns to the page remembered when the email was asked for, once", () => {
    rememberResetReturn("/e/midnight-party?ref=abc", now);
    expect(peekResetReturn(now + 1000)).toBe("/e/midnight-party?ref=abc");
    expect(requestNewResetLinkPath(now + 1000)).toBe("/auth?mode=reset&next=%2Fe%2Fmidnight-party%3Fref%3Dabc");
    expect(takeResetReturn("/", now + 60_000)).toBe("/e/midnight-party?ref=abc");
    expect(takeResetReturn("/", now + 60_000)).toBe("/");
  });

  it("falls back to the home when nothing, stale or unsafe is stored", () => {
    expect(takeResetReturn("/", now)).toBe("/");
    rememberResetReturn("/tickets", now);
    expect(takeResetReturn("/", now + RESET_RETURN_TTL_MS + 1)).toBe("/");
    localStorage.setItem(RESET_RETURN_KEY, JSON.stringify({ path: "//evil.example", at: now }));
    expect(takeResetReturn("/", now)).toBe("/");
    localStorage.setItem(RESET_RETURN_KEY, "{not json");
    expect(takeResetReturn("/", now)).toBe("/");
    rememberResetReturn("https://evil.example/x", now);
    expect(localStorage.getItem(RESET_RETURN_KEY)).toBeNull();
    expect(requestNewResetLinkPath(now)).toBe("/auth?mode=reset");
  });

  it("the reset page never sends to the profile, and sign-in still follows ?next=", () => {
    const reset = readFileSync("src/pages/ResetPassword.tsx", "utf8");
    expect(reset).toContain("takeResetReturn(");
    expect(reset).not.toMatch(/navigate\(["']\/profile/);
    const auth = readFileSync("src/pages/Auth.tsx", "utf8");
    expect(auth.match(/rememberResetReturn\(destination\(\)\)/g)?.length).toBe(2);
    expect(auth).toContain('safeReturnPath(searchParams.get("next"))');
  });
});

describe("menus", () => {
  it("Profile comes first, before My tickets and My wallet, in the night header", () => {
    const src = readFileSync("src/components/HeaderNight.tsx", "utf8");
    const mobile = src.slice(src.indexOf('{ to: "/profile", label: "Profile"'));
    expect(mobile.indexOf('"/profile"')).toBeLessThan(mobile.indexOf('"/my-tickets"'));
    expect(mobile.indexOf('"/my-tickets"')).toBeLessThan(mobile.indexOf('"/settings/listings"'));
    expect(mobile.indexOf('"/settings/listings"')).toBeLessThan(mobile.indexOf('"/promoter", label: "Promoter space"'));
    // the desktop initials are a link to the profile
    expect(src).toMatch(/<Link\s+to="\/profile"[\s\S]{0,700}\{initials\}/);
  });
});
