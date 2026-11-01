import { useEffect, useState } from "react";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { canPlayVideo } from "@/lib/homePage";

interface NetworkInformationLike extends EventTarget {
  saveData?: boolean;
  effectiveType?: string;
}

const MOBILE_QUERY = "(max-width: 767px)";

const connection = (): NetworkInformationLike | undefined =>
  typeof navigator === "undefined" ? undefined : (navigator as Navigator & { connection?: NetworkInformationLike }).connection;

const readMobile = () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(MOBILE_QUERY).matches;
const readNetwork = () => ({ saveData: !!connection()?.saveData, effectiveType: connection()?.effectiveType ?? null });

/**
 * Whether background videos may load: not on a phone, not with data saving on, not on a 2G/3G connection and not
 * with reduced motion (see canPlayVideo). Re-evaluated when the window is resized or the connection changes.
 */
export function useVideoAllowed(): boolean {
  const reducedMotion = useReducedMotion();
  const [isMobile, setIsMobile] = useState(readMobile);
  const [network, setNetwork] = useState(readNetwork);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia(MOBILE_QUERY);
    const onChange = () => setIsMobile(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    const conn = connection();
    if (!conn) return;
    const onChange = () => setNetwork(readNetwork());
    conn.addEventListener("change", onChange);
    return () => conn.removeEventListener("change", onChange);
  }, []);

  return canPlayVideo({ isMobile, reducedMotion, ...network });
}
