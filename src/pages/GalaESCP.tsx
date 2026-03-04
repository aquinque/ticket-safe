/**
 * GalaESCP — Dedicated landing page for the Gala de l'ESCP 2026
 *
 * Route: /gala-escp
 *
 * Sections:
 *  1. Hero             — full-bleed image, title, CTA
 *  2. Countdown        — live timer to the event
 *  3. Event details    — date, venue, dress code, price, organizer
 *  4. Description      — about the evening
 *  5. Available tickets— live from DB (filtered by event ID)
 *  6. Seller CTA       — "Sell your ticket" gate
 */

import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Calendar,
  MapPin,
  Clock,
  Users,
  Shirt,
  Euro,
  ShieldCheck,
  Ticket,
  ArrowRight,
  ChevronDown,
  Loader2,
} from "lucide-react";
import { SEOHead } from "@/components/SEOHead";
import { useTicketListings } from "@/contexts/TicketListingsContext";
import galaBanner from "@/assets/events/gala-banner.jpg";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** ID of the Gala entry in the `events` (marketplace) table */
const GALA_EVENT_ID = "c4f6a801-b2d9-4e7f-a315-8c9d2e0f4b67";

/** Date of the gala — used for countdown */
const GALA_DATE = new Date("2026-04-25T19:00:00+02:00");

// ---------------------------------------------------------------------------
// Countdown hook
// ---------------------------------------------------------------------------

interface TimeLeft {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  isPast: boolean;
}

