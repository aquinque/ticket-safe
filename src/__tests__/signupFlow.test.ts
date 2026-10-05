import { describe, it, expect, vi } from "vitest";
import { signUpWithEmail, type SignupAuthClient, type SignupInput } from "../lib/signupFlow";
import { authErrorMessage, genderToStore, passwordError, suggestEmailFix, isValidEmail, PASSWORD_MIN_LENGTH } from "../lib/authRules";
import { parseFeatureFlag } from "../lib/featureFlags";

const URLS = { afterConfirm: "https://ticket-safe.eu/profile", setPassword: "https://ticket-safe.eu/reset-password" };

const newUser = { identities: [{ id: "i1" }], email_confirmed_at: null };

const fakeAuth = (over: Partial<SignupAuthClient> = {}): SignupAuthClient => ({
  signUp: vi.fn().mockResolvedValue({ data: { user: newUser, session: null }, error: null }),
  resetPasswordForEmail: vi.fn().mockResolvedValue({ error: null }),
  signOut: vi.fn().mockResolvedValue(undefined),
  ...over,
});

const input = (over: Partial<SignupInput> = {}): SignupInput => ({
  email: "chloe@example.com",
  password: "motdepasse1",
  firstName: "Chloé",
  lastName: "D'Arcy",
  gender: "",
  ...over,
});

