import { authErrorMessage, genderToStore, isAlreadyRegisteredError, isResendTooSoon, isValidEmail, passwordError, type GenderChoice } from "@/lib/authRules";

/** The part of supabase.auth this flow needs. Kept small so it can be faked in tests. */
export interface SignupAuthClient {
  signUp(args: {
    email: string;
    password: string;
    options?: { emailRedirectTo?: string; data?: Record<string, unknown> };
  }): Promise<{
    data: {
      user: { identities?: unknown[] | null; email_confirmed_at?: string | null } | null;
      session: unknown | null;
    };
    error: unknown | null;
  }>;
  resetPasswordForEmail(email: string, options?: { redirectTo?: string }): Promise<{ error: unknown | null }>;
  signOut(): Promise<unknown>;
}

export interface SignupInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  gender: GenderChoice;
}

export type SignupField = "email" | "firstName" | "lastName" | "password";

export type SignupOutcome =
  /** A field is wrong. Nothing was sent to the server. */
  | { kind: "invalid"; field: SignupField; message: string }
  /** New account created. A confirmation email was sent. */
  | { kind: "confirm"; email: string }
  /**
   * The address already has an account, usually created automatically by a
   * purchase without an account. A link to choose a password was requested, so
   * the person proves they own the address before getting in.
   */
  | { kind: "existing"; email: string; emailSent: boolean; notice: string | null }
  /** The project confirms accounts automatically: the person is signed in. */
  | { kind: "signed_in" }
  | { kind: "error"; message: string };

async function existingAccount(auth: SignupAuthClient, email: string, setPasswordUrl: string): Promise<SignupOutcome> {
  try {
    const { error } = await auth.resetPasswordForEmail(email, { redirectTo: setPasswordUrl });
    if (!error) return { kind: "existing", email, emailSent: true, notice: null };
    if (isResendTooSoon(error)) {
      return { kind: "existing", email, emailSent: true, notice: "Un email t'a déjà été envoyé il y a moins d'une minute." };
    }
    return { kind: "existing", email, emailSent: false, notice: authErrorMessage(error) };
  } catch (error) {
    return { kind: "existing", email, emailSent: false, notice: authErrorMessage(error) };
  }
}

/**
 * Creates an account with an email and a password.
 * Never throws: every failure comes back as an outcome with a message to show.
 */
export async function signUpWithEmail(
  auth: SignupAuthClient,
  input: SignupInput,
  urls: { afterConfirm: string; setPassword: string },
): Promise<SignupOutcome> {
  const email = input.email.trim();
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();

  if (!firstName) return { kind: "invalid", field: "firstName", message: "Indique ton prénom." };
  if (!lastName) return { kind: "invalid", field: "lastName", message: "Indique ton nom." };
  if (!isValidEmail(email)) {
    return { kind: "invalid", field: "email", message: "Cette adresse email n'est pas valide. Vérifie qu'il n'y a pas de faute de frappe." };
  }
  const passwordProblem = passwordError(input.password);
  if (passwordProblem) return { kind: "invalid", field: "password", message: passwordProblem };

  const gender = genderToStore(input.gender);

  try {
    const { data, error } = await auth.signUp({
      email,
      password: input.password,
      options: {
        emailRedirectTo: urls.afterConfirm,
        data: {
          first_name: firstName,
          last_name: lastName,
          full_name: `${firstName} ${lastName}`,
          ...(gender ? { gender } : {}),
        },
      },
    });

    if (error) {
      if (isAlreadyRegisteredError(error)) return existingAccount(auth, email, urls.setPassword);
      return { kind: "error", message: authErrorMessage(error) };
    }

    // Supabase answers with a user that has no identity when the address already has an account.
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      return existingAccount(auth, email, urls.setPassword);
    }

    if (data.session) {
      if (data.user?.email_confirmed_at) return { kind: "signed_in" };
      // A session must not exist before the address is confirmed.
      try {
        await auth.signOut();
      } catch {
        /* the confirmation screen is shown either way */
      }
    }

    return { kind: "confirm", email };
  } catch (error) {
    return { kind: "error", message: authErrorMessage(error) };
  }
}
