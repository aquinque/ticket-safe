import Header from "@/components/Header";
import Footer from "@/components/Footer";
import EventsSection from "@/components/EventsSection";
import { BackButton } from "@/components/BackButton";
import { useI18n } from "@/contexts/I18nContext";
import { SEOHead } from "@/components/SEOHead";

const Events = () => {
  const { t } = useI18n();
  
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SEOHead titleKey="events.title" descriptionKey="events.subtitle" />
      <Header />
      <main className="flex-1 pt-8">
        <div className="container mx-auto px-4">
          <div className="mb-6">
            <BackButton />
          </div>
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold mb-4">
              {t('events.title')}
            </h1>
            <p className="text-lg text-muted-foreground">
              {t('events.subtitle')}
            </p>
          </div>
        </div>
        <EventsSection />
      </main>
      <Footer />
    </div>
  );
};

export default Events;