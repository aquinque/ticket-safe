import { describe, it, expect } from "vitest";
import {
  buildAuthEmailContent,
  firstNameFrom,
  isAccountActivation,
  nextPathFor,
  type AuthEmailAction,
} from "../../supabase/functions/_shared/authEmailContent.ts";

const LINK = "https://ticket-safe.eu/auth/confirm?token_hash=abc&type=signup&next=%2Fprofile";
const build = (action: AuthEmailAction, metadata: Record<string, unknown> = { first_name: "Chloé" }) =>
  buildAuthEmailContent({ user: { email: "chloe@example.com", user_metadata: metadata }, action, link: LINK, otp: "123456" });

const ALL_ACTIONS: AuthEmailAction[] = [
  "signup", "login", "invite", "magiclink", "recovery",
  "email_change", "email_change_current", "email_change_new", "reauthentication",
];

describe("account emails", () => {
  it("every email has a subject, a title, HTML and a text version", () => {
    for (const action of ALL_ACTIONS) {
      const c = build(action);
      for (const part of [c.subject, c.title, c.eyebrow, c.preheader, c.bodyHtml, c.text]) {
        expect(part.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("the sign-up email is in French and carries the link in HTML and text", () => {
    const c = build("signup");
    expect(c.subject).toBe("Active ton compte Ticket Safe");
    expect(c.bodyHtml).toContain("Bonjour Chloé,");
    expect(c.bodyHtml).toContain("Activer mon compte");
    expect(c.bodyHtml).toContain("token_hash=abc");
    expect(c.text).toContain(LINK);
  });

  it("no longer says the platform is for one school", () => {
    for (const action of ALL_ACTIONS) {
      const c = build(action);
      expect(`${c.bodyHtml} ${c.text} ${c.subject}`).not.toMatch(/ESCP/i);
    }
  });

  it("an account created by a purchase gets an activation email, not a reset", () => {
    const c = build("recovery", { guest_shadow: true, full_name: "Léa Martin" });
    expect(c.subject).toBe("Active ton compte Ticket Safe");
    expect(c.bodyHtml).toContain("Tu as acheté un billet");
    expect(c.bodyHtml).toContain("Bonjour Léa,");
    expect(c.bodyHtml).not.toContain("changer le mot de passe");
  });

  it("once activated, the same account gets the normal password email", () => {
    const c = build("recovery", { guest_shadow: true, account_activated_at: "2026-10-05T10:00:00Z", full_name: "Léa Martin" });
    expect(c.subject).toContain("nouveau mot de passe");
    expect(c.bodyHtml).not.toContain("Tu as acheté un billet");
  });

  it("a regular account gets the normal password email", () => {
    expect(build("recovery").subject).toContain("nouveau mot de passe");
  });

  it("escapes names so they cannot inject markup", () => {
    const c = build("signup", { first_name: '<img src=x onerror="alert(1)">' });
    expect(c.bodyHtml).not.toContain("<img");
    expect(c.bodyHtml).toContain("&lt;img");
  });

  it("keeps apostrophes and accents readable", () => {
    const c = build("signup", { first_name: "D'Arcy" });
    expect(c.bodyHtml).toContain("Bonjour D&#39;Arcy,");
    expect(c.text).toContain("Bonjour D'Arcy,");
  });

  it("greets without a name rather than with the email's local part", () => {
    const c = build("signup", {});
    expect(c.bodyHtml).toContain("Bonjour,");
    expect(c.bodyHtml).not.toContain("Bonjour chloe");
  });

  it("only the verification email shows the 6-digit code", () => {
    expect(build("reauthentication").bodyHtml).toContain("123456");
    expect(build("signup").bodyHtml).not.toContain("123456");
    expect(build("recovery").bodyHtml).not.toContain("123456");
  });
});

describe("name and activation helpers", () => {
  it("prefers first_name, then the first word of full_name", () => {
    expect(firstNameFrom({ email: "a@b.fr", user_metadata: { first_name: " Inès ", full_name: "X Y" } })).toBe("Inès");
    expect(firstNameFrom({ email: "a@b.fr", user_metadata: { full_name: "Jean-Paul Dupont" } })).toBe("Jean-Paul");
    expect(firstNameFrom({ email: "a@b.fr" })).toBe("");
  });

  it("activation applies only to purchase-created accounts not yet activated", () => {
    expect(isAccountActivation({ email: "a@b.fr", user_metadata: { guest_shadow: true } })).toBe(true);
    expect(isAccountActivation({ email: "a@b.fr", user_metadata: { guest_shadow: true, account_activated_at: "x" } })).toBe(false);
    expect(isAccountActivation({ email: "a@b.fr", user_metadata: {} })).toBe(false);
    expect(isAccountActivation({ email: "a@b.fr" })).toBe(false);
  });
});

describe("where the email link lands", () => {
  it("a password link always opens the page to choose the password", () => {
    expect(nextPathFor("recovery", "https://ticket-safe.eu/reset-password")).toBe("/reset-password");
    expect(nextPathFor("recovery", "https://ticket-safe.eu")).toBe("/reset-password");
    expect(nextPathFor("recovery", undefined)).toBe("/reset-password");
  });

  it("a confirmation link opens the requested page", () => {
    expect(nextPathFor("signup", "https://ticket-safe.eu/profile")).toBe("/profile");
    expect(nextPathFor("signup", "https://ticket-safe.eu/studio")).toBe("/studio");
  });

  it("falls back to the profile when the redirect is the site root or missing", () => {
    expect(nextPathFor("signup", "https://ticket-safe.eu")).toBe("/profile");
    expect(nextPathFor("signup", "https://ticket-safe.eu/")).toBe("/profile");
    expect(nextPathFor("signup", "")).toBe("/profile");
    expect(nextPathFor("signup", null)).toBe("/profile");
  });

  it("refuses protocol-relative redirects", () => {
    expect(nextPathFor("signup", "//evil.example/x")).toBe("/profile");
  });
});
