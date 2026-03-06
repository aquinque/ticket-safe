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
  CreditCard,
  BadgeCheck,
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
import { decodeQRFromImage, isQRTextValid } from "@/lib/qrValidator";
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
    /^[a-zA-Z0-9\s.,!?'"()\-]*$/,
    "Notes can only contain letters, numbers, and basic punctuation"
  )
  .optional();

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Stripe account status type
// ---------------------------------------------------------------------------

interface StripeAccountStatus {
  has_account: boolean;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
  onboarding_status: "pending" | "restricted" | "complete";
}

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

  // Stripe onboarding state
  const [stripeStatus, setStripeStatus] = useState<StripeAccountStatus | null>(null);
  const [stripeLoading, setStripeLoading] = useState(true);
  const [onboardingLoading, setOnboardingLoading] = useState(false);

  // QR state
  const [qrText, setQrText] = useState("");
  const [qrInputMode, setQrInputMode] = useState<"text" | "image" | "camera">("text");
  const [qrImageFile, setQrImageFile] = useState<File | null>(null);
  const [qrDecoding, setQrDecoding] = useState(false);
  const [qrDecodeError, setQrDecodeError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // QR verification status (PART 4)
  type QRVerifyStatus = {
    status: "valid" | "wrong_event" | "expired" | "already_used" | "unreadable_qr" | "invalid";
    qr_type?: "platform" | "external";
    needs_review?: boolean;
    message: string;
  };
  const [qrVerifyStatus, setQrVerifyStatus] = useState<QRVerifyStatus | null>(null);
  const [qrVerifying, setQrVerifying] = useState(false);

  // Success state
  const [createdListingId, setCreatedListingId] = useState<string | null>(null);
  const [listingNeedsReview, setListingNeedsReview] = useState(false);

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

  // Fetch Stripe account status
  useEffect(() => {
    if (!user) return;

    const fetchStripeStatus = async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        if (!token) return;

        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-account-status`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const data: StripeAccountStatus = await res.json();
        setStripeStatus(data);
      } catch {
        // Silently fail — user can still list, they'll be blocked at checkout
      } finally {
        setStripeLoading(false);
      }
    };

    // Also handle ?onboarding=refresh (Stripe redirect when link expired)
    const params = new URLSearchParams(window.location.search);
    if (params.get("onboarding") === "refresh") {
      toast.info("Your onboarding link expired. Click 'Activate Payments' to get a new one.");
    }

    fetchStripeStatus();
  }, [user]);

  const handleActivatePayments = async () => {
    setOnboardingLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        toast.error("Session expired. Please log in again.");
        return;
      }

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-onboard-seller`,
        { method: "POST", headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json();

      if (data.url) {
        window.location.href = data.url;
      } else {
        toast.error(data.error ?? "Failed to start onboarding. Please try again.");
      }
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setOnboardingLoading(false);
    }
  };

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
            body: JSON.stringify({ qrText, eventId: formData.eventId || undefined }),
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
        date:                new Date(stubDate).toISOString(),
        location:            null,
        category:            "Other",
        university:          "ESCP Business School",
        campus:              null,
        image_url:           null,
        is_active:           true,
        base_price:          null,
        external_source:     null,
        external_event_id:   null,
        needs_review:        true,
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

  const handleImageUpload = async (file: File) => {
    setQrImageFile(file);
    setQrDecodeError(null);
    setQrText("");
    setQrDecoding(true);
    console.log("[Sell] image upload received:", file.name, file.size, file.type);
    try {
      const decoded = await decodeQRFromImage(file);
      if (decoded) {
        console.log("[Sell] decode success:", decoded);
        setQrText(decoded);
        toast.success("QR code decoded.");
      } else {
        console.warn("[Sell] decode returned null — no QR found in image");
        setQrDecodeError(
          "No QR code detected in this image. Make sure the QR code is clearly visible, well-lit, and not blurry. Try uploading a screenshot instead of a photo."
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to decode image.";
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
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
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
          },
          body: JSON.stringify(payload),
        }
      );

      const result: CreateListingResponse = await res.json();

      if (result.code === "VALID") {
        const pendingReview = !result.listing.qr_verified;
        setListingNeedsReview(pendingReview);
        setCreatedListingId(result.listing.id);
        // Immediately refresh the marketplace so the listing is visible
        refetchListings();
        if (pendingReview) {
          toast.info("Ticket uploaded. Pending verification by our team.");
        } else {
          toast.success("Your ticket is now live on the marketplace!");
        }
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
            {listingNeedsReview ? (
              <>
                <div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Clock className="w-10 h-10 text-amber-600" />
                </div>
                <h1 className="text-3xl font-bold mb-4">Ticket Submitted</h1>
                <p className="text-muted-foreground mb-8">
                  Your ticket is pending verification. It will appear in the marketplace once reviewed by our team.
                </p>
              </>
            ) : (
              <>
                <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                  <ShieldCheck className="w-10 h-10 text-green-600" />
                </div>
                <h1 className="text-3xl font-bold mb-4">Ticket Listed!</h1>
                <p className="text-muted-foreground mb-8">
                  Your ticket is now visible to all buyers in the marketplace.
                </p>
              </>
            )}
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
                  setListingNeedsReview(false);
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

          {/* ---- Stripe onboarding banner ---- */}
          {!stripeLoading && (
            <div className="mb-8">
              {stripeStatus?.charges_enabled ? (
                <Alert className="bg-green-50 border-green-200">
                  <BadgeCheck className="w-4 h-4 text-green-600" />
                  <AlertDescription className="text-green-800 flex items-center justify-between">
                    <span>
                      <strong>Payments active.</strong> You'll receive payouts
                      automatically when a buyer completes checkout.
                    </span>
                  </AlertDescription>
                </Alert>
              ) : stripeStatus?.details_submitted ? (
                <Alert className="bg-amber-50 border-amber-300">
                  <Clock className="w-4 h-4 text-amber-600" />
                  <AlertDescription className="text-amber-800">
                    <strong>Verification in progress.</strong> Stripe is reviewing
                    your account. You can list tickets now — payouts activate once
                    approved (usually a few minutes).
                  </AlertDescription>
                </Alert>
              ) : (
                <Card className="border-2 border-primary/30 bg-primary/5">
                  <CardContent className="pt-6">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                      <div className="flex items-start gap-3">
                        <CreditCard className="w-6 h-6 text-primary mt-0.5 shrink-0" />
                        <div>
                          <p className="font-semibold">Activate payments to get paid</p>
                          <p className="text-sm text-muted-foreground">
                            Set up your Stripe account so you can receive money when
                            your tickets sell. Takes ~2 minutes.
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="hero"
                        onClick={handleActivatePayments}
                        disabled={onboardingLoading}
                        className="shrink-0"
                      >
                        {onboardingLoading ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Redirecting…
                          </>
                        ) : (
                          <>
                            <CreditCard className="w-4 h-4 mr-2" />
                            Activate Payments
                          </>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

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
                                  {ev.needs_review && (
                                    <span className="ml-2 text-[10px] font-normal text-amber-600 border border-amber-300 bg-amber-50 rounded px-1 py-0.5">
                                      à compléter
                                    </span>
                                  )}
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

                  {qrInputMode === "text" && (
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
                  )}

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

                  {qrInputMode === "camera" && (
                    <QRScanner
                      onScan={(text) => {
                        setQrText(text);
                        setQrInputMode("text");
                        toast.success("QR code scanned successfully.");
                      }}
                      onClose={() => setQrInputMode("text")}
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
                            <Alert className={qrVerifyStatus.needs_review ? "bg-amber-50 border-amber-200" : "bg-green-50 border-green-200"}>
                              {qrVerifyStatus.needs_review
                                ? <Clock className="w-4 h-4 text-amber-600" />
                                : <CheckCircle2 className="w-4 h-4 text-green-600" />
                              }
                              <AlertDescription className={qrVerifyStatus.needs_review ? "text-amber-800" : "text-green-800"}>
                                {qrVerifyStatus.message}
                              </AlertDescription>
                            </Alert>
                          )}
                          {qrVerifyStatus.status === "already_used" && (
                            <Alert variant="destructive">
                              <AlertTriangle className="w-4 h-4" />
                              <AlertDescription>{qrVerifyStatus.message}</AlertDescription>
                            </Alert>
                          )}
                          {qrVerifyStatus.status === "expired" && (
                            <Alert variant="destructive">
                              <AlertTriangle className="w-4 h-4" />
                              <AlertDescription>{qrVerifyStatus.message}</AlertDescription>
                            </Alert>
                          )}
                          {qrVerifyStatus.status === "wrong_event" && (
                            <Alert variant="destructive">
                              <AlertTriangle className="w-4 h-4" />
                              <AlertDescription>{qrVerifyStatus.message}</AlertDescription>
                            </Alert>
                          )}
                          {(qrVerifyStatus.status === "invalid" || qrVerifyStatus.status === "unreadable_qr") && (
                            <Alert variant="destructive">
                              <AlertTriangle className="w-4 h-4" />
                              <AlertDescription>{qrVerifyStatus.message}</AlertDescription>
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
