import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { MapPin } from "lucide-react";
import { useI18n } from "@/contexts/I18nContext";
import { EventData } from "@/data/eventsData";
import { currencySymbol } from "@/lib/money";

function daysUntil(dateString: string): number | null {
  if (!dateString) return null;
  const now = new Date();
  const event = new Date(dateString);
  const diffMs = event.getTime() - now.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

/** "J-2" / "Ce soir" style urgency badge — date-driven, or stock-driven via
 *  `percentRemaining` when the caller has that data (event capacity isn't
 *  known for every listing source yet, e.g. the resale marketplace). */
function getUrgencyLabel(event: EventData, language: "en" | "fr" | "es"): string | null {
  if (event.isPastEvent) return null;
  const days = daysUntil(event.date);
  if (days != null && days >= 0 && days <= 3) {
    if (days === 0) return language === "fr" ? "Ce soir" : language === "es" ? "Esta noche" : "Tonight";
    if (days === 1) return language === "fr" ? "Demain" : language === "es" ? "Mañana" : "Tomorrow";
    return `J-${days}`;
  }
  if (event.percentRemaining != null && event.percentRemaining < 15) {
    return language === "fr" ? "Dernières places" : language === "es" ? "Últimas plazas" : "Almost sold out";
  }
  return null;
}

function formatDateBadge(dateString: string, locale: string): string {
  const date = new Date(dateString);
  const weekday = date.toLocaleDateString(locale, { weekday: "short" }).toUpperCase();
  const day = date.getDate();
  const month = date.toLocaleDateString(locale, { month: "short" }).toUpperCase();
  return `${weekday} ${day} ${month}`;
}

interface EventCardProps {
  event: EventData;
  onClick: () => void;
}

/** The picture box takes the affiche's own shape, kept between a wide banner and a portrait poster, so a
 *  flyer fills it edge to edge instead of floating in blurred bands. Until the picture has loaded (or when
 *  there is none) the box is 16:10. */
export const POSTER_MIN_RATIO = 4 / 5;
export const POSTER_MAX_RATIO = 1.91;
export function posterRatio(width: number, height: number): number {
  if (!width || !height) return 16 / 10;
  return Math.min(POSTER_MAX_RATIO, Math.max(POSTER_MIN_RATIO, width / height));
}

/** Event card: the whole affiche at its own shape on top, with the category and campus as small frosted
 *  chips in its corner, then the date, urgency, title, place and price on a dark panel below. Without a poster
 *  the box shows a flat surface (never a stock photo). */
const EventCard = ({ event, onClick }: EventCardProps) => {
  const { t, language } = useI18n();
  const locale = language === "fr" ? "fr-FR" : language === "es" ? "es-ES" : "en-GB";
  const soldOutLabel = language === "fr" ? "Complet" : language === "es" ? "Agotado" : "Sold out";
  const [ratio, setRatio] = useState(16 / 10);

  const urgency = getUrgencyLabel(event, language);
  const campusLabel = event.campus || event.organizer;
  const hasPoster = !!event.image;
  const dim = event.soldOut ? "grayscale opacity-60" : "";

  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative flex h-full w-full flex-col overflow-hidden rounded-lg bg-[#0b0b0f] text-left text-white"
    >
      {/* The affiche, whole; a blurred copy of itself only shows where a very tall or very wide one
          meets the box's limits. */}
      <div className="relative w-full overflow-hidden" style={{ aspectRatio: String(ratio) }}>
        {hasPoster ? (
          <>
            <img
              src={event.image ?? undefined}
              alt=""
              aria-hidden="true"
              loading="lazy"
              decoding="async"
              className={`absolute inset-0 h-full w-full scale-125 object-cover blur-2xl brightness-[0.55] saturate-150 ${dim}`}
            />
            <img
              src={event.image ?? undefined}
              alt={event.title}
              loading="lazy"
              decoding="async"
              onLoad={(e) => setRatio(posterRatio(e.currentTarget.naturalWidth, e.currentTarget.naturalHeight))}
              className={`absolute inset-0 h-full w-full object-contain transition-transform duration-300 ${dim || "md:group-hover:scale-[1.03]"}`}
            />
          </>
        ) : (
          <div className="absolute inset-0 bg-muted" />
        )}
        {/* Category and campus, frosted over the picture's corner */}
        <div className="absolute left-2 right-2 top-2 flex min-w-0 items-center gap-1.5">
          <span className="shrink-0 bg-black/35 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white backdrop-blur-md">
            {event.category}
          </span>
          {campusLabel && (
            <span className="min-w-0 truncate bg-black/25 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white/90 backdrop-blur-md">
              {campusLabel}
            </span>
          )}
        </div>
        {(event.isPastEvent || event.soldOut) && (
          <span className={`absolute right-2 top-2 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${event.isPastEvent ? "bg-black/70 text-white" : "bg-danger text-danger-foreground"}`}>
            {event.isPastEvent ? t("events.eventEnded") : soldOutLabel}
          </span>
        )}
      </div>

      {/* Date, title, place, price */}
      <div className="flex flex-1 flex-col px-3.5 pb-3.5 pt-3">
        <div className="mb-1 flex items-center gap-2">
          <span className="text-[11px] font-bold tracking-wider text-white/80">{formatDateBadge(event.date, locale)}</span>
          {!event.isPastEvent && !event.soldOut && urgency && (
            <Badge className="border-transparent bg-cta px-1.5 py-0 text-[10px] font-bold uppercase tracking-wider text-cta-foreground">
              {urgency}
            </Badge>
          )}
        </div>
        <h3 className="mb-1.5 line-clamp-2 font-display text-lg font-bold leading-tight" style={{ letterSpacing: "-0.02em" }}>
          {event.title}
        </h3>
        <div className="mt-auto flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1 text-xs text-white/75">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{event.location}</span>
          </div>
          {event.soldOut ? (
            <span className="shrink-0 text-sm font-black text-white/70">{soldOutLabel}</span>
          ) : (
            event.fromPriceCents != null && (
              <span className="shrink-0 text-sm font-black tabular-nums">
                {language === "fr"
                  ? `dès ${(event.fromPriceCents / 100).toFixed(0)} ${currencySymbol(event.currency)}`
                  : language === "es"
                  ? `desde ${(event.fromPriceCents / 100).toFixed(0)} ${currencySymbol(event.currency)}`
                  : `from ${currencySymbol(event.currency)}${(event.fromPriceCents / 100).toFixed(0)}`}
              </span>
            )
          )}
        </div>
      </div>

      <span className="sr-only">{t("events.buyOrResellTicket")}</span>
    </button>
  );
};

export default EventCard;

/** Loading placeholder in the card's shape (16:10 picture, info panel below), used anywhere EventCard is. */
export const EventCardSkeleton = () => (
  <div className="w-full overflow-hidden rounded-lg bg-muted animate-pulse">
    <div className="w-full bg-foreground/10" style={{ aspectRatio: "1.6" }} />
    <div className="space-y-2 px-3.5 py-3.5">
      <div className="h-3 w-20 rounded bg-foreground/10" />
      <div className="h-5 w-3/4 rounded bg-foreground/10" />
      <div className="h-3 w-1/2 rounded bg-foreground/10" />
    </div>
  </div>
);
