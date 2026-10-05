/**
 * Content of the account emails (confirmation, password, sign-in link…), in French.
 *
 * Pure: no network, no Deno API. send-auth-email wraps the result in the shared
 * email shell and sends it. Kept apart so it can be unit-tested from the web app's
 * test suite (src/__tests__/authEmailContent.test.ts).
 */

import { ctaButton, codeBlock, escapeHtml } from "./emailComponents.ts";
import { emailTokens, legalFooter } from "./emailTokens.ts";

export type AuthEmailAction =
  | "signup"
  | "login"
  | "invite"
  | "magiclink"
  | "recovery"
  | "email_change"
  | "email_change_current"
  | "email_change_new"
  | "reauthentication";

export interface AuthEmailUser {
  email: string;
  user_metadata?: Record<string, unknown>;
}

export interface AuthEmailContent {
  subject: string;
  eyebrow: string;
  title: string;
  preheader: string;
  bodyHtml: string;
  text: string;
}

/** First name to greet with, or "" when the account has no real name yet. */
export function firstNameFrom(user: AuthEmailUser): string {
  const meta = (user.user_metadata ?? {}) as { first_name?: unknown; full_name?: unknown };
  if (typeof meta.first_name === "string" && meta.first_name.trim()) return meta.first_name.trim();
  if (typeof meta.full_name === "string" && meta.full_name.trim()) return meta.full_name.trim().split(/\s+/)[0];
  return "";
}

/**
 * True for an account created automatically by a purchase without an account,
 * whose owner has not chosen a password yet. Their "recovery" email is really
 * an account activation, and is worded that way.
 */
export function isAccountActivation(user: AuthEmailUser): boolean {
  const meta = user.user_metadata ?? {};
  return meta.guest_shadow === true && !meta.account_activated_at;
}

/**
 * Page to open once the link is verified.
 *
 * It is read from the redirect the app asked for. Two cases are forced so the
 * person never lands somewhere useless:
 *  - a password link always opens the page where the password is chosen;
 *  - a missing or root redirect (what Supabase falls back to when the requested
 *    redirect is not on its allow-list) opens the profile.
 */
export function nextPathFor(action: AuthEmailAction, redirectTo: string | null | undefined): string {
  if (action === "recovery") return "/reset-password";

  let next = "";
  try {
    const url = new URL(redirectTo ?? "");
    next = url.pathname + url.search + url.hash;
  } catch {
    if (redirectTo?.startsWith("/") && !redirectTo.startsWith("//")) next = redirectTo;
  }
  return next === "" || next === "/" ? "/profile" : next;
}

const muted = (html: string) =>
  `<p style="margin:18px 0 0;font-size:13px;color:${emailTokens.textMuted}">${html}</p>`;

