import { cn } from "@/lib/utils";

export type EventStatus = "draft" | "published" | "cancelled" | "sold_out" | null | undefined;

type Kind = "live" | "draft" | "soldout" | "ended" | "cancelled";

interface EventStatusBadgeProps {
  status: EventStatus;
  /** Event start time (ISO). Used to derive "Live" vs "Ended". */
  date?: string | null;
  /** Caller-computed: sold count has reached capacity. */
  soldOut?: boolean;
  size?: "sm" | "md";
  className?: string;
}

/**
 * Derives a friendly marketplace status from the raw event row + a couple of
 * computed flags. Keeps the organizer's mental model crisp: at a glance they
 * see Live / Draft / Sold out / Ended / Cancelled rather than a raw enum.
 */
export function deriveEventStatusKind(
  status: EventStatus,
  date?: string | null,
  soldOut?: boolean,
): Kind {
  const isPast = date ? new Date(date).getTime() < Date.now() : false;
  if (status === "cancelled") return "cancelled";
  if (status === "sold_out" || (status === "published" && soldOut)) return "soldout";
  if (status === "published" && isPast) return "ended";
  if (status === "published") return "live";
  return "draft";
}

const CONFIG: Record<Kind, { label: string; classes: string; dot: string; pulse: boolean }> = {
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

const EventStatusBadge = ({ status, date, soldOut, size = "md", className }: EventStatusBadgeProps) => {
  const kind = deriveEventStatusKind(status, date, soldOut);
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
