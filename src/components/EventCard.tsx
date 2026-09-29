import { Badge } from "@/components/ui/badge";
import { MapPin } from "lucide-react";
import { useI18n } from "@/contexts/I18nContext";
import { EventData } from "@/data/eventsData";

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

/** Poster-format event card (4:5, Shotgun-style): full-bleed affiche with a
 *  bottom gradient overlay carrying date/title/location/price, category +
 *  campus + urgency badges up top, and a generated brand-gradient fallback
 *  (never a stock photo or a generic music-note icon) when there's no real
 *  poster image. */
const EventCard = ({ event, onClick }: EventCardProps) => {
  const { t, language } = useI18n();
  const locale = language === "fr" ? "fr-FR" : language === "es" ? "es-ES" : "en-US";
  const soldOutLabel = language === "fr" ? "Complet" : language === "es" ? "Agotado" : "Sold out";

  const urgency = getUrgencyLabel(event, language);
  const campusLabel = event.campus || event.organizer;
  const hasPoster = !!event.image;

  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative block w-full aspect-[4/5] overflow-hidden rounded-lg text-left"
    >
      {/* Affiche */}
      {hasPoster ? (
        <img
          src={event.image ?? undefined}
          alt={event.title}
          loading="lazy"
          decoding="async"
          className={`absolute inset-0 w-full h-full object-cover transition-transform duration-300 ${
            event.soldOut ? "grayscale opacity-60" : "md:group-hover:scale-[1.03]"
          }`}
        />
      ) : (
        // Generated fallback — just the brand gradient. The event name
        // still reads "en gros Space Grotesk" via the h3 below, which every
        // card (poster or not) already renders in the bottom overlay; a
        // second copy of the title here was pure duplication.
        <div
          className="absolute inset-0"
          style={{ background: "linear-gradient(150deg, hsl(227 77% 56%), hsl(228 67% 43%))" }}
        />
      )}

      {/* Bottom gradient — always present so the text stays legible over a
          photo, and reads as a deliberate label on the generated fallback. */}
      <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/90 via-black/40 to-transparent pointer-events-none" />

      {/* Top badges */}
      <div className="absolute top-3 left-3 right-3 flex flex-wrap items-center gap-1.5">
        <Badge className="bg-black/55 text-white border-transparent backdrop-blur-sm text-[10px] uppercase tracking-wider font-bold">
          {event.category}
        </Badge>
        {campusLabel && (
          <Badge className="bg-black/40 text-white border-transparent backdrop-blur-sm text-[10px] uppercase tracking-wider font-bold">
            {campusLabel}
          </Badge>
        )}
        {event.isPastEvent ? (
          <Badge className="ml-auto bg-black/70 text-white border-transparent text-[10px] uppercase tracking-wider font-bold">
            {t("events.eventEnded")}
          </Badge>
        ) : event.soldOut ? (
          <Badge className="ml-auto bg-danger text-danger-foreground border-transparent text-[10px] uppercase tracking-wider font-bold">
            {soldOutLabel}
          </Badge>
        ) : (
          urgency && (
            <Badge className="ml-auto bg-cta text-cta-foreground border-transparent text-[10px] uppercase tracking-wider font-bold">
              {urgency}
            </Badge>
          )
        )}
      </div>

      {/* Bottom content */}
      <div className="absolute inset-x-0 bottom-0 p-4 text-white">
        <div className="text-[11px] font-bold tracking-wider text-white/80 mb-1">
          {formatDateBadge(event.date, locale)}
        </div>
        <h3
          className={`font-display font-bold leading-tight mb-1.5 line-clamp-2 ${hasPoster ? "text-lg" : "text-xl"}`}
          style={{ letterSpacing: "-0.02em" }}
        >
          {event.title}
        </h3>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 text-xs text-white/75 min-w-0">
            <MapPin className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{event.location}</span>
          </div>
          {event.soldOut ? (
            <span className="shrink-0 text-sm font-black text-white/70">
              {soldOutLabel}
            </span>
          ) : (
            event.fromPriceCents != null && (
              <span className="shrink-0 text-sm font-black tabular-nums">
                {language === "fr"
                  ? `dès ${(event.fromPriceCents / 100).toFixed(0)} €`
                  : language === "es"
                  ? `desde ${(event.fromPriceCents / 100).toFixed(0)} €`
                  : `from €${(event.fromPriceCents / 100).toFixed(0)}`}
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

/** Loading placeholder matching the 4:5 poster shape — used anywhere
 *  EventCard is, so lists never show a blank gap while fetching. */
export const EventCardSkeleton = () => (
  <div className="relative w-full aspect-[4/5] overflow-hidden rounded-lg bg-muted animate-pulse">
    <div className="absolute inset-x-3 top-3 flex gap-1.5">
      <div className="h-5 w-16 rounded-full bg-foreground/10" />
      <div className="h-5 w-14 rounded-full bg-foreground/10" />
    </div>
    <div className="absolute inset-x-4 bottom-4 space-y-2">
      <div className="h-3 w-20 rounded bg-foreground/10" />
      <div className="h-5 w-3/4 rounded bg-foreground/10" />
      <div className="h-3 w-1/2 rounded bg-foreground/10" />
    </div>
  </div>
);
