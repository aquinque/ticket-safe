/**
 * Campus auto-detection for Ticket Safe Studio events.
 *
 * When an organizer like "ebs-madrid", "ESCP Madrid Events", or
 * "BDE ESCP Paris" publishes an event, the system maps them to a campus
 * rubric so the event lands in the right tab on /tickets.
 *
 * Detection is intentionally generous — slug, name, contact email and
 * event location are all scanned for any of the campus city names.
 */

export type Campus = "paris" | "madrid" | "turin" | "berlin" | "london";

export const CAMPUS_LABELS: Record<Campus, string> = {
  paris: "Paris",
  madrid: "Madrid",
  turin: "Turin",
  berlin: "Berlin",
  london: "London",
};

const CAMPUS_PATTERNS: Record<Campus, RegExp> = {
  paris: /\bparis\b|\.fr\b/i,
  madrid: /\bmadrid\b|\bspain\b|\bespana\b/i,
  turin: /\bturin\b|\btorino\b|\bitaly\b|\bitalia\b/i,
  berlin: /\bberlin\b|\bgermany\b|\bdeutschland\b/i,
  london: /\blondon\b|\buk\b|\bengland\b|\bbritain\b/i,
};

export interface CampusDetectInput {
  slug?: string | null;
  name?: string | null;
  contact_email?: string | null;
  location?: string | null;
  about?: string | null;
}

/** Returns the matched campus or null if no city keyword was found. */
export function detectCampus(input: CampusDetectInput): Campus | null {
  const text = [input.slug, input.name, input.contact_email, input.location, input.about]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (!text) return null;
  for (const [campus, pattern] of Object.entries(CAMPUS_PATTERNS) as [Campus, RegExp][]) {
    if (pattern.test(text)) return campus;
  }
  return null;
}

export function campusLabel(c: string | null | undefined): string {
  if (!c) return "—";
  return CAMPUS_LABELS[c as Campus] ?? c;
}
