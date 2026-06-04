import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Routes, Route, Navigate } from "react-router-dom";
import { CookieConsent } from "@/components/CookieConsent";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import ScrollToTop from "@/components/ScrollToTop";
import Home from "./pages/Home";
import Tickets from "./pages/Tickets";
import Index from "./pages/Index";
import Events from "./pages/Events";
import EventsCatalog from "./pages/EventsCatalog";
import Marketplace from "./pages/Marketplace";
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
import MyListings from "./pages/settings/MyListings";
import PrivacyData from "./pages/settings/PrivacyData";
import Auth from "./pages/Auth";
import AuthConfirm from "./pages/AuthConfirm";
import ResetPassword from "./pages/ResetPassword";
import Contact from "./pages/Contact";
import Privacy from "./pages/Privacy";
import TermsConditions from "./pages/TermsConditions";
import CookiePolicy from "./pages/CookiePolicy";
import RefundPolicy from "./pages/RefundPolicy";
import MentionsLegales from "./pages/MentionsLegales";
import HowItWorks from "./pages/HowItWorks";
import HowItWorksTickets from "./pages/HowItWorksTickets";
import OrganizerScan from "./pages/OrganizerScan";
import ReviewTickets from "./pages/admin/ReviewTickets";
import StripeReturn from "./pages/StripeReturn";
import CheckoutSuccess from "./pages/CheckoutSuccess";
import CheckoutCancel from "./pages/CheckoutCancel";
import GalaESCP from "./pages/GalaESCP";
import Chat from "./pages/Chat";
import Messages from "./pages/Messages";
import ChatRoom from "./pages/ChatRoom";
import NotFound from "./pages/NotFound";
import Organizers from "./pages/organizers/Organizers";
import OrganizerApply from "./pages/organizers/OrganizerApply";
import StudioDashboard from "./pages/studio/StudioDashboard";
import StudioEventNew from "./pages/studio/StudioEventNew";
import StudioEventEdit from "./pages/studio/StudioEventEdit";
import StudioProfile from "./pages/studio/StudioProfile";
import EventPublic from "./pages/EventPublic";
import MyTickets from "./pages/MyTickets";
import AdminOrganizers from "./pages/admin/AdminOrganizers";
import ChatBubble from "./components/ChatBubble";

const App = () => (
  <ErrorBoundary>
  <TooltipProvider>
    <Toaster />
    <Sonner />
    <CookieConsent />
    <ScrollToTop />
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/tickets" element={<Tickets />} />
      <Route path="/resale" element={<Index />} />
      <Route path="/marketplace" element={<Marketplace />} />
      <Route path="/catalog" element={<Navigate to="/marketplace?view=all" replace />} />
      <Route path="/events" element={<Events />} />
      <Route path="/events/:id" element={<Events />} />
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
      <Route path="/settings/listings" element={<MyListings />} />
      <Route path="/settings/privacy" element={<PrivacyData />} />
      <Route path="/auth" element={<Auth />} />
      <Route path="/auth/confirm" element={<AuthConfirm />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/contact" element={<Contact />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/terms" element={<TermsConditions />} />
      <Route path="/cookie-policy" element={<CookiePolicy />} />
      <Route path="/refund-policy" element={<RefundPolicy />} />
      <Route path="/mentions-legales" element={<MentionsLegales />} />
      <Route path="/legal" element={<MentionsLegales />} />
      <Route path="/how-it-works" element={<HowItWorks />} />
      <Route path="/how-it-works/tickets" element={<HowItWorksTickets />} />
      <Route path="/organizer/scan" element={<OrganizerScan />} />
      <Route path="/admin/review" element={<ReviewTickets />} />
      <Route path="/stripe-return" element={<StripeReturn />} />
      <Route path="/checkout/success" element={<CheckoutSuccess />} />
      <Route path="/checkout/cancel" element={<CheckoutCancel />} />
      <Route path="/gala-escp" element={<GalaESCP />} />
      <Route path="/chat" element={<Chat />} />
      <Route path="/messages" element={<Messages />} />
      <Route path="/messages/:conversationId" element={<ChatRoom />} />
      <Route path="/organizers" element={<Organizers />} />
      <Route path="/organizers/apply" element={<OrganizerApply />} />
      <Route path="/studio" element={<StudioDashboard />} />
      <Route path="/studio/profile" element={<StudioProfile />} />
      <Route path="/studio/events/new" element={<StudioEventNew />} />
      <Route path="/studio/events/:id" element={<StudioEventEdit />} />
      <Route path="/e/:slug" element={<EventPublic />} />
      <Route path="/my-tickets/:orderId" element={<MyTickets />} />
      <Route path="/admin/organizers" element={<AdminOrganizers />} />
      {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
      <Route path="*" element={<NotFound />} />
    </Routes>
    <ChatBubble />
  </TooltipProvider>
  </ErrorBoundary>
);

export default App;
