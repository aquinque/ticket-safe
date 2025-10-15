import Header from "@/components/Header";
import EventsSection from "@/components/EventsSection";
import { BackButton } from "@/components/BackButton";

const Events = () => {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="pt-8">
        <div className="container mx-auto px-4">
          <div className="mb-6">
            <BackButton />
          </div>
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold mb-4">
              Tous les événements
            </h1>
            <p className="text-lg text-muted-foreground">
              Explore tous les événements étudiants avec des tickets disponibles
            </p>
          </div>
        </div>
        <EventsSection />
      </main>
    </div>
  );
};

export default Events;