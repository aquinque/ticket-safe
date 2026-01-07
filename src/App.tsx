import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Routes, Route } from "react-router-dom";
import { CookieConsent } from "@/components/CookieConsent";
import Index from "./pages/Index";
import Events from "./pages/Events";
import EventsCatalog from "./pages/EventsCatalog";
import EventDetail from "./pages/EventDetail";
import EventTicketsMarketplace from "./pages/EventTicketsMarketplace";
import BuyTicket from "./pages/BuyTicket";
import Sell from "./pages/Sell";
import MarketplaceBuy from "./pages/marketplace/Buy";
import MarketplaceSell from "./pages/marketplace/Sell";
import Checkout from "./pages/Checkout";
import About from "./pages/About";
import Profile from "./pages/Profile";
import Settings from "./pages/Settings";
import InterfaceSettings from "./pages/settings/InterfaceSettings";
import PersonalInformation from "./pages/settings/PersonalInformation";
import PurchaseHistory from "./pages/settings/PurchaseHistory";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import Contact from "./pages/Contact";
import Privacy from "./pages/Privacy";
import TermsConditions from "./pages/TermsConditions";
import CookiePolicy from "./pages/CookiePolicy";
import RefundPolicy from "./pages/RefundPolicy";
import OrganizerScan from "./pages/OrganizerScan";
import NotFound from "./pages/NotFound";

const App = () => (
  <TooltipProvider>
    <Toaster />
    <Sonner />
    <CookieConsent />
    <Routes>
      <Route path="/" element={<Index />} />
      <Route path="/events" element={<Events />} />
      <Route path="/events/:id" element={<Events />} />
      <Route path="/catalog" element={<EventsCatalog />} />
      <Route path="/event/:eventId" element={<EventDetail />} />
      <Route path="/event/:eventId/tickets" element={<EventTicketsMarketplace />} />
      <Route path="/buy-ticket/:listingId" element={<BuyTicket />} />
      <Route path="/sell" element={<Sell />} />
      <Route path="/marketplace/buy" element={<MarketplaceBuy />} />
      <Route path="/marketplace/sell" element={<MarketplaceSell />} />
      <Route path="/checkout" element={<Checkout />} />
      <Route path="/about" element={<About />} />
      <Route path="/profile" element={<Profile />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="/settings/interface" element={<InterfaceSettings />} />
      <Route path="/settings/personal" element={<PersonalInformation />} />
      <Route path="/settings/purchases" element={<PurchaseHistory />} />
      <Route path="/auth" element={<Auth />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/contact" element={<Contact />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/terms" element={<TermsConditions />} />
      <Route path="/cookie-policy" element={<CookiePolicy />} />
      <Route path="/refund-policy" element={<RefundPolicy />} />
      <Route path="/organizer/scan" element={<OrganizerScan />} />
      {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  </TooltipProvider>
);

export default App;
