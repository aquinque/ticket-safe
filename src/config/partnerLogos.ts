/**
 * Partner schools and associations shown in the "Trusted by student associations across Europe" line of the home page.
 * Empty by default — the row hides itself entirely until a name or a logo is listed here.
 *
 * `src` is optional: without it the name is written out in the same place. A logo is shown in white on the dark
 * background, so a single-colour SVG or a transparent PNG works best.
 *   { name: "ESCP BDE", src: "/logos/partners/escp-bde.svg" },
 *   { name: "EBS Paris" },
 */
export interface PartnerLogo {
  name: string;
  src?: string;
}

export const partnerLogos: PartnerLogo[] = [];
