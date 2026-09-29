/**
 * Partner school/association logos shown in the homepage social-proof row.
 * Empty by default — the section hides itself entirely until real logo
 * files are dropped in and listed here (see TODO_DATA.md).
 *
 * Expected shape once populated, e.g.:
 *   { name: "ESCP BDE", src: "/logos/partners/escp-bde.svg" },
 *   { name: "EBS Paris", src: "/logos/partners/ebs.svg" },
 */
export interface PartnerLogo {
  name: string;
  src: string;
}

export const partnerLogos: PartnerLogo[] = [];
