import Header from "@/components/Header";
import Hero from "@/components/Hero";
import WhyTicketSafe from "@/components/WhyTicketSafe";
import EventsSection from "@/components/EventsSection";
import Footer from "@/components/Footer";
import { SEOHead } from "@/components/SEOHead";

const Index = () => {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SEOHead titleKey="nav.home" descriptionKey="hero.subtitle" />
      <Header />

      {/* 🎉 New Announcement Banner - You'll see this change live! */}
      <div className="bg-gradient-to-r from-primary to-purple-600 text-white py-3 px-4 text-center animate-in slide-in-from-top duration-500">
        <p className="text-sm md:text-base font-semibold">
          🎉 New! TicketSafe now has full legal protection & cookie consent - Your data is safe! ✅
        </p>
      </div>

      <main className="flex-1">
        <Hero />
        <WhyTicketSafe />
        <EventsSection />
      </main>
      <Footer />
    </div>
  );
};

export default Index;
