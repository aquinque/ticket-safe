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
        <div className="container mx-auto px-4 max-w-7xl">
          <div className="mb-8">
            <BackButton />
          </div>

          {/* Page Header - Single, Clear Title */}
          <div className="text-center mb-10">
            <h1 className="text-4xl md:text-5xl font-bold mb-4">
              Available Events
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-6">
              Browse events with tickets currently available for purchase
            </p>
            <Button
              variant="outline"
              onClick={() => navigate("/catalog")}
              className="gap-2 text-xs"
              size="sm"
            >
              <List className="w-4 h-4" />
              View Full Catalog
            </Button>
          </div>
        </div>
        <EventsSection />
      </main>
      <Footer />
    </div>
  );
};

export default Events;