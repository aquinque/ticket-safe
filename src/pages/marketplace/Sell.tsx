/**
 * Marketplace Sell page
 *
 * Flow:
 *  1. Seller selects an event and fills in price / quantity / notes.
 *  2. Seller provides the QR code from their original ticket (text paste
 *     OR image upload).
 *  3. On submit → POST to submit-listing edge function which:
 *       - Validates all inputs
 *       - Verifies the QR (HMAC / deduplication / event status)
 *       - Creates the listing with status='available'
 *  4. Success: show confirmation with link to marketplace.
 *  5. Failure: show error message mapped from QRValidationCode.
 */

import { useState, useRef, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { z } from "zod";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { BackButton } from "@/components/BackButton";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  CheckCircle2,
  Info,
  QrCode,
  Upload,
  AlertTriangle,
  ExternalLink,
  Loader2,
  ShieldCheck,
  PencilLine,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Event } from "@/integrations/supabase/types/events";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { SEOHead } from "@/components/SEOHead";
import { decodeQRFromImage, isQRTextValid } from "@/lib/qrValidator";
import {
  QR_ERROR_MESSAGES,
  CreateListingResponse,
  QRValidationCode,
} from "@/types/listings";
import { useTicketListings } from "@/contexts/TicketListingsContext";

// ---------------------------------------------------------------------------
// Validation schema for the notes field
// ---------------------------------------------------------------------------