function useCountdown(target: Date): TimeLeft {
  const calc = (): TimeLeft => {
    const diff = target.getTime() - Date.now();
    if (diff <= 0)
      return { days: 0, hours: 0, minutes: 0, seconds: 0, isPast: true };
    return {
      days: Math.floor(diff / 86_400_000),
      hours: Math.floor((diff % 86_400_000) / 3_600_000),
      minutes: Math.floor((diff % 3_600_000) / 60_000),
      seconds: Math.floor((diff % 60_000) / 1_000),
      isPast: false,
    };
  };

  const [timeLeft, setTimeLeft] = useState<TimeLeft>(calc);

  useEffect(() => {
    const id = setInterval(() => setTimeLeft(calc()), 1_000);
    return () => clearInterval(id);
  }, []);

  return timeLeft;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function CountdownBox({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1 min-w-[72px]">
      <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-center">
        <span className="text-2xl sm:text-3xl font-bold text-white tabular-nums">
          {String(value).padStart(2, "0")}
        </span>
      </div>
      <span className="text-xs uppercase tracking-widest text-white/60">
        {label}
      </span>
    </div>
  );
}

function DetailRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-4 p-4 rounded-xl bg-muted/40 border border-border/50">
      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
        <Icon className="w-5 h-5 text-primary" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground uppercase tracking-wider mb-0.5">
          {label}
        </p>
        <p className="font-semibold text-sm sm:text-base">{value}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

const GalaESCP = () => {
  const navigate = useNavigate();
  const { listings, isLoading } = useTicketListings();
  const timeLeft = useCountdown(GALA_DATE);

  // Filter to gala tickets only
  const galaTickets = listings.filter((l) => l.event.id === GALA_EVENT_ID);

  const scrollToTickets = () => {
    document.getElementById("tickets")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="min-h-screen bg-background">
      <SEOHead titleKey="common.appName" descriptionKey="common.appName" />
      <Header />

      {/* ================================================================
          HERO — full-bleed gala image with overlay
      ================================================================ */}
      <section className="relative h-[88vh] min-h-[520px] overflow-hidden">
        {/* Background image */}
        <img
          src={galaBanner}
          alt="Gala de l'ESCP 2026"
          className="absolute inset-0 w-full h-full object-cover object-center"
        />

        {/* Gradient overlays — bottom-to-top dark + subtle gold tint at top */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/55 to-black/20" />
        <div className="absolute inset-0 bg-gradient-to-br from-amber-950/20 via-transparent to-transparent" />

        {/* Content */}
        <div className="relative z-10 h-full flex flex-col items-center justify-center text-center px-4 gap-6">
          {/* Category badge */}
          <div className="flex gap-2">
            <Badge className="bg-amber-500/90 text-amber-950 font-semibold px-3 py-1 text-xs tracking-widest uppercase">
              Gala
            </Badge>
            <Badge
              variant="outline"
              className="border-white/30 text-white/80 text-xs px-3 py-1 tracking-widest uppercase"
            >
              ESCP Business School
            </Badge>
          </div>

          {/* Title */}
          <h1 className="text-5xl sm:text-7xl font-bold text-white leading-tight max-w-2xl">
            Gala de{" "}
            <span className="italic font-light text-amber-300">l'ESCP</span>
          </h1>

          {/* Subtitle */}
          <p className="text-white/75 text-lg sm:text-xl max-w-md">
            Samedi 25 Avril 2026 · 19h00
            <br />
            Palais Cambon – Capucines, Paris 1er
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row gap-3 mt-2">
            <Button
              size="lg"
              className="bg-amber-500 hover:bg-amber-400 text-amber-950 font-semibold px-8 shadow-lg"
              onClick={scrollToTickets}
            >
              <Ticket className="w-5 h-5 mr-2" />
              Voir les billets disponibles
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="border-white/40 text-white hover:bg-white/10 px-8"
              onClick={() => navigate("/marketplace/sell")}
            >
              Vendre mon billet
            </Button>
          </div>

          {/* Scroll indicator */}
          <button
            onClick={scrollToTickets}
            className="absolute bottom-8 left-1/2 -translate-x-1/2 text-white/50 hover:text-white/80 transition-colors animate-bounce"
            aria-label="Scroll down"
          >
            <ChevronDown className="w-7 h-7" />
          </button>
        </div>
      </section>

      {/* ================================================================
          COUNTDOWN
      ================================================================ */}
      {!timeLeft.isPast && (
        <section className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 py-10">
          <div className="container mx-auto px-4 text-center">
            <p className="text-white/50 text-xs uppercase tracking-widest mb-6">
              La soirée commence dans
            </p>
            <div className="flex items-end justify-center gap-3 sm:gap-5">
              <CountdownBox value={timeLeft.days} label="Jours" />
              <span className="text-white/40 text-3xl font-light mb-5">:</span>
              <CountdownBox value={timeLeft.hours} label="Heures" />
              <span className="text-white/40 text-3xl font-light mb-5">:</span>
              <CountdownBox value={timeLeft.minutes} label="Minutes" />
              <span className="text-white/40 text-3xl font-light mb-5">:</span>
              <CountdownBox value={timeLeft.seconds} label="Secondes" />
            </div>
          </div>
        </section>
      )}

      {/* ================================================================
          EVENT DETAILS
      ================================================================ */}
      <section className="py-16 bg-background">
        <div className="container mx-auto px-4 max-w-5xl">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            {/* Left: detail grid */}
            <div>
              <h2 className="text-3xl font-bold mb-8">Informations</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <DetailRow
                  icon={Calendar}
                  label="Date"
                  value="Samedi 25 Avril 2026"
                />
                <DetailRow
                  icon={Clock}
                  label="Heure"
                  value="19h00 – 03h00"
                />
                <DetailRow
                  icon={MapPin}
                  label="Lieu"
                  value="Palais Cambon – Capucines, Paris 1er"
                />
                <DetailRow
                  icon={Users}
                  label="Organisé par"
                  value="BDE ESCP Paris"
                />
                <DetailRow
                  icon={Shirt}
                  label="Dress code"
                  value="Black Tie · Tenue de soirée"
                />
                <DetailRow
                  icon={Euro}
                  label="Prix indicatif"
                  value="À partir de €90"
                />
              </div>
            </div>

            {/* Right: description */}
            <div>
              <h2 className="text-3xl font-bold mb-8">La soirée</h2>
              <div className="space-y-4 text-muted-foreground leading-relaxed">
                <p>
                  Le Gala de l'ESCP est l'événement incontournable de l'année
                  estudiantine. Une soirée d'exception réunissant étudiants,
                  alumni et invités dans l'un des plus beaux palais de Paris.
                </p>
                <p>
                  La soirée commence par un dîner de gala servi à table, suivi
                  d'un spectacle de remise de prix et d'une soirée dansante
                  animée par des artistes invités. Un moment unique à partager
                  entre camarades.
                </p>
                <p>
                  Les billets étant en nombre limité, le marché de revente
                  permet aux étudiants de trouver une place si la billetterie
                  officielle est épuisée — ou de céder leur billet en toute
                  sécurité.
                </p>
              </div>

              {/* Highlights */}
              <div className="mt-8 flex flex-wrap gap-2">
                {[
                  "Dîner assis",
                  "Soirée dansante",
                  "Artistes invités",
                  "Bar inclus",
                  "Photo booth",
                  "Black Tie",
                ].map((tag) => (
                  <Badge
                    key={tag}
                    variant="secondary"
                    className="text-xs px-3 py-1"
                  >
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <Separator />

      {/* ================================================================
          AVAILABLE TICKETS — live from DB
      ================================================================ */}
      <section id="tickets" className="py-16 bg-muted/30 scroll-mt-16">
        <div className="container mx-auto px-4 max-w-5xl">
          <div className="flex items-end justify-between mb-8 flex-wrap gap-4">
            <div>
              <h2 className="text-3xl font-bold">Billets disponibles</h2>
              <p className="text-muted-foreground mt-1">
                Achetez un billet revendu par un étudiant ESCP vérifié
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("/marketplace/sell")}
              className="gap-2"
            >
              Vendre le mien
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>

          {/* Loading */}
          {isLoading && (
            <div className="flex items-center justify-center py-16 gap-3 text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin" />
              <span>Chargement des billets…</span>
            </div>
          )}

          {/* No tickets */}
          {!isLoading && galaTickets.length === 0 && (
            <Card className="border-dashed">
              <CardContent className="py-16 text-center">
                <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Ticket className="w-8 h-8 text-amber-600" />
                </div>
                <h3 className="text-xl font-semibold mb-2">
                  Aucun billet disponible pour l'instant
                </h3>
                <p className="text-muted-foreground max-w-sm mx-auto mb-6">
                  Revenez ici dès qu'un étudiant mettra son billet en vente.
                  Activez les notifications ou revenez régulièrement.
                </p>
                <Button
                  variant="hero"
                  onClick={() => navigate("/marketplace/sell")}
                >
                  Mettre mon billet en vente
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Ticket cards */}
          {!isLoading && galaTickets.length > 0 && (
            <div className="space-y-4">
              {galaTickets.map((ticket) => (
                <Card
                  key={ticket.id}
                  className="overflow-hidden hover:shadow-md transition-shadow"
                >
                  <CardContent className="p-0">
                    <div className="flex flex-col sm:flex-row items-stretch">
                      {/* Colour accent strip */}
                      <div className="sm:w-2 w-full h-2 sm:h-auto bg-gradient-to-b from-amber-400 to-amber-600 shrink-0 rounded-t sm:rounded-t-none sm:rounded-l" />

                      <div className="flex flex-1 items-center justify-between gap-4 p-5">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="text-2xl font-bold text-primary">
                              €{ticket.sellingPrice.toFixed(2)}
                            </span>
                            <Badge variant="outline" className="text-xs">
                              {ticket.quantity}{" "}
                              {ticket.quantity > 1 ? "billets" : "billet"}
                            </Badge>
                            {ticket.verified && (
                              <Badge className="bg-green-100 text-green-800 border-green-200 text-xs">
                                <ShieldCheck className="w-3 h-3 mr-1" />
                                Vérifié
                              </Badge>
                            )}
                          </div>
                          {ticket.description && (
                            <p className="text-sm text-muted-foreground truncate">
                              {ticket.description}
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground mt-1">
                            Vendu par{" "}
                            <span className="font-medium">
                              {ticket.sellerName}
                            </span>
                          </p>
                        </div>

                        <Button
                          variant="hero"
                          className="shrink-0 bg-amber-500 hover:bg-amber-400 text-amber-950 font-semibold"
                          onClick={() =>
                            navigate(
                              `/checkout?listing_id=${ticket.id}`
                            )
                          }
                        >
                          Acheter
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}

              <p className="text-xs text-center text-muted-foreground pt-2">
                {galaTickets.length} offre
                {galaTickets.length > 1 ? "s" : ""} disponible
                {galaTickets.length > 1 ? "s" : ""} · Paiement sécurisé par
                Stripe
              </p>
            </div>
          )}
        </div>
      </section>

      {/* ================================================================
          SELL CTA BANNER
      ================================================================ */}
      <section className="py-16 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900">
        <div className="container mx-auto px-4 max-w-3xl text-center">
          <h2 className="text-3xl font-bold text-white mb-4">
            Tu ne peux plus y aller ?
          </h2>
          <p className="text-white/65 mb-8 text-lg max-w-xl mx-auto">
            Revends ton billet en toute sécurité à un autre étudiant ESCP.
            Scanne ton QR code, fixe ton prix, et c'est parti.
          </p>
          <Button
            size="lg"
            className="bg-amber-500 hover:bg-amber-400 text-amber-950 font-semibold px-10"
            onClick={() => navigate("/marketplace/sell")}
          >
            <Ticket className="w-5 h-5 mr-2" />
            Vendre mon billet
          </Button>
          <p className="text-white/40 text-xs mt-4">
            Commission plateforme : 5% · Paiement par Stripe
          </p>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default GalaESCP;
