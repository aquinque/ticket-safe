/**
 * Pure helpers for the profile page: no React, no Supabase, tested in src/__tests__/profileModel.test.ts.
 *
 * Messages are returned as translation keys (src/locales/*.json, "account" namespace) with their
 * parameters, so the page shows them in the visitor's language.
 */
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, isValidEmail } from "@/lib/authRules";

export interface Msg {
  key: string;
  params?: Record<string, string | number>;
}

export type Translate = (key: string, params?: Record<string, string | number>) => string;

export const NAME_MAX_LENGTH = 60;
export const SCHOOL_MAX_LENGTH = 80;

/** "AM" for "Alex Morgan", "A" for "alex", "?" when there is nothing to go on. */
export function initialsOf(name: string, email = ""): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length) return parts.slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");
  const local = email.trim()[0];
  return local ? local.toUpperCase() : "?";
}

/** A first or last name: required, at most NAME_MAX_LENGTH characters, letters somewhere in it. */
export function nameError(value: string, field: "first" | "last"): Msg | null {
  const v = value.trim();
  if (!v) return { key: field === "first" ? "account.errors.firstNameRequired" : "account.errors.lastNameRequired" };
  if (v.length > NAME_MAX_LENGTH) return { key: "account.errors.tooLong", params: { max: NAME_MAX_LENGTH } };
  if (!/\p{L}/u.test(v)) return { key: "account.errors.nameLetters" };
  return null;
}

/** School or organisation: optional, at most SCHOOL_MAX_LENGTH characters. */
export function schoolError(value: string): Msg | null {
  return value.trim().length > SCHOOL_MAX_LENGTH ? { key: "account.errors.tooLong", params: { max: SCHOOL_MAX_LENGTH } } : null;
}

/** A new sign-in email: valid, and different from the current one. */
export function newEmailError(value: string, current: string): Msg | null {
  const v = value.trim();
  if (!isValidEmail(v)) return { key: "account.errors.emailInvalid" };
  if (v.toLowerCase() === current.trim().toLowerCase()) return { key: "account.errors.emailSame" };
  return null;
}

export interface PasswordChange {
  current: string;
  next: string;
  confirm: string;
}

export type PasswordField = keyof PasswordChange;

/** The first problem with a password change form, attached to the field to fix. */
export function passwordChangeError(p: PasswordChange): { field: PasswordField; message: Msg } | null {
  if (!p.current) return { field: "current", message: { key: "account.errors.currentRequired" } };
  if (p.next.length < PASSWORD_MIN_LENGTH) return { field: "next", message: { key: "account.errors.passwordShort", params: { min: PASSWORD_MIN_LENGTH } } };
  if (p.next.length > PASSWORD_MAX_LENGTH) return { field: "next", message: { key: "account.errors.passwordLong", params: { max: PASSWORD_MAX_LENGTH } } };
  if (p.next === p.current) return { field: "next", message: { key: "account.errors.passwordSame" } };
  if (p.confirm !== p.next) return { field: "confirm", message: { key: "account.errors.passwordMismatch" } };
  return null;
}

/** The rules shown under the new password, each ticked once met. */
export function passwordRules(next: string, current: string, confirm: string): { label: Msg; ok: boolean }[] {
  return [
    { label: { key: "account.password.ruleLength", params: { min: PASSWORD_MIN_LENGTH } }, ok: next.length >= PASSWORD_MIN_LENGTH && next.length <= PASSWORD_MAX_LENGTH },
    { label: { key: "account.password.ruleDifferent" }, ok: next.length > 0 && next !== current },
    { label: { key: "account.password.ruleMatch" }, ok: next.length > 0 && next === confirm },
  ];
}

export interface RecapInput {
  events: number;
  tickets: number;
  /** One amount per currency, in major units. */
  spent: { value: number; currency: string }[];
  resales: number;
}

const plural = (t: Translate, n: number, base: string) => t(`account.recap.${base}${n === 1 ? "One" : "Other"}`, { count: n });

/** "3 events · 5 tickets · €42 spent · 1 resale", leaving out what is zero; "" when everything is. */
export function recapLine(r: RecapInput, t: Translate, locale = "en-GB"): string {
  const parts: string[] = [];
  if (r.events > 0) parts.push(plural(t, r.events, "event"));
  if (r.tickets > 0) parts.push(plural(t, r.tickets, "ticket"));
  const spent = r.spent.filter((a) => a.value > 0);
  if (spent.length) {
    const fmt = (a: { value: number; currency: string }) =>
      new Intl.NumberFormat(locale, { style: "currency", currency: a.currency, maximumFractionDigits: a.value % 1 === 0 ? 0 : 2 }).format(a.value);
    parts.push(t("account.recap.spent", { amount: spent.map(fmt).join(" + ") }));
  }
  if (r.resales > 0) parts.push(plural(t, r.resales, "resale"));
  return parts.join(" · ");
}

/** Brand names stay as they are; "email" is translated by the page (account.security.methodEmail). */
const PROVIDER_LABELS: Record<string, string> = {
  email: "email",
  google: "Google",
  apple: "Apple",
  azure: "Microsoft",
  facebook: "Facebook",
  github: "GitHub",
};

/** The ways this account can sign in, from Supabase's identities; "email" (email and password) when none are listed. */
export function signInMethods(identities: { provider: string }[] | null | undefined): string[] {
  const seen = [...new Set((identities ?? []).map((i) => i.provider))];
  const labels = seen.map((p) => PROVIDER_LABELS[p] ?? p.charAt(0).toUpperCase() + p.slice(1));
  return labels.length ? labels : [PROVIDER_LABELS.email];
}
