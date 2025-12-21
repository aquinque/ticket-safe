import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Routes, Route } from "react-router-dom";
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
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import Contact from "./pages/Contact";
import Privacy from "./pages/Privacy";
import OrganizerScan from "./pages/OrganizerScan";
import NotFound from "./pages/NotFound";

const App = () => (
  <TooltipProvider>
    <Toaster />
    <Sonner />
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
      <Route path="/auth" element={<Auth />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/contact" element={<Contact />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/organizer/scan" element={<OrganizerScan />} />
      {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  </TooltipProvider>
);

export default App;
