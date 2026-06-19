import { Calendar, MapPin, ShieldCheck, Ticket } from "lucide-react";
import { cn } from "@/lib/utils";

interface EventPreviewCardProps {
  title?: string;
  organizerName?: string;
  organizerLogoUrl?: string | null;
  dateISO?: string | null;
  location?: string | null;
  category?: string | null;
  bannerUrl?: string | null;
  primaryColor?: string | null;
  /** Lowest tier price in euros — renders the "From €X" pill. */
  priceFromEuros?: number | null;
  className?: string;
}

const HEX = /^#[0-9a-fA-F]{6}$/;

const formatDate = (iso?: string | null): string => {
  if (!iso) return "Date to be set";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Date to be set";
  return (
    d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }) +
    " · " +
    d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
  );
};

const formatPrice = (euros?: number | null): string | null => {
  if (euros == null || !Number.isFinite(euros)) return null;
  if (euros <= 0) return "Free";
  return `€${euros % 1 === 0 ? euros.toFixed(0) : euros.toFixed(2)}`;
};

/**
 * A faithful mock of how the event will appear in the public marketplace —
 * same card language as the live grid (verified badge, cover, category,
 * "From €X" pricing, CTA). Used in the create wizard and the draft editor so
 * organizers see exactly what buyers will see before they publish.
 */
const EventPreviewCard = ({
  title,
  organizerName,
  organizerLogoUrl,
  dateISO,
  location,
  category,
  bannerUrl,
  primaryColor,
  priceFromEuros,
  className,
}: EventPreviewCardProps) => {
  const accent = primaryColor && HEX.test(primaryColor) ? primaryColor : "#003399";
  const price = formatPrice(priceFromEuros);
  const initial = (organizerName?.[0] ?? title?.[0] ?? "T").toUpperCase();

  return (
    <div
      className={cn(
        "group overflow-hidden rounded-2xl border border-border bg-card shadow-card transition-all duration-300",
        className,
      )}
    >
      {/* Cover */}
      <div
        className="relative aspect-[16/9] overflow-hidden"
        style={{ background: `linear-gradient(135deg, ${accent}, hsl(210 100% 45%))` }}
      >
        {bannerUrl ? (
          <img src={bannerUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <span className="text-5xl font-black text-white/25">{initial}</span>
          </div>
        )}

        {/* Top fade so the badges always read */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/25 to-transparent" />

        {/* Verified pill — the trust marker buyers look for */}
        <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-bold text-foreground shadow-soft backdrop-blur">
          <ShieldCheck className="h-3 w-3 text-primary" />
          Verified
        </span>

        {category && (
          <span className="absolute right-3 top-3 inline-flex items-center rounded-full bg-black/45 px-2.5 py-1 text-[11px] font-bold capitalize text-white backdrop-blur">
            {category}
          </span>
        )}

        {price && (
          <span className="absolute bottom-3 left-3 inline-flex items-center rounded-full bg-white/95 px-3 py-1 text-xs font-black text-foreground shadow-soft backdrop-blur">
            {price === "Free" ? "Free" : <>From {price}</>}
          </span>
        )}
      </div>

      {/* Body */}
      <div className="p-4">
        <h3 className="line-clamp-2 text-base font-bold leading-snug text-foreground">
          {title?.trim() || "Your event title"}
        </h3>

        <div className="mt-2 flex items-center gap-2">
          {organizerLogoUrl ? (
            <img src={organizerLogoUrl} alt="" className="h-5 w-5 rounded-full object-cover" />
          ) : (
            <span
              className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-black text-white"
              style={{ background: accent }}
            >
              {initial}
            </span>
          )}
          <span className="truncate text-sm text-muted-foreground">
            {organizerName?.trim() || "Your organization"}
          </span>
        </div>

        <div className="mt-3 space-y-1.5 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 flex-shrink-0" />
            <span className="truncate">{formatDate(dateISO)}</span>
          </div>
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 flex-shrink-0" />
            <span className="truncate">{location?.trim() || "Location to be added"}</span>
          </div>
        </div>

        <div
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white"
          style={{ background: accent }}
        >
          <Ticket className="h-4 w-4" />
          Get tickets
        </div>
      </div>
    </div>
  );
};

export default EventPreviewCard;
