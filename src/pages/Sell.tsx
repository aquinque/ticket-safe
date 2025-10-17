import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import { BackButton } from "@/components/BackButton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Upload, AlertCircle, CheckCircle2, Calculator, Info } from "lucide-react";
import { Event } from "@/integrations/supabase/types/events";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

const Sell = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [events, setEvents] = useState<Event[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
    }
  }, [user, authLoading, navigate]);

  // Fetch events from database
  useEffect(() => {
    const fetchEvents = async () => {
      try {
        const { data, error } = await supabase
          .from('events')
          .select('*')
          .eq('is_active', true)
          .gte('date', new Date().toISOString())
          .order('date', { ascending: true });

        if (error) throw error;
        setEvents(data || []);
      } catch (error) {
        console.error('Error fetching events:', error);
        toast.error('Failed to load events');
      } finally {
        setEventsLoading(false);
      }
    };

    if (user) {
      fetchEvents();
    }
  }, [user]);
  
  const [formData, setFormData] = useState({
    eventId: "",
    sellingPrice: "",
    quantity: "1",
    description: "",
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleEventSelect = (eventId: string) => {
    const event = events?.find(e => e.id === eventId);
    if (event) {
      setSelectedEvent(event);
      setFormData({
        ...formData,
        eventId: event.id,
        sellingPrice: "",
      });
    }
  };

  const handlePriceChange = (value: string) => {
    setFormData({ ...formData, sellingPrice: value });
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

    setIsSubmitting(true);

    try {
      const sellingPrice = parseFloat(formData.sellingPrice);
      const basePrice = selectedEvent.base_price || 0;

      // Server-side validation
      const { data: validationData, error: validationError } = await supabase.functions.invoke(
        'validate-ticket-submission',
        {
          body: {
            eventId: selectedEvent.id,
            sellingPrice,
            quantity: parseInt(formData.quantity),
            notes: formData.description,
          },
        }
      );

      if (validationError || !validationData?.valid) {
        const errors = validationData?.errors || [validationError?.message || 'Validation failed'];
        toast.error(errors[0]);
        setIsSubmitting(false);
        return;
      }

      // Create ticket listing
      const { data, error } = await supabase
        .from('tickets')
        .insert({
          event_id: selectedEvent.id,
          seller_id: user.id,
          original_price: basePrice,
          selling_price: sellingPrice,
          quantity: parseInt(formData.quantity),
          notes: formData.description,
          status: 'available',
        })
        .select()
        .single();

      if (error) throw error;

      toast.success("Ticket listed successfully!");
      
      // Reset form
      setFormData({
        eventId: "",
        sellingPrice: "",
        quantity: "1",
        description: "",
      });
      setSelectedEvent(null);
      
      // Navigate to profile to see the listing
      setTimeout(() => navigate('/profile'), 1500);
      
    } catch (error: any) {
      console.error('Error creating ticket:', error);
      toast.error(error.message || "Failed to list ticket");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="py-16">
        <div className="container mx-auto px-4 max-w-4xl">
          <div className="mb-6">
            <BackButton />
          </div>
          {/* Header */}
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold mb-4">
              Sell your ticket now
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              List your tickets safely and connect with verified student buyers.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Main Form */}
            <div className="lg:col-span-2">
              <Card>
                <CardHeader>
                  <CardTitle>Ticket Information</CardTitle>
                  <CardDescription>
                    Fill in your event details and tickets for sale
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Event Details */}
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="event">Select your event</Label>
                      <Select 
                        value={formData.eventId} 
                        onValueChange={handleEventSelect}
                        disabled={eventsLoading}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={eventsLoading ? "Loading events..." : "Choose an event"} />
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
                                    {new Date(event.date).toLocaleDateString('en-US', { 
                                      day: 'numeric', 
                                      month: 'long', 
                                      year: 'numeric' 
                                    })} • {event.location}
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
                              {new Date(selectedEvent.date).toLocaleDateString('en-US', {
                                weekday: 'long',
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric',
                              })}
                            </p>
                          </div>
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>

                  {/* Pricing */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold">Ticket Prices</h3>
                    
                    {selectedEvent?.base_price && (
                      <Alert className="bg-primary/5 border-primary/20">
                        <Info className="w-4 h-4 text-primary" />
                        <AlertDescription>
                          <div className="space-y-1">
                            <p className="font-medium">Original Price: €{selectedEvent.base_price.toFixed(2)}</p>
                            <p className="text-sm text-muted-foreground">
                              Reference price for this event
                            </p>
                          </div>
                        </AlertDescription>
                      </Alert>
                    )}
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="sellingPrice">Your Selling Price (€)</Label>
                        <Input
                          id="sellingPrice"
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="Enter your price"
                          value={formData.sellingPrice}
                          onChange={(e) => handlePriceChange(e.target.value)}
                          disabled={!selectedEvent}
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          You can freely set your resale price. Make sure it remains fair and reasonable for fellow students.
                        </p>
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
                            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(num => (
                              <SelectItem key={num} value={num.toString()}>{num}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>

                  {/* Description */}
                  <div>
                    <Label htmlFor="description">Additional Notes (optional)</Label>
                    <Textarea
                      id="description"
                      placeholder="Add any additional details about your tickets..."
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      rows={3}
                    />
                  </div>

                  {/* File Upload */}
                  <div>
                    <Label>Ticket Photos (optional)</Label>
                    <div className="border-2 border-dashed border-muted rounded-lg p-8 text-center hover:border-primary/50 transition-colors cursor-pointer">
                      <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">
                        Click to add photos of your tickets
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Summary Sidebar */}
            <div className="space-y-6">
              {/* Price Calculator */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Calculator className="w-5 h-5" />
                    Pricing Summary
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Original price:</span>
                      <span className="font-medium">
                        {selectedEvent?.base_price ? `€${selectedEvent.base_price.toFixed(2)}` : "-"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Your price:</span>
                      <span className="font-medium">
                        {formData.sellingPrice ? `€${parseFloat(formData.sellingPrice).toFixed(2)}` : "-"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Number of tickets:</span>
                      <span className="font-medium">{formData.quantity}</span>
                    </div>
                    <hr className="border-border" />
                    <div className="flex justify-between text-lg font-semibold">
                      <span>Total earnings:</span>
                      <span className="text-primary">
                        {formData.sellingPrice ? 
                          `€${(parseFloat(formData.sellingPrice) * parseInt(formData.quantity)).toFixed(2)}` : 
                          "-"
                        }
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Guidelines */}
              <Card>
                <CardHeader>
                  <CardTitle>Selling Guidelines</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-accent mt-0.5 flex-shrink-0" />
                    <span>Set fair and reasonable prices</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-accent mt-0.5 flex-shrink-0" />
                    <span>Only verified students can buy</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-accent mt-0.5 flex-shrink-0" />
                    <span>Guaranteed secure payment</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-accent mt-0.5 flex-shrink-0" />
                    <span>All tickets verified for authenticity</span>
                  </div>
                </CardContent>
              </Card>

              {/* Submit Button */}
              <Button 
                variant="hero" 
                size="lg" 
                className="w-full"
                disabled={!selectedEvent || !formData.sellingPrice || isSubmitting}
                onClick={handleSubmit}
              >
                {isSubmitting ? "Publishing..." : "Publish my tickets"}
              </Button>
              
              <p className="text-xs text-center text-muted-foreground">
                By publishing, you agree to our terms and conditions
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Sell;