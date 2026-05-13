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

          {/* Page Header */}
          <div className="text-center mb-10">
            <h1 className="text-4xl md:text-5xl font-bold mb-4">
              Available Events
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-3">
              Events with tickets currently listed for sale by verified students.
            </p>
            <p className="text-sm text-muted-foreground mb-6">
              Don't see your event?{" "}
              <button
                onClick={() => navigate("/catalog")}
                className="text-primary underline underline-offset-4 hover:no-underline font-medium"
              >
                Browse the full ESCP catalog
              </button>
              {" "}— no tickets required.
            </p>
            <Button
              variant="outline"
              onClick={() => navigate("/catalog")}
              className="gap-2 text-xs"
              size="sm"
              aria-label="View full event catalog including events without tickets"
            >
              <List className="w-4 h-4" />
              Full Catalog (all events)
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