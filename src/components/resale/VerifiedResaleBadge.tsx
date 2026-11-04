import { ShieldCheck } from "lucide-react";

/**
 * "Verified resale" pill on a resale listing card. Emerald, the colour the event page already uses for
 * positive states ("Free"); the `success` token is a different green (#22C55E), so it isn't used here.
 */
export function VerifiedResaleBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-emerald-400/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-400 ${className}`}
    >
      <ShieldCheck className="h-3 w-3" strokeWidth={2} aria-hidden />
      Verified resale
    </span>
  );
}
