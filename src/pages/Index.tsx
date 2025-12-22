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