const notesSchema = z
  .string()
  .trim()
  .max(1000, "Notes must be less than 1000 characters")
  .regex(
    /^[a-zA-Z0-9\s.,!?'"()\-]*$/,
    "Notes can only contain letters, numbers, and basic punctuation"
  )
  .optional();

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const Sell = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { refetchListings } = useTicketListings();

  const [events, setEvents] = useState<Event[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // QR state
  const [qrText, setQrText] = useState("");
  const [qrInputMode, setQrInputMode] = useState<"text" | "image">("text");
  const [qrImageFile, setQrImageFile] = useState<File | null>(null);
  const [qrDecoding, setQrDecoding] = useState(false);
  const [qrDecodeError, setQrDecodeError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Success state
  const [createdListingId, setCreatedListingId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    eventId: "",
    sellingPrice: "",
    quantity: "1",
    notes: "",
  });

  // Guard: redirect unauthenticated users
  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
    }
  }, [user, authLoading, navigate]);

  // Fetch active future events
  useEffect(() => {
    if (!user) return;

    const fetchEvents = async () => {
      try {
        const { data, error } = await supabase
          .from("events")
          .select("*")
          .eq("is_active", true)
          .gte("date", new Date().toISOString())
          .order("date", { ascending: true });

        if (error) throw error;
        setEvents(data ?? []);
      } catch {
        toast.error("Failed to load events");
      } finally {
        setEventsLoading(false);
      }
    };

    fetchEvents();
  }, [user]);

  // ---------------------------------------------------------------------------
  // Event selection
  // ---------------------------------------------------------------------------

  const handleEventSelect = (eventId: string) => {
    const ev = events.find((e) => e.id === eventId);
    if (ev) {
      setSelectedEvent(ev);
      setFormData((prev) => ({ ...prev, eventId: ev.id, sellingPrice: "" }));
    }
  };

  // ---------------------------------------------------------------------------
  // QR image upload → decode
  // ---------------------------------------------------------------------------

  const handleImageUpload = async (file: File) => {
    setQrImageFile(file);
    setQrDecodeError(null);
    setQrDecoding(true);
    try {
      const decoded = await decodeQRFromImage(file);
      if (decoded) {
        setQrText(decoded);
        toast.success("QR code decoded from image.");
      } else {
        setQrDecodeError(
          "No QR code found in the image. Please try a clearer photo or paste the text."
        );
      }
    } catch (err: unknown) {
      setQrDecodeError(err instanceof Error ? err.message : "Failed to decode image.");
    } finally {
      setQrDecoding(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Form submit
  // ---------------------------------------------------------------------------

  const handleSubmit = async () => {
    if (!selectedEvent || !user) {
      toast.error("Please select an event");
      return;
    }

    const price = parseFloat(formData.sellingPrice);
    if (!formData.sellingPrice || !isFinite(price) || price <= 0) {
      toast.error("Please enter a valid selling price");
      return;
    }

    if (!isQRTextValid(qrText)) {
      toast.error("Please provide the QR code text from your ticket");
      return;
    }

    if (formData.notes) {
      const validation = notesSchema.safeParse(formData.notes);
      if (!validation.success) {
        toast.error(validation.error.errors[0].message);
        return;
      }
    }

    setIsSubmitting(true);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
        toast.error("Session expired. Please log in again.");
        navigate("/auth");
        return;
      }

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/submit-listing`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            eventId: formData.eventId,
            sellingPrice: price,
            quantity: parseInt(formData.quantity, 10),
            notes: formData.notes || undefined,
            qrText,
          }),
        }
      );

      const result: CreateListingResponse = await res.json();

      if (result.code === "VALID") {
        setCreatedListingId(result.listing.id);
        // Immediately refresh the marketplace so the listing is visible
        refetchListings();
        toast.success("Your ticket is now live on the marketplace!");
        // Reset form
        setFormData({ eventId: "", sellingPrice: "", quantity: "1", notes: "" });
        setSelectedEvent(null);
        setQrText("");
        setQrImageFile(null);
      } else {
        // Map code to friendly message
        const code = result.code as Exclude<QRValidationCode, "VALID">;
        const friendlyMsg =
          QR_ERROR_MESSAGES[code] ?? (result as { message?: string }).message ?? "An error occurred.";
        toast.error(friendlyMsg);
      }
    } catch {
      toast.error("Network error — please check your connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Success screen
  // ---------------------------------------------------------------------------

  if (createdListingId) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <SEOHead titleKey="marketplace.sell.title" descriptionKey="marketplace.sell.description" />
        <Header />
        <main className="flex-1 flex items-center justify-center py-16">
          <div className="container mx-auto px-4 max-w-lg text-center">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <ShieldCheck className="w-10 h-10 text-green-600" />
            </div>
            <h1 className="text-3xl font-bold mb-4">Ticket Listed!</h1>
            <p className="text-muted-foreground mb-8">
              Your ticket is now visible to all buyers in the marketplace.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button variant="hero" asChild>
                <Link to="/marketplace/buy">
                  <ExternalLink className="w-4 h-4 mr-2" />
                  View Marketplace
                </Link>
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setCreatedListingId(null);
                }}
              >
                List Another Ticket
              </Button>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Sell form
  // ---------------------------------------------------------------------------

  const canSubmit =
    !!selectedEvent &&
    !!formData.sellingPrice &&
    isQRTextValid(qrText) &&
    !isSubmitting;

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
              Verify your ticket with its QR code and list it in under a minute.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* ---- Main form ---- */}
            <div className="lg:col-span-2 space-y-6">
              {/* Event selection */}
              <Card>
                <CardHeader>
                  <CardTitle>Event</CardTitle>
                  <CardDescription>Select the event your ticket is for</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
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
                            eventsLoading ? "Loading events…" : "Choose your event"
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {events.length === 0 && !eventsLoading ? (
                          <div className="p-4 text-sm text-muted-foreground text-center">
                            No upcoming events available
                          </div>
                        ) : (
                          events.map((ev) => (
                            <SelectItem key={ev.id} value={ev.id}>
                              <div className="flex flex-col">
                                <span className="font-medium flex items-center gap-1.5">
                                  {ev.title}
                                  {ev.needs_review && (
                                    <span className="text-[10px] font-normal text-amber-600 border border-amber-300 bg-amber-50 rounded px-1 py-0.5 leading-none">
                                      à compléter
                                    </span>
                                  )}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  {new Date(ev.date).toLocaleDateString("en-US", {
                                    day: "numeric",
                                    month: "long",
                                    year: "numeric",
                                  })}{" "}
                                  · {ev.location}
                                  {ev.base_price != null && ` · Base: €${ev.base_price}`}
                                </span>
                              </div>
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  {selectedEvent && (
                    <>
                      <Alert className="bg-accent/10 border-accent">
                        <Info className="w-4 h-4 text-accent" />
                        <AlertDescription>
                          <p className="font-medium flex items-center gap-2">
                            {selectedEvent.title}
                            {selectedEvent.needs_review && (
                              <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50 text-xs">
                                <PencilLine className="w-3 h-3 mr-1" />
                                Informations à compléter
                              </Badge>
                            )}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {selectedEvent.university}
                            {selectedEvent.campus && ` · ${selectedEvent.campus}`}
                          </p>
                          <p className="text-sm">
                            {new Date(selectedEvent.date).toLocaleDateString("en-US", {
                              weekday: "long",
                              year: "numeric",
                              month: "long",
                              day: "numeric",
                            })}
                          </p>
                        </AlertDescription>
                      </Alert>
                      {selectedEvent.needs_review && (
                        <Alert className="border-amber-300 bg-amber-50">
                          <AlertTriangle className="w-4 h-4 text-amber-600" />
                          <AlertDescription className="text-amber-800 text-sm">
                            Les informations de cet événement sont incomplètes et en attente de validation.
                            Tu peux quand même lister ton billet — les détails seront complétés par un admin.
                          </AlertDescription>
                        </Alert>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>

              {/* QR Code */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <QrCode className="w-5 h-5" />
                    QR Code Verification
                  </CardTitle>
                  <CardDescription>
                    Paste the QR code text from your ticket or upload a photo.
                    This verifies the ticket is authentic and prevents duplicates.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Mode toggle */}
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={qrInputMode === "text" ? "default" : "outline"}
                      onClick={() => setQrInputMode("text")}
                    >
                      Paste text
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={qrInputMode === "image" ? "default" : "outline"}
                      onClick={() => setQrInputMode("image")}
                    >
                      Upload image
                    </Button>
                  </div>

                  {qrInputMode === "text" ? (
                    <div>
                      <Label htmlFor="qrText">
                        QR code text
                        <span className="text-destructive ml-1">*</span>
                      </Label>
                      <Textarea
                        id="qrText"
                        placeholder="Paste the full text / data from your QR code here…"
                        value={qrText}
                        onChange={(e) => setQrText(e.target.value)}
                        rows={4}
                        className="font-mono text-sm"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Scan your QR code with your phone camera, copy the resulting
                        link / text, and paste it here.
                      </p>
                    </div>
                  ) : (
                    <div>
                      <Label>Upload QR code image</Label>
                      <div
                        className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary transition-colors"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        {qrDecoding ? (
                          <div className="flex flex-col items-center gap-2">
                            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                            <p className="text-sm text-muted-foreground">
                              Decoding QR code…
                            </p>
                          </div>
                        ) : qrImageFile ? (
                          <div className="flex flex-col items-center gap-2">
                            <QrCode className="w-8 h-8 text-primary" />
                            <p className="text-sm font-medium">{qrImageFile.name}</p>
                            <p className="text-xs text-muted-foreground">
                              Click to replace
                            </p>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center gap-2">
                            <Upload className="w-8 h-8 text-muted-foreground" />
                            <p className="text-sm text-muted-foreground">
                              Click to upload a QR code image
                            </p>
                            <p className="text-xs text-muted-foreground">
                              JPEG, PNG, WebP · max 10 MB
                            </p>
                          </div>
                        )}
                      </div>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleImageUpload(file);
                        }}
                      />
                      {qrDecodeError && (
                        <Alert variant="destructive" className="mt-2">
                          <AlertTriangle className="w-4 h-4" />
                          <AlertDescription>{qrDecodeError}</AlertDescription>
                        </Alert>
                      )}
                    </div>
                  )}

                  {qrText && isQRTextValid(qrText) && (
                    <Alert className="bg-green-50 border-green-200">
                      <CheckCircle2 className="w-4 h-4 text-green-600" />
                      <AlertDescription className="text-green-800">
                        QR code text received ({qrText.length} chars). Authenticity
                        will be verified on submission.
                      </AlertDescription>
                    </Alert>
                  )}
                </CardContent>
              </Card>

              {/* Pricing */}
              <Card>
                <CardHeader>
                  <CardTitle>Pricing & Quantity</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="sellingPrice">
                        Selling price (€)
                        <span className="text-destructive ml-1">*</span>
                      </Label>
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
                      {selectedEvent?.base_price != null && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Max: €{(selectedEvent.base_price + 1).toFixed(2)} (base + €1)
                        </p>
                      )}
                    </div>

                    <div>
                      <Label htmlFor="quantity">Number of tickets</Label>
                      <Select
                        value={formData.quantity}
                        onValueChange={(v) => setFormData({ ...formData, quantity: v })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                            <SelectItem key={n} value={n.toString()}>
                              {n}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="notes">Additional notes (optional)</Label>
                    <Textarea
                      id="notes"
                      placeholder="Seat location, special conditions, etc."
                      value={formData.notes}
                      onChange={(e) =>
                        setFormData({ ...formData, notes: e.target.value })
                      }
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

            {/* ---- Sidebar ---- */}
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Selling Guidelines</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  {[
                    "Provide the real QR code from your original ticket",
                    "Set a fair price — max original + €1",
                    "Each QR code can only be listed once",
                    "Only verified students can buy",
                    "Secure escrow payment processing",
                  ].map((text) => (
                    <div key={text} className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-accent mt-0.5 flex-shrink-0" />
                      <span>{text}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Button
                variant="hero"
                size="lg"
                className="w-full"
                disabled={!canSubmit}
                onClick={handleSubmit}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Verifying & listing…
                  </>
                ) : (
                  "List Ticket"
                )}
              </Button>

              <p className="text-xs text-center text-muted-foreground">
                By listing, you agree to our{" "}
                <Link to="/privacy" className="underline">
                  terms of service
                </Link>
                .
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
