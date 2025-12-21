import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { BackButton } from "@/components/BackButton";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, MapPin, Users, ShoppingBag } from "lucide-react";
import { ESCPEvent, useESCPEvents } from "@/hooks/useESCPEvents";
import { SEOHead } from "@/components/SEOHead";

const EventDetail = () => {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const { events } = useESCPEvents({ onlyWithTickets: true });
  const [event, setEvent] = useState<ESCPEvent | null>(null);

  useEffect(() => {
    const foundEvent = events.find(e => e.id === eventId);
    if (foundEvent) {
      setEvent(foundEvent);
    } else if (events.length > 0) {
      // Only redirect if events are loaded and event not found
      navigate("/events");
    }
  }, [eventId, navigate, events]);

  if (!event) {
    return null;
  }

  const formatDateRange = () => {
    const startDate = new Date(event.start_date);
    const endDate = new Date(event.end_date);

    const options: Intl.DateTimeFormatOptions = {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    };

    // Only show date range if start and end are different days
    const sameDay = startDate.toDateString() === endDate.toDateString();

    if (!sameDay) {
      return `${startDate.toLocaleDateString('en-US', options)} - ${endDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`;
    }
    return startDate.toLocaleDateString('en-US', options);
  };

  const handleBrowseTickets = () => {
    navigate(`/event/${event.id}/tickets`);
  };

  return (
    <>
      <SEOHead titleKey="nav.home" descriptionKey="hero.subtitle" />
      <Header />
      <main className="min-h-screen bg-background">
        {/* Hero Image Section */}
        <div className="relative h-[40vh] md:h-[50vh] overflow-hidden bg-gradient-to-br from-primary/20 to-primary/5">
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-transparent" />
          <div className="absolute top-4 left-4 md:top-8 md:left-8">
            <BackButton variant="secondary" />
          </div>
          <div className="absolute bottom-4 left-4 md:bottom-8 md:left-8">
            <Badge variant="secondary" className="text-lg px-4 py-2">
              {event.category || 'Event'}
            </Badge>
          </div>
        </div>

        {/* Content Section */}
        <div className="container mx-auto px-4 -mt-20 relative z-10 pb-16">
          <div className="max-w-4xl mx-auto">
            <Card className="backdrop-blur-sm bg-card/95">
              <CardContent className="p-6 md:p-8">
                {/* Title */}
                <h1 className="text-3xl md:text-5xl font-bold mb-6">{event.title}</h1>

                {/* Event Info Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Calendar className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Date</p>
                      <p className="font-semibold">{formatDateRange()}</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                      <MapPin className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Location</p>
                      <p className="font-semibold">{event.location}</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Users className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Organized by</p>
                      <p className="font-semibold">{event.organizer || 'ESCP Campus Life'}</p>
                    </div>
                  </div>
                </div>

                {/* Description */}
                <div className="mb-8">
                  <h2 className="text-2xl font-bold mb-4">About This Event</h2>
                  <p className="text-muted-foreground leading-relaxed text-lg">
                    {event.description}
                  </p>
                </div>

                {/* CTA */}
                <div className="pt-6 border-t">
                  <Button
                    size="lg"
                    variant="hero"
                    className="w-full md:w-auto text-lg px-8 py-6"
                    onClick={handleBrowseTickets}
                  >
                    <ShoppingBag className="w-5 h-5 mr-2" />
                    Browse Available Tickets
                  </Button>
                  <p className="text-sm text-muted-foreground mt-4">
                    View tickets listed by verified students
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
};

export default EventDetail;
