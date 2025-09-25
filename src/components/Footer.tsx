import { Link } from "react-router-dom";
import { Ticket, Mail, Instagram, Twitter, Linkedin } from "lucide-react";

const Footer = () => {
  return (
    <footer className="bg-foreground text-background py-12 mt-16">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-hero rounded-lg flex items-center justify-center">
                <Ticket className="w-5 h-5 text-white" />
              </div>
              <span className="font-bold text-xl">RESEAT</span>
            </div>
            <p className="text-sm text-background/70">
              La plateforme étudiante de revente de tickets équitable. 
              Revends ton ticket. Trouve ta place.
            </p>
            <div className="flex gap-3">
              <a href="#" className="w-8 h-8 bg-background/10 rounded-lg flex items-center justify-center hover:bg-background/20 transition-colors">
                <Instagram className="w-4 h-4" />
              </a>
              <a href="#" className="w-8 h-8 bg-background/10 rounded-lg flex items-center justify-center hover:bg-background/20 transition-colors">
                <Twitter className="w-4 h-4" />
              </a>
              <a href="#" className="w-8 h-8 bg-background/10 rounded-lg flex items-center justify-center hover:bg-background/20 transition-colors">
                <Linkedin className="w-4 h-4" />
              </a>
            </div>
          </div>

          {/* Navigation */}
          <div>
            <h3 className="font-semibold mb-4">Navigation</h3>
            <div className="space-y-2">
              <Link to="/" className="block text-sm text-background/70 hover:text-background transition-colors">
                Accueil
              </Link>
              <Link to="/events" className="block text-sm text-background/70 hover:text-background transition-colors">
                Événements
              </Link>
              <Link to="/sell" className="block text-sm text-background/70 hover:text-background transition-colors">
                Vendre
              </Link>
              <Link to="/about" className="block text-sm text-background/70 hover:text-background transition-colors">
                À propos
              </Link>
            </div>
          </div>

          {/* Support */}
          <div>
            <h3 className="font-semibold mb-4">Support</h3>
            <div className="space-y-2">
              <a href="#" className="block text-sm text-background/70 hover:text-background transition-colors">
                Centre d'aide
              </a>
              <a href="#" className="block text-sm text-background/70 hover:text-background transition-colors">
                Conditions d'utilisation
              </a>
              <a href="#" className="block text-sm text-background/70 hover:text-background transition-colors">
                Politique de confidentialité
              </a>
              <a href="#" className="block text-sm text-background/70 hover:text-background transition-colors">
                Contact
              </a>
            </div>
          </div>

          {/* Contact */}
          <div>
            <h3 className="font-semibold mb-4">Contact</h3>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-background/70">
                <Mail className="w-4 h-4" />
                <span>hello@reseat.fr</span>
              </div>
              <p className="text-sm text-background/70">
                École Centrale Paris
                <br />
                Châtenay-Malabry, France
              </p>
            </div>
          </div>
        </div>

        <div className="border-t border-background/20 mt-8 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-sm text-background/70">
            © 2024 RESEAT. Tous droits réservés.
          </p>
          <p className="text-sm text-background/70">
            Fait avec ❤️ par des étudiants, pour des étudiants
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;