export function buildAuthEmailContent(args: {
  user: AuthEmailUser;
  action: AuthEmailAction;
  /** Link to the app that completes the action. */
  link: string;
  /** 6-digit code, shown only where the app asks for one. */
  otp: string;
}): AuthEmailContent {
  const { user, action, link, otp } = args;
  const name = firstNameFrom(user);
  const hello = name ? `Bonjour ${escapeHtml(name)},` : "Bonjour,";
  const greeting = `<p style="margin:0 0 16px">${hello}</p>`;
  const textHello = name ? `Bonjour ${name},` : "Bonjour,";

  const fallback = `<p style="margin:18px 0 0;font-size:12px;color:${emailTokens.textMuted}">
    Si le bouton ne marche pas, copie ce lien dans ton navigateur :<br>
    <span style="color:${emailTokens.textPrimary};word-break:break-all">${escapeHtml(link)}</span>
  </p>`;
  const textFallback = `Lien : ${link}`;
  const expiry = "Ce lien est valable pour une durée limitée. S'il a expiré, tu peux en redemander un depuis la page de connexion.";

  switch (action) {
    case "signup":
      return {
        subject: "Active ton compte Ticket Safe",
        eyebrow: "Compte · Confirmation",
        title: "Bienvenue sur Ticket Safe",
        preheader: "Clique sur le lien pour activer ton compte.",
        bodyHtml: `
          ${greeting}
          <p style="margin:0 0 16px">Plus qu'une étape : confirme ton adresse email pour activer ton compte.</p>
          ${ctaButton("Activer mon compte", link)}
          ${muted(`${expiry} Si tu n'es pas à l'origine de cette inscription, ignore cet email.`)}
          ${muted("In English: use the button above to activate your account.")}
          ${fallback}
        `,
        text: `${textHello}\n\nConfirme ton adresse email pour activer ton compte Ticket Safe.\n\n${textFallback}\n\n${expiry}\nSi tu n'es pas à l'origine de cette inscription, ignore cet email.`,
      };

    case "recovery":
      if (isAccountActivation(user)) {
        return {
          subject: "Active ton compte Ticket Safe",
          eyebrow: "Compte · Activation",
          title: "Active ton compte",
          preheader: "Choisis ton mot de passe pour retrouver tes billets.",
          bodyHtml: `
            ${greeting}
            <p style="margin:0 0 16px">Tu as acheté un billet sur Ticket Safe avec cette adresse : ton compte a été créé à ce moment-là. Il ne te reste qu'à choisir ton mot de passe pour l'activer et retrouver tes billets.</p>
            ${ctaButton("Activer mon compte", link)}
            ${muted(`${expiry} Si tu n'as rien demandé, ignore cet email : rien ne change et tes billets restent valables.`)}
            ${muted("In English: use the button above to choose your password and find your tickets.")}
            ${fallback}
          `,
          text: `${textHello}\n\nTu as acheté un billet sur Ticket Safe avec cette adresse : ton compte existe déjà. Choisis ton mot de passe pour l'activer et retrouver tes billets.\n\n${textFallback}\n\n${expiry}\nSi tu n'as rien demandé, ignore cet email : tes billets restent valables.`,
        };
      }
      return {
        subject: "Choisis un nouveau mot de passe — Ticket Safe",
        eyebrow: "Compte · Mot de passe",
        title: "Nouveau mot de passe",
        preheader: "Clique sur le lien pour choisir un nouveau mot de passe.",
        bodyHtml: `
          ${greeting}
          <p style="margin:0 0 16px">On a reçu une demande pour changer le mot de passe de ton compte Ticket Safe. Clique ci-dessous pour en choisir un nouveau.</p>
          ${ctaButton("Choisir mon mot de passe", link)}
          ${muted(`${expiry} Si tu n'as rien demandé, ignore cet email : ton mot de passe reste le même.`)}
          ${muted("In English: use the button above to choose a new password.")}
          ${fallback}
        `,
        text: `${textHello}\n\nOn a reçu une demande pour changer le mot de passe de ton compte Ticket Safe.\n\n${textFallback}\n\n${expiry}\nSi tu n'as rien demandé, ignore cet email : ton mot de passe reste le même.`,
      };

    case "magiclink":
      return {
        subject: "Ton lien de connexion Ticket Safe",
        eyebrow: "Compte · Connexion",
        title: "Connexion à Ticket Safe",
        preheader: "Un clic et tu es connecté, sans mot de passe.",
        bodyHtml: `
          ${greeting}
          <p style="margin:0 0 16px">Utilise le lien ci-dessous pour te connecter à Ticket Safe.</p>
          ${ctaButton("Me connecter", link)}
          ${muted(`${expiry} Si ce n'est pas toi, ignore cet email.`)}
          ${fallback}
        `,
        text: `${textHello}\n\nConnecte-toi à Ticket Safe.\n\n${textFallback}\n\n${expiry}`,
      };

    case "invite":
      return {
        subject: "Tu es invité sur Ticket Safe",
        eyebrow: "Compte · Invitation",
        title: "Tu es invité",
        preheader: "Accepte l'invitation pour rejoindre Ticket Safe.",
        bodyHtml: `
          ${greeting}
          <p style="margin:0 0 16px">Tu es invité à rejoindre Ticket Safe, la billetterie des événements étudiants.</p>
          ${ctaButton("Accepter l'invitation", link)}
          ${muted(expiry)}
          ${fallback}
        `,
        text: `${textHello}\n\nTu es invité à rejoindre Ticket Safe.\n\n${textFallback}\n\n${expiry}`,
      };

    case "email_change":
    case "email_change_current":
    case "email_change_new":
      return {
        subject: "Confirme ta nouvelle adresse email — Ticket Safe",
        eyebrow: "Compte · Changement d'email",
        title: "Confirme ta nouvelle adresse",
        preheader: "Clique sur le lien pour terminer le changement d'adresse.",
        bodyHtml: `
          ${greeting}
          <p style="margin:0 0 16px">On a reçu une demande pour changer l'adresse email de ton compte Ticket Safe. Confirme ce changement ci-dessous.</p>
          ${ctaButton("Confirmer la nouvelle adresse", link)}
          ${muted(`Si tu n'as pas demandé ce changement, écris-nous tout de suite à ${escapeHtml(legalFooter.supportEmail)}.`)}
          ${fallback}
        `,
        text: `${textHello}\n\nConfirme la nouvelle adresse email de ton compte Ticket Safe.\n\n${textFallback}\n\nSi tu n'as pas demandé ce changement, écris-nous à ${legalFooter.supportEmail}.`,
      };

    case "reauthentication":
      return {
        subject: "Ton code de vérification Ticket Safe",
        eyebrow: "Compte · Vérification",
        title: "Vérifie que c'est bien toi",
        preheader: "Saisis le code à 6 chiffres pour continuer.",
        bodyHtml: `
          ${greeting}
          <p style="margin:0 0 16px">Pour ta sécurité, saisis le code ci-dessous pour confirmer cette action sur ton compte Ticket Safe.</p>
          ${codeBlock("Ton code de vérification", otp)}
          ${muted("Ce code est valable quelques minutes. Si ce n'est pas toi, change ton mot de passe tout de suite.")}
        `,
        text: `${textHello}\n\nCode de vérification : ${otp}\n\nSi ce n'est pas toi, change ton mot de passe tout de suite.`,
      };

    case "login":
    default:
      return {
        subject: "Connexion à Ticket Safe",
        eyebrow: "Compte · Connexion",
        title: "Connexion à Ticket Safe",
        preheader: "Clique sur le lien pour continuer.",
        bodyHtml: `
          ${greeting}
          <p style="margin:0 0 16px">Utilise le lien ci-dessous pour continuer sur Ticket Safe.</p>
          ${ctaButton("Continuer", link)}
          ${muted(expiry)}
          ${fallback}
        `,
        text: `${textHello}\n\nConnexion à Ticket Safe.\n\n${textFallback}\n\n${expiry}`,
      };
  }
}
