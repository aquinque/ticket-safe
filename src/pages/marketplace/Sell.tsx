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
  Clock,
  Search,
  X,
  CalendarPlus,
  Camera,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Event } from "@/integrations/supabase/types/events";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { SEOHead } from "@/components/SEOHead";
import { decodeQRFromFile, extractTextFromFile, isQRTextValid } from "@/lib/qrValidator";
import { calcBreakdown } from "@/lib/fees";
import { QRScanner } from "@/components/QRScanner";
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
    /^[\p{L}\p{N}\s.,!?'"()\-:;€@#]*$/u,
    "Notes can only contain letters, numbers, and basic punctuation"
  )
  .optional();

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const Sell = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { refetchListings } = useTicketListings();

  // Event autocomplete
  const [eventSearch, setEventSearch] = useState("");
  const [searchResults, setSearchResults] = useState<Event[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showStubForm, setShowStubForm] = useState(false);
  const [stubDate, setStubDate] = useState("");
  const [isCreatingStub, setIsCreatingStub] = useState(false);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // QR state
  const [qrText, setQrText] = useState("");
  const [qrInputMode, setQrInputMode] = useState<"image" | "camera">("image");
  const [qrImageFile, setQrImageFile] = useState<File | null>(null);
  const [qrDecoding, setQrDecoding] = useState(false);
  const [qrDecodeError, setQrDecodeError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // QR verification status (PART 4)
  type QRVerifyStatus = {
    status: "valid" | "wrong_event" | "expired" | "already_used" | "already_listed" | "unreadable_qr" | "invalid";
    qr_type?: "platform" | "external";
    needs_review?: boolean;
    message: string;
  };
  const [qrVerifyStatus, setQrVerifyStatus] = useState<QRVerifyStatus | null>(null);
  const [qrVerifying, setQrVerifying] = useState(false);

  // Extracted ticket text (from PDF text layer)
  const [extractedText, setExtractedText] = useState<string | null>(null);

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

  // Debounced event search
  useEffect(() => {
    if (!user) return;
    if (eventSearch.length < 2) {
      setSearchResults([]);
      setShowSuggestions(false);
      return;
    }

    const timer = setTimeout(async () => {
      setSearchLoading(true);
      try {
        // search_events is not in the generated types yet; cast via unknown
        const { data, error } = await (supabase as unknown as {
          rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
        }).rpc("search_events", { query: eventSearch, max_results: 8 });
        if (!error) {
          setSearchResults((data as unknown as Event[]) ?? []);
          setShowSuggestions(true);
        }
      } catch {
        // silent — user can still type more
      } finally {
        setSearchLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [eventSearch, user]);

  // Close suggestions on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(e.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // ---------------------------------------------------------------------------
  // Auto-verify QR when text is ready
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!isQRTextValid(qrText) || !user) {
      setQrVerifyStatus(null);
      return;
    }

    let cancelled = false;
    const verify = async () => {
      setQrVerifying(true);
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        if (!token || cancelled) return;

        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verify-qr`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ qrText, eventId: formData.eventId || undefined, userId: user.id }),
          }
        );
        const data: QRVerifyStatus = await res.json();
        if (!cancelled) setQrVerifyStatus(data);
      } catch {
        // silent — verify is best-effort; submit-listing is the source of truth
        if (!cancelled) setQrVerifyStatus(null);
      } finally {
        if (!cancelled) setQrVerifying(false);
      }
    };

    // Debounce 400ms (user may be typing in paste mode)
    const t = setTimeout(verify, 400);
    return () => { cancelled = true; clearTimeout(t); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qrText, formData.eventId, user]);

  // ---------------------------------------------------------------------------
  // Create stub event when seller's event isn't listed
  // ---------------------------------------------------------------------------

  const handleCreateStub = async () => {
    if (!stubDate || eventSearch.trim().length < 3) return;
    setIsCreatingStub(true);
    try {
      const { data, error } = await (supabase as unknown as {
        rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
      }).rpc("create_stub_event", {
        p_title:     eventSearch.trim(),
        p_starts_at: new Date(stubDate).toISOString(),
      });
      if (error) throw error;
      const stubId = data as string;
      const stub: Event = {
        id:                  stubId,
        title:               eventSearch.trim(),
        description:         null,
        date:                new Date(stubDate).toISOString(),
        location:            "",
        category:            "Other",
        university:          "ESCP Business School",
        campus:              null,
        image_url:           null,
        is_active:           true,
        base_price:          null,
        created_at:          new Date().toISOString(),
        updated_at:          new Date().toISOString(),
      };
      setSelectedEvent(stub);
      setFormData((prev) => ({ ...prev, eventId: stubId, sellingPrice: "" }));
      setShowSuggestions(false);
      setShowStubForm(false);
      setStubDate("");
      toast.success("Événement créé. Les détails seront complétés par un administrateur.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur lors de la création de l'événement.");
    } finally {
      setIsCreatingStub(false);
    }
  };

  // ---------------------------------------------------------------------------
  // QR image upload → decode
  // ---------------------------------------------------------------------------

  const handleFileUpload = async (file: File) => {
    setQrImageFile(file);
    setQrDecodeError(null);
    setQrText("");
    setExtractedText(null);
    setQrDecoding(true);
    const isPDF = file.type === "application/pdf";
    console.log("[Sell] file upload received:", file.name, file.size, file.type);
    try {
      // Run QR decode and text extraction in parallel
      const [decoded, text] = await Promise.all([
        decodeQRFromFile(file),
        extractTextFromFile(file),
      ]);

      if (text) {
        setExtractedText(text);
        console.log("[Sell] extracted text:", text.length, "chars →", text.slice(0, 80).replace(/\s+/g, " "));
      }

      if (decoded) {
        console.log("[Sell] decode success:", decoded.slice(0, 80));
        setQrText(decoded);
        toast.success("Ticket accepted");
      } else {
        console.warn("[Sell] decode returned null — no QR found");
        setQrDecodeError(
          isPDF
            ? "No QR code detected in this PDF. Make sure the ticket PDF contains a QR code and is not password-protected."
            : "No QR code detected in this image. Make sure the QR code is clearly visible and not blurry. Try uploading a cleaner screenshot."
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to read file.";
      console.error("[Sell] decode threw:", msg);
      setQrDecodeError(msg);
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
      toast.error("QR not detected — please scan, upload, or paste the QR code from your ticket.");
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
      // Always force a token refresh to avoid "invalid jwt" errors from expired tokens.
      // refreshSession() fetches a fresh token from Supabase auth server unconditionally.
      const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
      const accessToken = refreshed.session?.access_token;
      if (refreshError || !accessToken) {
        toast.error("Session expired. Please log in again.");
        navigate("/auth");
        return;
      }

      const payload = {
        eventId: formData.eventId,
        sellingPrice: price,
        quantity: parseInt(formData.quantity, 10),
        notes: formData.notes || undefined,
        qrText,
        extractedText: extractedText || undefined,
      };
      console.log("[Sell] submitting to submit-listing:", {
        ...payload,
        qrText: qrText.length > 60 ? qrText.slice(0, 60) + "…" : qrText,
      });

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/submit-listing`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify(payload),
        }
      );

      // Handle auth errors (gateway "Invalid JWT" or 401)
      if (res.status === 401) {
        console.error("[Sell] 401 auth error from submit-listing");
        toast.error("Session expired. Please log in again.");
        navigate("/auth");
        return;
      }

      // Surface raw error text if response is not JSON
      if (!res.ok && res.headers.get("content-type")?.includes("text/html")) {
        console.error("[Sell] non-JSON error response:", res.status, await res.text());
        toast.error(`Server error (${res.status}). Please try again.`);
        return;
      }

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
        setExtractedText(null);
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
            <>
                <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                  <ShieldCheck className="w-10 h-10 text-green-600" />
                </div>
                <h1 className="text-3xl font-bold mb-4">Ticket published successfully!</h1>
                <p className="text-muted-foreground mb-8">
                  Your ticket is now visible to all buyers in the marketplace.
                </p>
              </>
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
                    <Label htmlFor="eventSearch">Search for your event</Label>
                    <div className="relative" ref={suggestionsRef}>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                        <Input
                          id="eventSearch"
                          placeholder="Gala ESCP, BDE soirée, Intercampus…"
                          value={selectedEvent ? selectedEvent.title : eventSearch}
                          onChange={(e) => {
                            if (selectedEvent) {
                              setSelectedEvent(null);
                              setFormData((prev) => ({ ...prev, eventId: "", sellingPrice: "" }));
                            }
                            setEventSearch(e.target.value);
                            setShowSuggestions(true);
                          }}
                          onFocus={() => {
                            if (eventSearch.length >= 2) setShowSuggestions(true);
                          }}
                          className="pl-9 pr-8"
                          autoComplete="off"
                        />
                        {searchLoading && (
                          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
                        )}
                        {selectedEvent && !searchLoading && (
                          <button
                            type="button"
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            onClick={() => {
                              setSelectedEvent(null);
                              setEventSearch("");
                              setFormData((prev) => ({ ...prev, eventId: "", sellingPrice: "" }));
                            }}
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>

                      {/* Suggestions dropdown */}
                      {showSuggestions && !selectedEvent && (
                        <div className="absolute z-50 w-full mt-1 bg-background border rounded-md shadow-md overflow-hidden max-h-64 overflow-y-auto">
                          {searchResults.length > 0 ? (
                            searchResults.map((ev) => (
                              <button
                                key={ev.id}
                                type="button"
                                className="w-full text-left px-4 py-3 hover:bg-muted/60 transition-colors border-b last:border-b-0"
                                onClick={() => {
                                  setSelectedEvent(ev);
                                  setEventSearch(ev.title);
                                  setFormData((prev) => ({ ...prev, eventId: ev.id, sellingPrice: "" }));
                                  setShowSuggestions(false);
                                }}
                              >
                                <p className="font-medium text-sm leading-none mb-1">
                                  {ev.title}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {new Date(ev.date).toLocaleDateString("fr-FR", {
                                    day: "numeric",
                                    month: "long",
                                    year: "numeric",
                                  })}
                                  {ev.location && ` · ${ev.location}`}
                                  {ev.base_price != null && ` · Base €${ev.base_price}`}
                                </p>
                              </button>
                            ))
                          ) : eventSearch.length >= 2 && !searchLoading ? (
                            <div className="px-4 py-3">
                              <p className="text-sm text-muted-foreground text-center mb-3">
                                Aucun résultat pour &quot;{eventSearch}&quot;
                              </p>
                              {!showStubForm ? (
                                <button
                                  type="button"
                                  className="w-full text-left px-3 py-2 rounded border border-dashed border-primary/40 text-sm text-primary hover:bg-primary/5 transition-colors flex items-center gap-2"
                                  onClick={() => setShowStubForm(true)}
                                >
                                  <CalendarPlus className="w-4 h-4 shrink-0" />
                                  Mon événement n&apos;est pas listé — le créer
                                </button>
                              ) : (
                                <div className="space-y-3 p-3 rounded border bg-muted/30">
                                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                    Créer un événement
                                  </p>
                                  <Input
                                    value={eventSearch}
                                    onChange={(e) => setEventSearch(e.target.value)}
                                    placeholder="Nom de l'événement"
                                    className="text-sm"
                                  />
                                  <div>
                                    <Label htmlFor="stubDate" className="text-xs text-muted-foreground">
                                      Date de l&apos;événement
                                    </Label>
                                    <Input
                                      id="stubDate"
                                      type="datetime-local"
                                      value={stubDate}
                                      onChange={(e) => setStubDate(e.target.value)}
                                      min={new Date().toISOString().slice(0, 16)}
                                      className="text-sm"
                                    />
                                  </div>
                                  <div className="flex gap-2">
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="hero"
                                      className="flex-1"
                                      disabled={!stubDate || eventSearch.trim().length < 3 || isCreatingStub}
                                      onClick={handleCreateStub}
                                    >
                                      {isCreatingStub ? (
                                        <><Loader2 className="w-3 h-3 mr-1 animate-spin" />Création…</>
                                      ) : "Confirmer"}
                                    </Button>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      onClick={() => setShowStubForm(false)}
                                    >
                                      Annuler
                                    </Button>
                                  </div>
                                </div>
                              )}
                            </div>
                          ) : null}
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Tapez au moins 2 caractères pour voir les suggestions.
                    </p>
                  </div>

                  {selectedEvent && (
                    <>
                      <Alert className="bg-accent/10 border-accent">
                        <Info className="w-4 h-4 text-accent" />
                        <AlertDescription>
                          <p className="font-medium flex items-center gap-2">
                            {selectedEvent.title}
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
                  <div className="flex gap-2 flex-wrap">
                    <Button
                      type="button"
                      size="sm"
                      variant={qrInputMode === "image" ? "default" : "outline"}
                      onClick={() => setQrInputMode("image")}
                    >
                      Upload image
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={qrInputMode === "camera" ? "default" : "outline"}
                      onClick={() => setQrInputMode("camera")}
                    >
                      <Camera className="w-3.5 h-3.5 mr-1.5" />
                      Scan with camera
                    </Button>
                  </div>

                  {qrInputMode === "image" && (
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
                              Reading ticket…
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
                              Upload your ticket (PDF or screenshot)
                            </p>
                            <p className="text-xs text-muted-foreground">
                              PDF, JPEG, PNG, WebP · max 25 MB
                            </p>
                          </div>
                        )}
                      </div>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp,application/pdf"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleFileUpload(file);
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

                  {qrInputMode === "camera" && (
                    <QRScanner
                      onScan={(text) => {
                        setQrText(text);
                        setQrInputMode("image");
                        toast.success("Ticket accepted");
                      }}
                      onClose={() => setQrInputMode("image")}
                    />
                  )}

                  {qrText && isQRTextValid(qrText) && (
                    <>
                      {/* Raw value preview */}
                      <div className="rounded border bg-muted/40 px-3 py-2 font-mono text-xs break-all text-muted-foreground">
                        {qrText.length > 100 ? qrText.slice(0, 100) + "…" : qrText}
                      </div>

                      {/* Verification status */}
                      {qrVerifying && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Verifying QR code…
                        </div>
                      )}

                      {!qrVerifying && qrVerifyStatus && (
                        <>
                          {qrVerifyStatus.status === "valid" && (
                            <Alert className="bg-green-50 border-green-200">
                              <CheckCircle2 className="w-4 h-4 text-green-600" />
                              <AlertDescription className="text-green-800 font-medium">
                                Ticket accepted
                                {qrVerifyStatus.needs_review && (
                                  <span className="font-normal ml-1 text-green-700">
                                    — will be reviewed before going live
                                  </span>
                                )}
                              </AlertDescription>
                            </Alert>
                          )}
                          {qrVerifyStatus.status === "already_used" && (
                            <Alert variant="destructive">
                              <AlertTriangle className="w-4 h-4" />
                              <AlertDescription>
                                <span className="font-medium">Ticket rejected</span> — already sold or used
                              </AlertDescription>
                            </Alert>
                          )}
                          {qrVerifyStatus.status === "already_listed" && (
                            <Alert className="bg-yellow-50 border-yellow-300">
                              <AlertTriangle className="w-4 h-4 text-yellow-600" />
                              <AlertDescription className="text-yellow-800">
                                <span className="font-medium">Already listed</span> — submitting will replace your existing listing
                              </AlertDescription>
                            </Alert>
                          )}
                          {qrVerifyStatus.status === "expired" && (
                            <Alert variant="destructive">
                              <AlertTriangle className="w-4 h-4" />
                              <AlertDescription>
                                <span className="font-medium">Ticket expired</span> — event has already taken place
                              </AlertDescription>
                            </Alert>
                          )}
                          {qrVerifyStatus.status === "wrong_event" && (
                            <Alert variant="destructive">
                              <AlertTriangle className="w-4 h-4" />
                              <AlertDescription>
                                <span className="font-medium">Wrong event</span> — this QR belongs to a different event
                              </AlertDescription>
                            </Alert>
                          )}
                          {qrVerifyStatus.status === "invalid" && (
                            <Alert variant="destructive">
                              <AlertTriangle className="w-4 h-4" />
                              <AlertDescription>
                                <span className="font-medium">Ticket rejected</span> — invalid or fraudulent QR code
                              </AlertDescription>
                            </Alert>
                          )}
                          {qrVerifyStatus.status === "unreadable_qr" && (
                            <Alert variant="destructive">
                              <AlertTriangle className="w-4 h-4" />
                              <AlertDescription>
                                <span className="font-medium">QR unreadable</span> — try uploading a clearer image
                              </AlertDescription>
                            </Alert>
                          )}
                        </>
                      )}
                    </>
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
                    "Set a fair price for your ticket",
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

              {(() => {
                const price = parseFloat(formData.sellingPrice);
                const qty = parseInt(formData.quantity, 10) || 1;
                const hasPrice = isFinite(price) && price > 0;
                const bd = hasPrice ? calcBreakdown(price, qty) : null;
                return (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Your Earnings</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">
                          Listing price{qty > 1 ? ` × ${qty}` : ""}
                        </span>
                        <span>{bd ? `€${bd.listPriceEuros.toFixed(2)}` : "—"}</span>
                      </div>
                      <div className="flex justify-between text-destructive/80">
                        <span>Platform commission (5%)</span>
                        <span>{bd ? `−€${bd.sellerCommissionEuros.toFixed(2)}` : "—"}</span>
                      </div>
                      <div className="flex justify-between font-bold text-green-700 border-t pt-2 mt-1">
                        <span>You receive</span>
                        <span>{bd ? `€${bd.sellerPayoutEuros.toFixed(2)}` : "—"}</span>
                      </div>
                    </CardContent>
                  </Card>
                );
              })()}

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