describe("sign-up: a new address", () => {
  it("creates the account and asks to confirm the email", async () => {
    const auth = fakeAuth();
    const out = await signUpWithEmail(auth, input(), URLS);
    expect(out).toEqual({ kind: "confirm", email: "chloe@example.com" });
    expect(auth.resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it("works without a gender and sends none", async () => {
    const auth = fakeAuth();
    await signUpWithEmail(auth, input({ gender: "" }), URLS);
    const sent = (auth.signUp as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(sent.options.data).not.toHaveProperty("gender");
  });

  it("treats 'prefer not to say' as no gender", async () => {
    const auth = fakeAuth();
    await signUpWithEmail(auth, input({ gender: "prefer_not" }), URLS);
    expect((auth.signUp as ReturnType<typeof vi.fn>).mock.calls[0][0].options.data).not.toHaveProperty("gender");
  });

  it("keeps accents and apostrophes in names", async () => {
    const auth = fakeAuth();
    await signUpWithEmail(auth, input(), URLS);
    const data = (auth.signUp as ReturnType<typeof vi.fn>).mock.calls[0][0].options.data;
    expect(data).toMatchObject({ first_name: "Chloé", last_name: "D'Arcy", full_name: "Chloé D'Arcy" });
  });

  it("sends the chosen gender when one is picked", async () => {
    const auth = fakeAuth();
    await signUpWithEmail(auth, input({ gender: "female" }), URLS);
    expect((auth.signUp as ReturnType<typeof vi.fn>).mock.calls[0][0].options.data.gender).toBe("female");
  });

  it("trims the email and sends the confirmation back to the profile", async () => {
    const auth = fakeAuth();
    await signUpWithEmail(auth, input({ email: "  chloe@example.com " }), URLS);
    const sent = (auth.signUp as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(sent.email).toBe("chloe@example.com");
    expect(sent.options.emailRedirectTo).toBe(URLS.afterConfirm);
  });
});

describe("sign-up: the address already has an account (bought without an account)", () => {
  const existing = { data: { user: { identities: [], email_confirmed_at: null }, session: null }, error: null };

  it("requests a link to choose a password instead of failing", async () => {
    const auth = fakeAuth({ signUp: vi.fn().mockResolvedValue(existing) });
    const out = await signUpWithEmail(auth, input(), URLS);
    expect(out).toEqual({ kind: "existing", email: "chloe@example.com", emailSent: true, notice: null });
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith("chloe@example.com", { redirectTo: URLS.setPassword });
  });

  it("handles the explicit 'already registered' error the same way", async () => {
    const auth = fakeAuth({
      signUp: vi.fn().mockResolvedValue({ data: { user: null, session: null }, error: { code: "user_already_exists", message: "User already registered" } }),
    });
    const out = await signUpWithEmail(auth, input(), URLS);
    expect(out.kind).toBe("existing");
    expect(auth.resetPasswordForEmail).toHaveBeenCalledTimes(1);
  });

  it("still shows the screen when an email was sent less than a minute ago", async () => {
    const auth = fakeAuth({
      signUp: vi.fn().mockResolvedValue(existing),
      resetPasswordForEmail: vi.fn().mockResolvedValue({ error: { code: "over_email_send_rate_limit", status: 429, message: "For security purposes, you can only request this after 42 seconds." } }),
    });
    const out = await signUpWithEmail(auth, input(), URLS);
    expect(out).toMatchObject({ kind: "existing", emailSent: true });
    expect((out as { notice: string }).notice).toContain("moins d'une minute");
  });

  it("says so when the link could not be sent", async () => {
    const auth = fakeAuth({
      signUp: vi.fn().mockResolvedValue(existing),
      resetPasswordForEmail: vi.fn().mockRejectedValue({ name: "AuthRetryableFetchError", status: 0, message: "Failed to fetch" }),
    });
    const out = await signUpWithEmail(auth, input(), URLS);
    expect(out).toMatchObject({ kind: "existing", emailSent: false });
    expect((out as { notice: string }).notice).toContain("réseau");
  });
});

describe("sign-up: refused before or by the server", () => {
  it("names the password rule when it is too short", async () => {
    const auth = fakeAuth();
    const out = await signUpWithEmail(auth, input({ password: "court" }), URLS);
    expect(out).toMatchObject({ kind: "invalid", field: "password" });
    expect((out as { message: string }).message).toContain(`${PASSWORD_MIN_LENGTH} caractères`);
    expect(auth.signUp).not.toHaveBeenCalled();
  });

  it("refuses an invalid email, a missing first name and a missing last name", async () => {
    const auth = fakeAuth();
    expect(await signUpWithEmail(auth, input({ email: "pas-un-email" }), URLS)).toMatchObject({ kind: "invalid", field: "email" });
    expect(await signUpWithEmail(auth, input({ firstName: "  " }), URLS)).toMatchObject({ kind: "invalid", field: "firstName" });
    expect(await signUpWithEmail(auth, input({ lastName: "" }), URLS)).toMatchObject({ kind: "invalid", field: "lastName" });
    expect(auth.signUp).not.toHaveBeenCalled();
  });

  it("never fails silently: a server error always carries a message", async () => {
    const auth = fakeAuth({ signUp: vi.fn().mockResolvedValue({ data: { user: null, session: null }, error: { status: 500, message: "Database error saving new user" } }) });
    const out = await signUpWithEmail(auth, input(), URLS);
    expect(out.kind).toBe("error");
    expect((out as { message: string }).message.length).toBeGreaterThan(10);
  });

  it("never throws when the network drops", async () => {
    const auth = fakeAuth({ signUp: vi.fn().mockRejectedValue(new TypeError("Load failed")) });
    const out = await signUpWithEmail(auth, input(), URLS);
    expect(out).toMatchObject({ kind: "error" });
    expect((out as { message: string }).message).toContain("réseau");
  });
});

describe("sign-up: session edge cases", () => {
  it("signs out a session that exists before the address is confirmed", async () => {
    const auth = fakeAuth({ signUp: vi.fn().mockResolvedValue({ data: { user: newUser, session: {} }, error: null }) });
    const out = await signUpWithEmail(auth, input(), URLS);
    expect(out.kind).toBe("confirm");
    expect(auth.signOut).toHaveBeenCalledTimes(1);
  });

  it("reports signed in when the project confirms accounts automatically", async () => {
    const auth = fakeAuth({ signUp: vi.fn().mockResolvedValue({ data: { user: { identities: [{}], email_confirmed_at: "2026-10-05T10:00:00Z" }, session: {} }, error: null }) });
    expect(await signUpWithEmail(auth, input(), URLS)).toEqual({ kind: "signed_in" });
  });
});

describe("auth rules", () => {
  it("accepts 8 characters with no other constraint", () => {
    expect(passwordError("abcdefgh")).toBeNull();
    expect(passwordError("abcdefg")).toContain("8 caractères");
    expect(passwordError("x".repeat(73))).toContain("72");
  });

  it("validates emails, including school addresses", () => {
    expect(isValidEmail("prenom.nom@edu.escp.eu")).toBe(true);
    expect(isValidEmail("a@b")).toBe(false);
    expect(isValidEmail("a b@c.fr")).toBe(false);
  });

  it("stores only female or male", () => {
    expect(genderToStore("female")).toBe("female");
    expect(genderToStore("male")).toBe("male");
    expect(genderToStore("prefer_not")).toBeNull();
    expect(genderToStore("")).toBeNull();
  });

  it("suggests a fix for common domain typos and nothing otherwise", () => {
    expect(suggestEmailFix("lea@gmial.com")).toBe("lea@gmail.com");
    expect(suggestEmailFix("lea@hotmail.con")).toBe("lea@hotmail.com");
    expect(suggestEmailFix("lea@gmail.com")).toBeNull();
    expect(suggestEmailFix("lea@edu.escp.eu")).toBeNull();
  });

  it("explains rate limits and weak passwords in French", () => {
    expect(authErrorMessage({ code: "over_email_send_rate_limit", status: 429, message: "For security purposes, you can only request this after 30 seconds." })).toContain("une minute");
    expect(authErrorMessage({ code: "over_email_send_rate_limit", status: 429, message: "email rate limit exceeded" })).toContain("Trop d'emails");
    expect(authErrorMessage({ code: "weak_password", message: "Password should be at least 6 characters." })).toContain("8 caractères");
    expect(authErrorMessage(null)).toContain("Une erreur est survenue");
  });
});

describe("resale flag", () => {
  it("is on only for the exact string 'true'", () => {
    expect(parseFeatureFlag("true")).toBe(true);
    expect(parseFeatureFlag(undefined)).toBe(false);
    expect(parseFeatureFlag("false")).toBe(false);
    expect(parseFeatureFlag("1")).toBe(false);
  });
});
