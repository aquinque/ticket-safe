import { useState, useEffect } from "react";
import Header from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Upload, AlertCircle, CheckCircle2, Calculator } from "lucide-react";
import { Event } from "@/integrations/supabase/types/events";

const Sell = () => {
  // Mock events for now (until Supabase is configured)
  const mockEvents: Event[] = [
    {
      id: "1",
      title: "Soirée de rentrée ESCP 2024",
      description: "Grande soirée de rentrée",
      date: "2024-10-15T20:00:00",
      location: "Le Showcase, Paris",
      university: "ESCP",
      image_url: null,
      category: "Soirée",
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: "2",
      title: "Gala des Mines - Grande Soirée",
      description: "Gala annuel",
      date: "2024-11-08T19:30:00",
      location: "Pavillon Dauphine, Paris",
      university: "Mines",
      image_url: null,
      category: "Gala",
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];
  
  const events = mockEvents;
  const eventsLoading = false;
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  
  const [formData, setFormData] = useState({
    eventId: "",
    eventTitle: "",
    originalPrice: "",
    sellingPrice: "",
    quantity: "1",
    school: "",
    campus: "",
    eventType: "",
    eventDate: "",
    description: "",
  });

  const [priceValidation, setPriceValidation] = useState<{
    isValid: boolean;
    maxPrice: number;
    percentage: number;
  } | null>(null);

  const handlePriceChange = (originalPrice: string, sellingPrice: string) => {
    const original = parseFloat(originalPrice);
    const selling = parseFloat(sellingPrice);

    if (original && selling) {
      const maxAllowed = original * 1.5; // +50% maximum
      const percentage = ((selling - original) / original) * 100;
      
      setPriceValidation({
        isValid: selling <= maxAllowed,
        maxPrice: maxAllowed,
        percentage: percentage,
      });
    } else {
      setPriceValidation(null);
    }
  };

  const handleEventSelect = (eventId: string) => {
    const event = events?.find(e => e.id === eventId);
    if (event) {
      setSelectedEvent(event);
      const newFormData = {
        ...formData,
        eventId: event.id,
        eventTitle: event.title,
        school: event.university,
        eventType: event.category,
        eventDate: new Date(event.date).toISOString().split('T')[0],
      };
      setFormData(newFormData);
    }
  };

  const handleInputChange = (field: string, value: string) => {
    const newFormData = { ...formData, [field]: value };
    setFormData(newFormData);

    if (field === "originalPrice" || field === "sellingPrice") {
      handlePriceChange(
        field === "originalPrice" ? value : formData.originalPrice,
        field === "sellingPrice" ? value : formData.sellingPrice
      );
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="py-16">
        <div className="container mx-auto px-4 max-w-4xl">
          {/* Header */}
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold mb-4">
              Sell my tickets
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Resell your tickets with ease. Respect our fair policy: 
              maximum +50% of the initial price to prevent speculation.
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
                          <SelectValue placeholder={eventsLoading ? "Loading..." : "Choose an event"} />
                        </SelectTrigger>
                        <SelectContent>
                          {events?.map((event) => (
                            <SelectItem key={event.id} value={event.id}>
                              <div className="flex flex-col">
                                <span className="font-medium">{event.title}</span>
                                <span className="text-xs text-muted-foreground">
                                  {new Date(event.date).toLocaleDateString('fr-FR', { 
                                    day: 'numeric', 
                                    month: 'long', 
                                    year: 'numeric' 
                                  })} • {event.location}
                                </span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground mt-1">
                        The initial price will be automatically filled
                      </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="school">School</Label>
                        <Select value={formData.school} onValueChange={(value) => {
                          handleInputChange("school", value);
                          // Reset campus when school changes
                          if (value !== "escp") {
                            handleInputChange("campus", "");
                          }
                        }}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a school" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="escp">ESCP Business School</SelectItem>
                            <SelectItem value="hec">HEC Paris</SelectItem>
                            <SelectItem value="essec">ESSEC Business School</SelectItem>
                            <SelectItem value="edhec">EDHEC Business School</SelectItem>
                            <SelectItem value="em-lyon">EM Lyon</SelectItem>
                            <SelectItem value="other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {formData.school === "escp" && (
                        <div>
                          <Label htmlFor="campus">Campus</Label>
                          <Select value={formData.campus} onValueChange={(value) => handleInputChange("campus", value)}>
                            <SelectTrigger>
                              <SelectValue placeholder="Select a campus" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="paris">Paris</SelectItem>
                              <SelectItem value="turin">Turin</SelectItem>
                              <SelectItem value="madrid">Madrid</SelectItem>
                              <SelectItem value="londres">London</SelectItem>
                              <SelectItem value="berlin">Berlin</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="eventType">Event Type</Label>
                        <Select value={formData.eventType} onValueChange={(value) => handleInputChange("eventType", value)}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="soiree">Party</SelectItem>
                            <SelectItem value="gala">Gala</SelectItem>
                            <SelectItem value="concert">Concert</SelectItem>
                            <SelectItem value="wei">WEI</SelectItem>
                            <SelectItem value="conference">Conference</SelectItem>
                            <SelectItem value="sport">Sports Event</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="eventDate">Event Date</Label>
                      <Input
                        id="eventDate"
                        type="date"
                        value={formData.eventDate}
                        onChange={(e) => handleInputChange("eventDate", e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Pricing */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold">Ticket Prices</h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <Label htmlFor="originalPrice">Original Price (€)</Label>
                        <Input
                          id="originalPrice"
                          type="number"
                          placeholder="25"
                          value={formData.originalPrice}
                          disabled
                          className="bg-muted"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Automatically set
                        </p>
                      </div>

                      <div>
                        <Label htmlFor="sellingPrice">Selling Price (€)</Label>
                        <Input
                          id="sellingPrice"
                          type="number"
                          placeholder="30"
                          value={formData.sellingPrice}
                          onChange={(e) => handleInputChange("sellingPrice", e.target.value)}
                        />
                      </div>

                      <div>
                        <Label htmlFor="quantity">Number of Tickets</Label>
                        <Select value={formData.quantity} onValueChange={(value) => handleInputChange("quantity", value)}>
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

                    {/* Price Validation */}
                    {priceValidation && (
                      <Alert className={priceValidation.isValid ? "border-accent bg-accent/5" : "border-destructive bg-destructive/5"}>
                        <div className="flex items-center gap-2">
                          {priceValidation.isValid ? (
                            <CheckCircle2 className="w-4 h-4 text-accent" />
                          ) : (
                            <AlertCircle className="w-4 h-4 text-destructive" />
                          )}
                          <AlertDescription>
                            {priceValidation.isValid ? (
                              <>
                                Price respecting the +50% rule 
                                <Badge variant="secondary" className="ml-2">
                                  +{priceValidation.percentage.toFixed(1)}%
                                </Badge>
                              </>
                            ) : (
                              <>
                                Price too high! Maximum allowed: {priceValidation.maxPrice.toFixed(2)}€ 
                                <Badge variant="destructive" className="ml-2">
                                  +{priceValidation.percentage.toFixed(1)}%
                                </Badge>
                              </>
                            )}
                          </AlertDescription>
                        </div>
                      </Alert>
                    )}
                  </div>

                  {/* Description */}
                  <div>
                    <Label htmlFor="description">Description (optional)</Label>
                    <Textarea
                      id="description"
                      placeholder="Add details about the event, selling conditions..."
                      value={formData.description}
                      onChange={(e) => handleInputChange("description", e.target.value)}
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
                    Price Calculator
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Original price:</span>
                      <span className="font-medium">
                        {formData.originalPrice ? `${formData.originalPrice}€` : "-"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Maximum price (+50%):</span>
                      <span className="font-medium text-accent">
                        {formData.originalPrice ? `${(parseFloat(formData.originalPrice) * 1.5).toFixed(2)}€` : "-"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Number of tickets:</span>
                      <span className="font-medium">{formData.quantity}</span>
                    </div>
                    <hr className="border-border" />
                    <div className="flex justify-between text-lg font-semibold">
                      <span>Estimated total:</span>
                      <span className="text-primary">
                        {formData.sellingPrice ? 
                          `${(parseFloat(formData.sellingPrice) * parseInt(formData.quantity)).toFixed(2)}€` : 
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
                  <CardTitle>Ticket Safe Rules</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-accent mt-0.5 flex-shrink-0" />
                    <span>Maximum +50% of initial price</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-accent mt-0.5 flex-shrink-0" />
                    <span>Guaranteed secure payment</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-accent mt-0.5 flex-shrink-0" />
                    <span>5% commission on sale</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-accent mt-0.5 flex-shrink-0" />
                    <span>Refund if event cancelled</span>
                  </div>
                </CardContent>
              </Card>

              {/* Submit Button */}
              <Button 
                variant="hero" 
                size="lg" 
                className="w-full"
                disabled={!priceValidation?.isValid || !formData.eventId || !formData.sellingPrice}
              >
                Publish my tickets
              </Button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Sell;