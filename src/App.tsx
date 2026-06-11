import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Routes, Route, Navigate } from "react-router-dom";
import { CookieConsent } from "@/components/CookieConsent";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import ScrollToTop from "@/components/ScrollToTop";
import ProtectedAdminRoute from "@/components/ProtectedAdminRoute";

// Eager: landing + 404 + auth (most likely first-paint targets)
import Home from "./pages/Home";
import NotFound from "./pages/NotFound";
import Auth from "./pages/Auth";

// Lazy: every other route. Each gets its own chunk loaded on demand.
const Tickets = lazy(() => import("./pages/Tickets"));
const Index = lazy(() => import("./pages/Index"));
const Events = lazy(() => import("./pages/Events"));
const Marketplace = lazy(() => import("./pages/Marketplace"));
const EventDetail = lazy(() => import("./pages/EventDetail"));
const EventTicketsMarketplace = lazy(() => import("./pages/EventTicketsMarketplace"));
const BuyTicket = lazy(() => import("./pages/BuyTicket"));
const Sell = lazy(() => import("./pages/Sell"));
const MarketplaceBuy = lazy(() => import("./pages/marketplace/Buy"));
const MarketplaceSell = lazy(() => import("./pages/marketplace/Sell"));
const Checkout = lazy(() => import("./pages/Checkout"));
const About = lazy(() => import("./pages/About"));
const Profile = lazy(() => import("./pages/Profile"));
const Settings = lazy(() => import("./pages/Settings"));
const InterfaceSettings = lazy(() => import("./pages/settings/InterfaceSettings"));
const PersonalInformation = lazy(() => import("./pages/settings/PersonalInformation"));
const PurchaseHistory = lazy(() => import("./pages/settings/PurchaseHistory"));
const MyListings = lazy(() => import("./pages/settings/MyListings"));
const PrivacyData = lazy(() => import("./pages/settings/PrivacyData"));
const AuthConfirm = lazy(() => import("./pages/AuthConfirm"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const Contact = lazy(() => import("./pages/Contact"));
const Privacy = lazy(() => import("./pages/Privacy"));
const TermsConditions = lazy(() => import("./pages/TermsConditions"));
const CookiePolicy = lazy(() => import("./pages/CookiePolicy"));
const RefundPolicy = lazy(() => import("./pages/RefundPolicy"));
const MentionsLegales = lazy(() => import("./pages/MentionsLegales"));
const HowItWorks = lazy(() => import("./pages/HowItWorks"));
const HowItWorksTickets = lazy(() => import("./pages/HowItWorksTickets"));
const OrganizerScan = lazy(() => import("./pages/OrganizerScan"));
const ReviewTickets = lazy(() => import("./pages/admin/ReviewTickets"));
const CheckoutSuccess = lazy(() => import("./pages/CheckoutSuccess"));
const CheckoutCancel = lazy(() => import("./pages/CheckoutCancel"));
const GalaESCP = lazy(() => import("./pages/GalaESCP"));
const Chat = lazy(() => import("./pages/Chat"));
const Messages = lazy(() => import("./pages/Messages"));
const ChatRoom = lazy(() => import("./pages/ChatRoom"));
const Organizers = lazy(() => import("./pages/organizers/Organizers"));
const OrganizerApply = lazy(() => import("./pages/organizers/OrganizerApply"));
const StudioDashboard = lazy(() => import("./pages/studio/StudioDashboard"));
const StudioEventNew = lazy(() => import("./pages/studio/StudioEventNew"));
const StudioEventEdit = lazy(() => import("./pages/studio/StudioEventEdit"));
const StudioProfile = lazy(() => import("./pages/studio/StudioProfile"));
const EventPublic = lazy(() => import("./pages/EventPublic"));
const MyTickets = lazy(() => import("./pages/MyTickets"));
const MyTicketsHub = lazy(() => import("./pages/MyTicketsHub"));
const AdminOrganizers = lazy(() => import("./pages/admin/AdminOrganizers"));
const AdminPayouts = lazy(() => import("./pages/admin/AdminPayouts"));
const AdminDebug = lazy(() => import("./pages/admin/AdminDebug"));
const ChatBubble = lazy(() => import("./components/ChatBubble"));

// Minimal fallback — a quiet spinner, no header, no chrome. Replaces the
// flash of nothing while a lazy chunk loads. Designed so users on slow
// networks don't think the click failed.
const RouteFallback = () => (
  <div className="min-h-screen flex items-center justify-center">
    <div
      role="status"
      aria-label="Loading"
      className="w-8 h-8 rounded-full border-2 border-muted border-t-primary animate-spin"
    />
  </div>
);

const App = () => (
  <ErrorBoundary>
  <TooltipProvider>
    <Toaster />
    <Sonner />
    <CookieConsent />
    <ScrollToTop />
    <Suspense fallback={<RouteFallback />}>
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
        <Route path="/admin/review" element={<ProtectedAdminRoute><ReviewTickets /></ProtectedAdminRoute>} />
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
        <Route path="/my-tickets" element={<MyTicketsHub />} />
        <Route path="/my-tickets/:orderId" element={<MyTickets />} />
        <Route path="/admin/organizers" element={<ProtectedAdminRoute><AdminOrganizers /></ProtectedAdminRoute>} />
        <Route path="/admin/payouts" element={<ProtectedAdminRoute><AdminPayouts /></ProtectedAdminRoute>} />
        <Route path="/admin/debug" element={<ProtectedAdminRoute><AdminDebug /></ProtectedAdminRoute>} />
        {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
    <Suspense fallback={null}>
      <ChatBubble />
    </Suspense>
  </TooltipProvider>
  </ErrorBoundary>
);

export default App;
