/**
 * FeaturedGalaBanner
 *
 * Displayed on the homepage between the Hero and the EventsSection.
 * Promotes the Gala de l'ESCP 2026 with a rich visual banner.
 */

import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, CalendarDays, MapPin } from "lucide-react";
import galaBanner from "@/assets/events/gala-banner.jpg";

const FeaturedGalaBanner = () => {
  return (
    <section className="py-6 md:py-8">
      <div className="container mx-auto px-4 max-w-7xl">
        {/* Section label */}
        <div className="flex items-center gap-2 mb-4">
          <div className="h-px flex-1 bg-border max-w-8" />
          <span className="text-xs uppercase tracking-widest font-semibold text-muted-foreground">
            Événement en vedette
          </span>
          <div className="h-px flex-1 bg-border" />
        </div>

        {/* Banner card */}
        <Link to="/gala-escp" className="group block">
          <div className="relative h-52 sm:h-64 md:h-72 rounded-2xl overflow-hidden shadow-card hover:shadow-hover transition-shadow duration-300">
            {/* Background image */}
            <img
              src={galaBanner}
              alt="Gala de l'ESCP 2026"
              className="absolute inset-0 w-full h-full object-cover object-center transition-transform duration-500 group-hover:scale-105"
            />

            {/* Gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/40 to-transparent" />

            {/* Content */}
            <div className="relative h-full flex flex-col justify-center px-8 max-w-lg">
              <Badge className="w-fit mb-3 bg-amber-500/90 text-amber-950 font-semibold text-xs px-3 py-1 tracking-widest uppercase">
                Gala · 25 Avril 2026
              </Badge>

              <h2 className="text-3xl sm:text-4xl font-bold text-white mb-3 leading-tight">
                Gala de{" "}
                <em className="font-light not-italic text-amber-300">
                  l'ESCP
                </em>
              </h2>

              <div className="space-y-1 mb-5">
                <div className="flex items-center gap-2 text-white/70 text-sm">
                  <CalendarDays className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>Samedi 25 Avril 2026 · 19h00</span>
                </div>
                <div className="flex items-center gap-2 text-white/70 text-sm">
                  <MapPin className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>Palais Cambon – Capucines, Paris 1er</span>
                </div>
              </div>

              <Button
                size="sm"
                className="w-fit bg-amber-500 hover:bg-amber-400 text-amber-950 font-semibold gap-2 group-hover:gap-3 transition-all"
              >
                Voir les billets disponibles
                <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </Link>
      </div>
    </section>
  );
};

export default FeaturedGalaBanner;
