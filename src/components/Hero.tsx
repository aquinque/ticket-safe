import { Button } from "@/components/ui/button";
import { ArrowRight, Search, Shield, Users } from "lucide-react";
import { Link } from "react-router-dom";
import heroImage from "@/assets/hero-bg.jpg";

const Hero = () => {
  return (
    <section className="relative overflow-hidden">
      {/* Background Image */}
      <div 
        className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-10"
        style={{ backgroundImage: `url(${heroImage})` }}
      />
      
      {/* Background Gradient Overlay */}
      <div className="absolute inset-0 bg-gradient-hero opacity-5" />

      <div className="relative container mx-auto px-4 py-20 md:py-32">
        <div className="max-w-4xl mx-auto text-center">
          {/* Main Heading */}
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold mb-6 animate-fade-in">
            <span className="bg-gradient-hero bg-clip-text text-transparent">
              Revends ton ticket.
            </span>
            <br />
            <span className="text-foreground">
              Trouve ta place.
            </span>
          </h1>

          {/* Subtitle */}
          <p className="text-lg md:text-xl text-muted-foreground mb-8 max-w-2xl mx-auto animate-slide-up">
            La plateforme étudiante de revente de tickets équitable. 
            Rachète et revends tes places pour les événements étudiants en toute sécurité, 
            avec un prix plafonné à +20% maximum.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12 animate-slide-up">
            <Button variant="hero" size="lg" asChild>
              <Link to="/events">
                <Search className="w-5 h-5" />
                Trouver des événements
                <ArrowRight className="w-5 h-5" />
              </Link>
            </Button>
            <Button variant="outline-primary" size="lg" asChild>
              <Link to="/sell">
                Vendre mes tickets
              </Link>
            </Button>
          </div>

          {/* Trust Indicators */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-3xl mx-auto">
            <div className="flex flex-col items-center gap-3 p-4">
              <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center">
                <Shield className="w-6 h-6 text-primary" />
              </div>
              <h3 className="font-semibold text-foreground">Paiement sécurisé</h3>
              <p className="text-sm text-muted-foreground text-center">
                Transactions protégées et remboursement garanti
              </p>
            </div>

            <div className="flex flex-col items-center gap-3 p-4">
              <div className="w-12 h-12 bg-secondary/10 rounded-xl flex items-center justify-center">
                <Users className="w-6 h-6 text-secondary" />
              </div>
              <h3 className="font-semibold text-foreground">Prix équitables</h3>
              <p className="text-sm text-muted-foreground text-center">
                Maximum +20% du prix initial, fini la spéculation
              </p>
            </div>

            <div className="flex flex-col items-center gap-3 p-4">
              <div className="w-12 h-12 bg-accent/10 rounded-xl flex items-center justify-center">
                <Search className="w-6 h-6 text-accent" />
              </div>
              <h3 className="font-semibold text-foreground">Facile à utiliser</h3>
              <p className="text-sm text-muted-foreground text-center">
                Interface intuitive spécialement conçue pour les étudiants
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;