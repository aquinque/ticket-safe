/**
 * Rules and messages shared by the sign-up, sign-in and password screens.
 * Every message here is shown to the user, in English.
 */

/** Supabase Auth requires 6; we ask for 8 and nothing else. */
export const PASSWORD_MIN_LENGTH = 8;
/** Supabase Auth refuses passwords longer than 72 characters. */
export const PASSWORD_MAX_LENGTH = 72;

export const PASSWORD_RULE_TEXT = `At least ${PASSWORD_MIN_LENGTH} characters`;

/** Returns the reason a password is refused, or null when it is accepted. */
export const passwordError = (password: string): string | null => {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password too short: it needs at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return `Password too long: ${PASSWORD_MAX_LENGTH} characters maximum.`;
  }
  return null;
};

export const isValidEmail = (email: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

/** Gender is optional. "prefer_not" and "" are both stored as "not given". */
export type GenderChoice = "" | "female" | "male" | "prefer_not";

export const GENDER_CHOICES: { value: Exclude<GenderChoice, "">; label: string; labelFr: string }[] = [
  { value: "female", label: "Female", labelFr: "Fille" },
  { value: "male", label: "Male", labelFr: "Garçon" },
  { value: "prefer_not", label: "Prefer not to say", labelFr: "Préfère ne pas dire" },
];

/** The value stored on the account: only "female" or "male", otherwise nothing. */
export const genderToStore = (choice: GenderChoice): "female" | "male" | null =>
  choice === "female" || choice === "male" ? choice : null;

const DOMAIN_TYPOS: Record<string, string> = {
  "gmial.com": "gmail.com",
  "gmai.com": "gmail.com",
  "gmal.com": "gmail.com",
  "gmail.co": "gmail.com",
  "gmail.con": "gmail.com",
  "gmail.cm": "gmail.com",
  "gmail.fr": "gmail.com",
  "gnail.com": "gmail.com",
  "hotmial.com": "hotmail.com",
  "hotmai.com": "hotmail.com",
  "hotmail.con": "hotmail.com",
  "hotmail.co": "hotmail.com",
  "outlok.com": "outlook.com",
  "outloo.com": "outlook.com",
  "outlook.con": "outlook.com",
  "yaho.com": "yahoo.com",
  "yahoo.con": "yahoo.com",
  "iclou.com": "icloud.com",
  "icloud.con": "icloud.com",
  "icould.com": "icloud.com",
};

/** Suggests a corrected address for a common domain typo, or null. Never blocks sign-up. */
export const suggestEmailFix = (email: string): string | null => {
  const trimmed = email.trim();
  const at = trimmed.lastIndexOf("@");
  if (at < 1) return null;
  const fixed = DOMAIN_TYPOS[trimmed.slice(at + 1).toLowerCase()];
  return fixed ? `${trimmed.slice(0, at)}@${fixed}` : null;
};

interface AuthErrorLike {
  code?: string;
  status?: number;
  message?: string;
  name?: string;
}

const asAuthError = (error: unknown): AuthErrorLike => (error && typeof error === "object" ? (error as AuthErrorLike) : {});

/** True when Supabase refused to send another email to the same person so soon (1 per minute). */
export const isResendTooSoon = (error: unknown): boolean => {
  const e = asAuthError(error);
  return (e.message ?? "").toLowerCase().includes("only request this after");
};

/** True when sign-up was refused because the address already has an account. */
export const isAlreadyRegisteredError = (error: unknown): boolean => {
  const e = asAuthError(error);
  const message = (e.message ?? "").toLowerCase();
  return e.code === "user_already_exists" || e.code === "email_exists" || message.includes("already registered");
};

/** Turns a Supabase Auth error into a message the user can act on. */
export const authErrorMessage = (error: unknown): string => {
  const e = asAuthError(error);
  const code = e.code ?? "";
  const message = (e.message ?? "").toLowerCase();

  if (isResendTooSoon(error)) {
    return "We've just sent you an email. Wait a minute before asking for another one.";
  }
  if (code === "over_email_send_rate_limit" || message.includes("email rate limit")) {
    return "Too many emails sent right now. Try again in a few minutes.";
  }
  if (code === "over_request_rate_limit" || e.status === 429) {
    return "Too many attempts. Wait a few minutes, then try again.";
  }
  if (code === "weak_password" || message.includes("password should be")) {
    return `Password refused: it needs at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  if (code === "same_password") {
    return "Choose a password different from your old one.";
  }
  if (code === "email_address_invalid" || message.includes("invalid email") || message.includes("validate email") || message.includes("email address") && message.includes("invalid")) {
    return "This email address isn't valid. Check it for typos.";
  }
  if (code === "signup_disabled") {
    return "Sign-ups are closed for now. Try again later.";
  }
  if (e.name === "AuthRetryableFetchError" || e.status === 0 || message.includes("failed to fetch") || message.includes("load failed") || message.includes("network")) {
    return "Unstable internet connection: the request didn't go through. Check your network and try again.";
  }
  if ((e.status ?? 0) >= 500 || message.includes("database error")) {
    return "A technical problem on our side is blocking the request. Try again in a few minutes.";
  }
  return "Something went wrong. Try again, and if it keeps happening, contact us.";
};
