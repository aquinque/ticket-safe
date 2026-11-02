import { cn } from "@/lib/utils";
import { deriveEventStatusKind, type EventStatus, type EventStatusKind } from "@/lib/eventStatus";

// The rule lives in src/lib/eventStatus.ts (pure, tested); re-exported here so
// existing imports keep working.
export { deriveEventStatusKind, type EventStatus, type EventStatusKind } from "@/lib/eventStatus";

interface EventStatusBadgeProps {
  status: EventStatus;
  /** Event start time (ISO). With endsAt, decides "Live" vs "Ended". */
  date?: string | null;
  /** Event end time (ISO) when the organizer set one; otherwise the start plus 8 h applies. */
  endsAt?: string | null;
  /** Caller-computed: sold count has reached capacity. */
  soldOut?: boolean;
  size?: "sm" | "md";
  className?: string;
}

const CONFIG: Record<EventStatusKind, { label: string; classes: string; dot: string; pulse: boolean }> = {
  live: {
    label: "Live",
    classes: "bg-emerald-50 text-emerald-700 border-emerald-200",
    dot: "bg-emerald-500",
    pulse: true,
  },
  draft: {
    label: "Draft",
    classes: "bg-amber-50 text-amber-700 border-amber-200",
    dot: "bg-amber-500",
    pulse: false,
  },
  soldout: {
    label: "Sold out",
    classes: "bg-rose-50 text-rose-700 border-rose-200",
    dot: "bg-rose-500",
    pulse: false,
  },
  ended: {
    label: "Ended",
    classes: "bg-slate-100 text-slate-600 border-slate-200",
    dot: "bg-slate-400",
    pulse: false,
  },
  cancelled: {
    label: "Cancelled",
    classes: "bg-red-50 text-red-700 border-red-200",
    dot: "bg-red-500",
    pulse: false,
  },
};

/**
 * Friendly marketplace status from the raw event row plus a couple of computed
 * flags: at a glance the organizer sees Live / Draft / Sold out / Ended /
 * Cancelled rather than a raw enum.
 */
const EventStatusBadge = ({ status, date, endsAt, soldOut, size = "md", className }: EventStatusBadgeProps) => {
  const kind = deriveEventStatusKind(status, date, soldOut, endsAt);
  const c = CONFIG[kind];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-bold uppercase tracking-wide",
        size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-[11px]",
        c.classes,
        className,
      )}
    >
      <span className="relative flex h-1.5 w-1.5">
        {c.pulse && (
          <span className={cn("absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping", c.dot)} />
        )}
        <span className={cn("relative inline-flex h-1.5 w-1.5 rounded-full", c.dot)} />
      </span>
      {c.label}
    </span>
  );
};

export default EventStatusBadge;
