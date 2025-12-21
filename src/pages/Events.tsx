import { useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import EventsSection from "@/components/EventsSection";
import { BackButton } from "@/components/BackButton";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/contexts/I18nContext";
import { SEOHead } from "@/components/SEOHead";
import { List } from "lucide-react";

const Events = () => {
  const { t } = useI18n();
  const navigate = useNavigate();

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
            <div className="flex items-center justify-center gap-4 mb-4">
              <h1 className="text-4xl font-bold">
                {t('events.title')}
              </h1>
              <Button
                variant="outline"
                onClick={() => navigate("/catalog")}
                className="gap-2"
              >
                <List className="w-4 h-4" />
                Full Catalog
              </Button>
            </div>
            <p className="text-lg text-muted-foreground">
              {t('events.subtitle')}
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              Only showing events with tickets currently available for purchase
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