import { ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Small, discreet "TicketSafe Protection included" mark. Used on event/
 * listing cards and purchase surfaces — never a big banner, just enough to
 * remind buyers the escrow/QR-verification protection is baked in.
 */
export const ProtectionBadge = ({ className }: { className?: string }) => (
  <span
    className={cn(
      "inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground",
      className,
    )}
  >
    <ShieldCheck className="w-3.5 h-3.5 text-primary shrink-0" />
    TicketSafe Protection included
  </span>
);
