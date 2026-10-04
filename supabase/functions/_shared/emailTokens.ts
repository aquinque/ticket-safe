/**
 * Shared design tokens for every transactional email AND the ticket PDF.
 *
 * Single source of truth — mirrored exactly in emails/tokens.ts (the React
 * Email preview package can't import from supabase/functions, Deno can't
 * import from a Node workspace, so this pair is kept byte-identical by
 * hand rather than shared at the module level). If you change a color
 * here, change it there too.
 *
 * Every value below is pulled directly from src/index.css — nothing here
 * is invented. Brand tokens (navy background, primary blue) come from
 * .theme-night, the dark theme now shared site-wide. Body-text tokens
 * (dark navy text, muted gray, light border) come from .theme-studio,
 * because emails/PDFs use a light, readable body per the brief — even
 * though the website itself is dark, those exact light-mode text/border
 * values already exist in the codebase for Ticket Studio, so reusing them
 * here keeps the whole product on one real palette instead of a second,
 * invented one.
 */

export const emailTokens = {
  // ===== Brand (from .theme-night / src/index.css --primary etc.) =====
  brandNavy: "#1a2744", // --background (site-wide dark navy) — email/PDF header + footer band
  brandNavyDark: "#141d35", // one step darker, for subtle borders on the navy band
  accent: "#3a5fe6", // --primary — the site's one accent blue. CTA buttons + links only.
  accentHover: "#2440b6", // --primary-hover
  accentLight: "#aec6ff", // brand-200 — logo "S", used only inside the logo mark

  // ===== Body (light, readable — from .theme-studio) =====
  bodyBg: "#f6f7fa", // page background behind the card
  cardBg: "#ffffff", // the white card holding the content
  border: "#e4e7f0", // --border (studio)
  textPrimary: "#0b1024", // --foreground (studio) — dark navy, never pure black
  textMuted: "#5b6480", // --muted-foreground (studio)

  // ===== Status =====
  danger: "#ff4d6d", // --destructive
  success: "#22c55e", // --success

  // ===== Type =====
  fontHeading: "'Instrument Sans', -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif",
  fontBody: "'Inter', -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif",
  // Google Fonts <link> for clients that honor it (most webmail). Falls
  // back cleanly to the system stack above everywhere else (Outlook,
  // most mobile mail apps never load it at all).
  googleFontsHref:
    "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Instrument+Sans:wght@500;600;700&display=swap",

  // ===== Layout =====
  radius: 0, // zero border-radius everywhere, matching the site
  maxWidth: 600,

  // ===== Assets (absolute URLs — email clients can't load relative paths) =====
  siteUrl: "https://ticket-safe.eu",
  logoHeaderUrl: "https://ticket-safe.eu/email-assets/logo-header@2x.png", // navy bg baked in, 2x
  logoIconUrl: "https://ticket-safe.eu/email-assets/icon-navy@2x.png",
} as const;

// Address and RCS number are the real statutory notice already published at
// /mentions-legales (src/pages/MentionsLegales.tsx) — kept in sync by hand.
export const legalFooter = {
  companyLine: "Ticket Safe SAS · 2 rue Wilhem, 75016 Paris, France",
  supportEmail: "ticketsafe.friendly@gmail.com",
  taglineFr: "Billetterie sécurisée anti-fraude.",
} as const;
