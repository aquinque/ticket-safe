/** Only the exact string "true" turns a flag on. Anything else, including unset, is off. */
export const parseFeatureFlag = (value: string | undefined): boolean => value === "true";

/**
 * Peer-to-peer resale. Off unless the build sets VITE_RESALE_ENABLED=true.
 * While it is off, the profile shows no resale section at all.
 */
export const RESALE_ENABLED = parseFeatureFlag(import.meta.env.VITE_RESALE_ENABLED);
