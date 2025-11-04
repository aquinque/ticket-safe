import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { BackButton } from "@/components/BackButton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle2, Info } from "lucide-react";
import { Event } from "@/integrations/supabase/types/events";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { SEOHead } from "@/components/SEOHead";

const notesSchema = z
  .string()
  .trim()
  .max(1000, "Notes must be less than 1000 characters")
  .regex(/^[a-zA-Z0-9\s.,!?'"-]*$/, "Notes can only contain letters, numbers, and basic punctuation")
  .optional();

const Sell = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [events, setEvents] = useState<Event[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    eventId: "",
    sellingPrice: "",
    quantity: "1",
    notes: "",
  });

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        const { data, error } = await supabase
          .from("events")
          .select("*")
          .eq("is_active", true)
          .gte("date", new Date().toISOString())
          .order("date", { ascending: true });

        if (error) throw error;
        setEvents(data || []);
      } catch (error) {
        console.error("Error fetching events:", error);
        toast.error("Failed to load events");
      } finally {
        setEventsLoading(false);
      }
    };

    if (user) {
      fetchEvents();
    }
  }, [user]);

  const handleEventSelect = (eventId: string) => {
    const event = events?.find((e) => e.id === eventId);
    if (event) {
      setSelectedEvent(event);
      setFormData({
        ...formData,
        eventId: event.id,
        sellingPrice: "",
      });
    }
  };

  const handleSubmit = async () => {
    if (!selectedEvent || !user) {
      toast.error("Please select an event");
      return;
    }

    if (!formData.sellingPrice || parseFloat(formData.sellingPrice) <= 0) {
      toast.error("Please enter a valid selling price");
      return;
    }

    if (formData.notes) {
      const notesValidation = notesSchema.safeParse(formData.notes);
      if (!notesValidation.success) {
        toast.error(notesValidation.error.errors[0].message);
        return;
      }
    }

    setIsSubmitting(true);

    try {
      const sellingPrice = parseFloat(formData.sellingPrice);
      const basePrice = selectedEvent.base_price || 0;

      const { data: validationData, error: validationError } = await supabase.functions.invoke(
        "validate-ticket-submission",
        {
          body: {
            eventId: selectedEvent.id,
            sellingPrice,
            quantity: parseInt(formData.quantity),
            notes: formData.notes,
          },
        }
      );

      if (validationError || !validationData?.valid) {
        const errors = validationData?.errors || [validationError?.message || "Validation failed"];
        toast.error(errors[0]);
        setIsSubmitting(false);
        return;
      }

      const { data, error } = await supabase
        .from("tickets")
        .insert({
          event_id: selectedEvent.id,
          seller_id: user.id,
          original_price: basePrice,
          selling_price: sellingPrice,
          quantity: parseInt(formData.quantity),
          notes: formData.notes,
          status: "available",
        })
        .select()
        .single();

      if (error) throw error;

      toast.success("Your ticket is live on TicketSafe.");

      setFormData({
        eventId: "",
        sellingPrice: "",
        quantity: "1",
        notes: "",
      });
      setSelectedEvent(null);

      setTimeout(() => navigate("/profile"), 1500);
    } catch (error: any) {
      console.error("Error creating ticket:", error);
      toast.error(error.message || "Failed to list ticket");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SEOHead titleKey="marketplace.sell.title" descriptionKey="marketplace.sell.description" />
      <Header />
      <main className="py-16 flex-1">
        <div className="container mx-auto px-4 max-w-4xl">
          <div className="mb-6">
            <BackButton />
          </div>

          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold mb-4">Sell a Ticket</h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              List your first ticket in under a minute
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2">
              <Card>
                <CardHeader>
                  <CardTitle>Ticket Information</CardTitle>
                  <CardDescription>Fill in the details about your ticket</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="event">Select Event</Label>
                      <Select
                        value={formData.eventId}
                        onValueChange={handleEventSelect}
                        disabled={eventsLoading}
                      >
                        <SelectTrigger>
                          <SelectValue
                            placeholder={
                              eventsLoading ? "Loading events..." : "Choose your event"
                            }
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {events.length === 0 && !eventsLoading ? (
                            <div className="p-4 text-sm text-muted-foreground text-center">
                              No upcoming events available
                            </div>
                          ) : (
                            events.map((event) => (
                              <SelectItem key={event.id} value={event.id}>
                                <div className="flex flex-col">
                                  <span className="font-medium">{event.title}</span>
                                  <span className="text-xs text-muted-foreground">
                                    {new Date(event.date).toLocaleDateString("en-US", {
                                      day: "numeric",
                                      month: "long",
                                      year: "numeric",
                                    })}{" "}
                                    • {event.location}
                                    {event.base_price && ` • Base: €${event.base_price}`}
                                  </span>
                                </div>
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                    </div>

                    {selectedEvent && (
                      <Alert className="bg-accent/10 border-accent">
                        <Info className="w-4 h-4 text-accent" />
                        <AlertDescription>
                          <div className="space-y-1">
                            <p className="font-medium">{selectedEvent.title}</p>
                            <p className="text-sm text-muted-foreground">
                              {selectedEvent.university} • {selectedEvent.campus}
                            </p>
                            <p className="text-sm">
                              {new Date(selectedEvent.date).toLocaleDateString("en-US", {
                                weekday: "long",
                                year: "numeric",
                                month: "long",
                                day: "numeric",
                              })}
                            </p>
                          </div>
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>

                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold">Pricing</h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="sellingPrice">Your Selling Price (€)</Label>
                        <Input
                          id="sellingPrice"
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0.00"
                          value={formData.sellingPrice}
                          onChange={(e) =>
                            setFormData({ ...formData, sellingPrice: e.target.value })
                          }
                          disabled={!selectedEvent}
                        />
                      </div>

                      <div>
                        <Label htmlFor="quantity">Number of Tickets</Label>
                        <Select
                          value={formData.quantity}
                          onValueChange={(value) => setFormData({ ...formData, quantity: value })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                              <SelectItem key={num} value={num.toString()}>
                                {num}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="notes">Additional Notes (Optional)</Label>
                    <Textarea
                      id="notes"
                      placeholder="Seat location, special conditions, etc."
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      rows={3}
                      maxLength={1000}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      {formData.notes.length}/1000 characters
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Selling Guidelines</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-accent mt-0.5 flex-shrink-0" />
                    <span>Set fair prices based on demand</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-accent mt-0.5 flex-shrink-0" />
                    <span>Only verified students can buy</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-accent mt-0.5 flex-shrink-0" />
                    <span>Secure payment processing</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-accent mt-0.5 flex-shrink-0" />
                    <span>Verified ticket authenticity</span>
                  </div>
                </CardContent>
              </Card>

              <Button
                variant="hero"
                size="lg"
                className="w-full"
                disabled={!selectedEvent || !formData.sellingPrice || isSubmitting}
                onClick={handleSubmit}
              >
                {isSubmitting ? "Listing ticket..." : "List Ticket"}
              </Button>

              <p className="text-xs text-center text-muted-foreground">
                By listing, you agree to our terms of service
              </p>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Sell;
