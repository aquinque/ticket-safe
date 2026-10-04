/**
 * Shared design tokens — React Email preview package copy.
 *
 * MUST stay byte-identical to supabase/functions/_shared/emailTokens.ts
 * (the Deno send-time copy). See that file for the full rationale on
 * where each value comes from in src/index.css. This package can't import
 * across the Node/Deno boundary, so the two are kept in sync by hand.
 */

export const emailTokens = {
  brandNavy: "#1a2744",
  brandNavyDark: "#141d35",
  accent: "#3a5fe6",
  accentHover: "#2440b6",
  accentLight: "#aec6ff",

  bodyBg: "#f6f7fa",
  cardBg: "#ffffff",
  border: "#e4e7f0",
  textPrimary: "#0b1024",
  textMuted: "#5b6480",

  danger: "#ff4d6d",
  success: "#22c55e",

  fontHeading: "'Instrument Sans', -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif",
  fontBody: "'Inter', -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif",
  googleFontsHref:
    "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Instrument+Sans:wght@500;600;700&display=swap",

  radius: 0,
  maxWidth: 600,

  siteUrl: "https://ticket-safe.eu",
  logoHeaderUrl: "https://ticket-safe.eu/email-assets/logo-header@2x.png",
  logoIconUrl: "https://ticket-safe.eu/email-assets/icon-navy@2x.png",
} as const;

export const legalFooter = {
  companyLine: "Ticket Safe SAS · 2 rue Wilhem, 75016 Paris, France",
  supportEmail: "ticketsafe.friendly@gmail.com",
  taglineFr: "Billetterie sécurisée anti-fraude.",
} as const;
