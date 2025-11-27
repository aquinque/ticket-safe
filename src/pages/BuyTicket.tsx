import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { BackButton } from "@/components/BackButton";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Calendar, MapPin, Users, CreditCard } from "lucide-react";
import { eventsList } from "@/data/eventsData";
import { SEOHead } from "@/components/SEOHead";

const BuyTicket = () => {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const [event, setEvent] = useState(eventsList.find(e => e.id === eventId));

  useEffect(() => {
    if (!event) {
      navigate("/events");
    }
  }, [event, navigate]);

  if (!event) {
    return null;
  }

  // Default ticket price (in cents for Stripe compatibility)
  const ticketPrice = {
    amount: 45000, // €450.00
    currency: 'EUR'
  };

  const formatPrice = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
    }).format(amount / 100);
  };

  const handleProceedToPayment = () => {
    // Placeholder for Stripe integration
    // This will be replaced with actual Stripe checkout
    console.log("Payment data ready for Stripe:", {
      eventId: event.id,
      eventTitle: event.title,
      amount: ticketPrice.amount,
      currency: ticketPrice.currency,
      description: `Ticket for ${event.title}`
    });

    // For now, navigate to checkout page
    navigate("/checkout", {
      state: {
        eventId: event.id,
        eventTitle: event.title,
        amount: ticketPrice.amount,
        currency: ticketPrice.currency
      }
    });
  };

  const formatDateRange = () => {
    const startDate = new Date(event.date);
    const endDate = event.endDate ? new Date(event.endDate) : null;

    const options: Intl.DateTimeFormatOptions = {
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    };

    if (endDate) {
      return `${startDate.toLocaleDateString('en-US', options)} - ${endDate.toLocaleDateString('en-US', options)}`;
    }
    return startDate.toLocaleDateString('en-US', options);
  };

  return (
    <>
      <SEOHead titleKey="nav.buyTickets" descriptionKey="hero.subtitle" />
      <Header />
      <main className="min-h-screen bg-background py-8">
        <div className="container mx-auto px-4 max-w-4xl">
          <div className="mb-6">
            <BackButton />
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {/* Event Image */}
            <div className="relative h-80 md:h-auto rounded-xl overflow-hidden">
              <img
                src={event.image}
                alt={event.title}
                className="w-full h-full object-cover"
              />
              <div className="absolute top-4 right-4">
                <span className="bg-primary text-primary-foreground px-3 py-1 rounded-full text-sm font-semibold">
                  {event.category}
                </span>
              </div>
            </div>

            {/* Event Details & Purchase */}
            <div className="flex flex-col">
              <div className="mb-6">
                <h1 className="text-3xl font-bold mb-4">{event.title}</h1>

                <div className="space-y-3 mb-6">
                  <div className="flex items-start gap-3 text-muted-foreground">
                    <Calendar className="w-5 h-5 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="font-medium text-foreground">Date</p>
                      <p>{formatDateRange()}</p>
                      <p className="text-sm">Starting at {event.time}</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 text-muted-foreground">
                    <MapPin className="w-5 h-5 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="font-medium text-foreground">Location</p>
                      <p>{event.location}</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 text-muted-foreground">
                    <Users className="w-5 h-5 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="font-medium text-foreground">Organized by</p>
                      <p>{event.organizer}</p>
                    </div>
                  </div>
                </div>

                <div className="bg-muted/50 p-4 rounded-lg mb-6">
                  <h3 className="font-semibold mb-2">About this event</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {event.description}
                  </p>
                </div>
              </div>

              {/* Price & Payment */}
              <Card className="p-6 mt-auto">
                <div className="flex items-baseline justify-between mb-4">
                  <span className="text-muted-foreground">Ticket Price</span>
                  <span className="text-3xl font-bold">
                    {formatPrice(ticketPrice.amount, ticketPrice.currency)}
                  </span>
                </div>

                <p className="text-sm text-muted-foreground mb-6">
                  Includes accommodation, ski passes, and organized activities
                </p>

                <Button
                  size="lg"
                  className="w-full"
                  variant="hero"
                  onClick={handleProceedToPayment}
                >
                  <CreditCard className="w-5 h-5 mr-2" />
                  Proceed to Payment
                </Button>

                <p className="text-xs text-center text-muted-foreground mt-4">
                  Secure payment powered by Stripe
                </p>
              </Card>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
};

export default BuyTicket;
