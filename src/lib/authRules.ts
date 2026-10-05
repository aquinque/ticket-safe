/**
 * Rules and messages shared by the sign-up, sign-in and password screens.
 * Every message here is shown to the user, in French.
 */

/** Supabase Auth requires 6; we ask for 8 and nothing else. */
export const PASSWORD_MIN_LENGTH = 8;
/** Supabase Auth refuses passwords longer than 72 characters. */
export const PASSWORD_MAX_LENGTH = 72;

export const PASSWORD_RULE_TEXT = `Au moins ${PASSWORD_MIN_LENGTH} caractères`;

/** Returns the reason a password is refused, or null when it is accepted. */
export const passwordError = (password: string): string | null => {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Mot de passe trop court : il doit faire au moins ${PASSWORD_MIN_LENGTH} caractères.`;
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return `Mot de passe trop long : ${PASSWORD_MAX_LENGTH} caractères maximum.`;
  }
  return null;
};

export const isValidEmail = (email: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

/** Gender is optional. "prefer_not" and "" are both stored as "not given". */
export type GenderChoice = "" | "female" | "male" | "prefer_not";

export const GENDER_CHOICES: { value: Exclude<GenderChoice, "">; label: string }[] = [
  { value: "female", label: "Fille" },
  { value: "male", label: "Garçon" },
  { value: "prefer_not", label: "Préfère ne pas dire" },
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
    return "Un email vient déjà de t'être envoyé. Attends une minute avant d'en redemander un.";
  }
  if (code === "over_email_send_rate_limit" || message.includes("email rate limit")) {
    return "Trop d'emails envoyés en ce moment. Réessaie dans quelques minutes.";
  }
  if (code === "over_request_rate_limit" || e.status === 429) {
    return "Trop de tentatives. Attends quelques minutes puis réessaie.";
  }
  if (code === "weak_password" || message.includes("password should be")) {
    return `Mot de passe refusé : il doit faire au moins ${PASSWORD_MIN_LENGTH} caractères.`;
  }
  if (code === "same_password") {
    return "Choisis un mot de passe différent de l'ancien.";
  }
  if (code === "email_address_invalid" || message.includes("invalid email") || message.includes("validate email") || message.includes("email address") && message.includes("invalid")) {
    return "Cette adresse email n'est pas valide. Vérifie qu'il n'y a pas de faute de frappe.";
  }
  if (code === "signup_disabled") {
    return "Les inscriptions sont fermées pour le moment. Réessaie plus tard.";
  }
  if (e.name === "AuthRetryableFetchError" || e.status === 0 || message.includes("failed to fetch") || message.includes("load failed") || message.includes("network")) {
    return "Connexion internet instable : la demande n'est pas partie. Vérifie ton réseau et réessaie.";
  }
  if ((e.status ?? 0) >= 500 || message.includes("database error")) {
    return "Un problème technique de notre côté bloque la demande. Réessaie dans quelques minutes.";
  }
  return "Une erreur est survenue. Réessaie, et si ça continue, contacte-nous.";
};
