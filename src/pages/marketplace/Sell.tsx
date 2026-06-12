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
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { z } from "zod";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { BackButton } from "@/components/BackButton";
import { AnimatedNumber } from "@/components/AnimatedNumber";
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
  Zap,
  ArrowRight,
  Ticket,
  Calendar,
  MapPin,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Event } from "@/integrations/supabase/types/events";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/contexts/I18nContext";
import { SEOHead } from "@/components/SEOHead";
import { decodeQRFromFile, extractTextFromFile, isQRTextValid } from "@/lib/qrValidator";
import { calcBreakdown } from "@/lib/fees";
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
  const { language } = useI18n();
  const dateLocale = language === "fr" ? "fr-FR" : "en-US";
  const { refetchListings } = useTicketListings();
  const [searchParams] = useSearchParams();
  const studioTicketParam = searchParams.get("studio_ticket");

  // Studio-resale fast path: when ?studio_ticket=<id> is present we know
  // the seller's QR is one we issued (JWT-signed event_ticket). No upload
  // step needed — we trust it, lock the event, and insert the listing
  // straight into `tickets` with studio_ticket_id set so the webhook can
  // later transfer the QR to the buyer.
  const [studioTicket, setStudioTicket] = useState<{
    id: string;
    event_id: string;
    qr_token: string;
    tierName: string | null;
    facePriceEuros: number | null;
    status: string;
  } | null>(null);
  const [studioLoading, setStudioLoading] = useState(false);

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

  // "Vos billets" — the real tickets the signed-in user owns for the selected
  // event. Surfaced first so the seller can resell one in a single click (no QR
  // upload). Only eligible tickets: owned by the user, valid, not scanned, and
  // not already listed for resale.
  type OwnedTicket = { id: string; tierName: string | null; facePriceEuros: number | null };
  const [myTickets, setMyTickets] = useState<OwnedTicket[]>([]);
  const [myTicketsLoading, setMyTicketsLoading] = useState(false);

  // "Vos événements" — distinct events the user owns eligible tickets for.
  // Shown in the search dropdown the moment it's focused (before typing) so the
  // seller can pick their own event in one click.
  const [myEvents, setMyEvents] = useState<{ event: Event; count: number }[]>([]);
  const [myEventsLoading, setMyEventsLoading] = useState(false);

  // Guard: redirect unauthenticated users
  useEffect(() => {
    if (!authLoading && !user) {
      navigate(`/auth?next=${encodeURIComponent("/marketplace/sell" + (studioTicketParam ? `?studio_ticket=${studioTicketParam}` : ""))}`);
    }
  }, [user, authLoading, navigate, studioTicketParam]);

  // Load the user's own eligible tickets for the selected event. Runs whenever
  // the chosen event changes (and never in the Studio fast-path, where the
  // ticket is already locked in via the ?studio_ticket= deep link).
  useEffect(() => {
    const evId = selectedEvent?.id;
    if (!user || studioTicket || !evId) {
      setMyTickets([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setMyTicketsLoading(true);
      try {
        const [{ data: owned, error: ownedErr }, { data: listed }] = await Promise.all([
          // Tickets the user genuinely owns for this event (RLS: buyer_id = me).
          supabase
            .from("event_tickets")
            .select("id, status, scanned_at, tier:event_tiers(name, price_cents)")
            .eq("buyer_id", user.id)
            .eq("event_id", evId)
            .eq("status", "valid")
            .is("scanned_at", null),
          // Listings the user already created — to exclude tickets already
          // listed for resale (available/reserved) or already sold.
          supabase
            .from("tickets")
            .select("studio_ticket_id, status")
            .eq("seller_id", user.id)
            .in("status", ["available", "reserved", "sold"])
            .not("studio_ticket_id", "is", null),
        ]);
        if (cancelled) return;
        if (ownedErr) {
          console.error("[sell] owned tickets fetch error:", ownedErr);
          setMyTickets([]);
          return;
        }
        const alreadyListed = new Set(
          ((listed ?? []) as unknown as { studio_ticket_id: string }[]).map((l) => l.studio_ticket_id),
        );
        const rows: OwnedTicket[] = ((owned ?? []) as unknown as Record<string, unknown>[])
          .filter((r) => !alreadyListed.has(String(r.id)))
          .map((r) => {
            const tier = (Array.isArray(r.tier) ? r.tier[0] : r.tier) as Record<string, unknown> | null;
            return {
              id: String(r.id),
              tierName: (tier?.name as string | null) ?? null,
              facePriceEuros: tier?.price_cents != null ? Number(tier.price_cents) / 100 : null,
            };
          });
        setMyTickets(rows);
      } catch (err) {
        if (!cancelled) {
          console.error("[sell] owned tickets unexpected error:", err);
          setMyTickets([]);
        }
      } finally {
        if (!cancelled) setMyTicketsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, studioTicket, selectedEvent]);

  // Load the distinct events the user owns eligible tickets for (for the
  // "Vos événements" quick-pick in the search dropdown). Runs once per user.
  useEffect(() => {
    if (!user || studioTicket) {
      setMyEvents([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setMyEventsLoading(true);
      try {
        const [{ data: owned, error: ownedErr }, { data: listed }] = await Promise.all([
          supabase
            .from("event_tickets")
            .select(
              "id, event_id, status, scanned_at, event:events(id, title, description, date, location, category, university, campus, image_url, is_active, base_price, created_at, updated_at)",
            )
            .eq("buyer_id", user.id)
            .eq("status", "valid")
            .is("scanned_at", null),
          supabase
            .from("tickets")
            .select("studio_ticket_id, status")
            .eq("seller_id", user.id)
            .in("status", ["available", "reserved", "sold"])
            .not("studio_ticket_id", "is", null),
        ]);
        if (cancelled) return;
        if (ownedErr) {
          console.error("[sell] my events fetch error:", ownedErr);
          setMyEvents([]);
          return;
        }
        const alreadyListed = new Set(
          ((listed ?? []) as unknown as { studio_ticket_id: string }[]).map((l) => l.studio_ticket_id),
        );
        const byEvent = new Map<string, { event: Event; count: number }>();
        for (const r of (owned ?? []) as unknown as Record<string, unknown>[]) {
          if (alreadyListed.has(String(r.id))) continue;
          const ev = (Array.isArray(r.event) ? r.event[0] : r.event) as unknown as Event | null;
          if (!ev?.id) continue;
          const existing = byEvent.get(ev.id);
          if (existing) existing.count += 1;
          else byEvent.set(ev.id, { event: ev, count: 1 });
        }
        setMyEvents(Array.from(byEvent.values()));
      } catch (err) {
        if (!cancelled) {
          console.error("[sell] my events unexpected error:", err);
          setMyEvents([]);
        }
      } finally {
        if (!cancelled) setMyEventsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, studioTicket]);

  // Studio-resale path: fetch the ticket, validate ownership, prefill state.
  useEffect(() => {
    if (!user || !studioTicketParam) return;
    let cancelled = false;
    (async () => {
      setStudioLoading(true);
      try {
        const { data: tk, error } = await supabase
          .from("event_tickets")
          .select(`id, event_id, qr_token, status, buyer_id,
                   tier:event_tiers(name, price_cents),
                   event:events(id, title, description, date, location, category, university, campus, image_url, is_active, base_price, created_at, updated_at)`)
          .eq("id", studioTicketParam)
          .maybeSingle();
        if (cancelled) return;
        if (error || !tk) {
          toast.error("This ticket could not be found.");
          navigate("/my-tickets");
          return;
        }
        if (tk.buyer_id !== user.id) {
          toast.error("You can only resell your own tickets.");
          navigate("/my-tickets");
          return;
        }
        if (tk.status !== "valid") {
          toast.error("This ticket can no longer be resold (already used, transferred or refunded).");
          navigate("/my-tickets");
          return;
        }
        const { data: existing } = await supabase
          .from("tickets")
          .select("id, status")
          .eq("studio_ticket_id", tk.id)
          .in("status", ["available", "reserved", "sold"])
          .maybeSingle();
        if (existing) {
          if (existing.status === "sold") {
            toast.error("This ticket has already been resold.");
          } else {
            toast.info("You already have an active resale listing for this ticket.");
          }
          navigate("/settings/listings");
          return;
        }
        const ev = (Array.isArray(tk.event) ? tk.event[0] : tk.event) as Event | null;
        if (!ev) {
          toast.error("Linked event not found.");
          navigate("/my-tickets");
          return;
        }
        const tier = (Array.isArray(tk.tier) ? tk.tier[0] : tk.tier) as
          | { name?: string; price_cents?: number }
          | null;
        const facePriceEuros =
          tier?.price_cents != null
            ? Number(tier.price_cents) / 100
            : ev.base_price != null
              ? Number(ev.base_price)
              : null;
        setStudioTicket({
          id: tk.id,
          event_id: tk.event_id,
          qr_token: tk.qr_token,
          tierName: tier?.name ?? null,
          facePriceEuros,
          status: tk.status,
        });
        setSelectedEvent(ev);
        setEventSearch(ev.title);
        setFormData((prev) => ({
          ...prev,
          eventId: ev.id,
          quantity: "1",
          sellingPrice: facePriceEuros != null ? String(facePriceEuros) : prev.sellingPrice,
        }));
        setQrText(tk.qr_token);
      } catch (err) {
        if (!cancelled) {
          toast.error(err instanceof Error ? err.message : "Failed to load ticket.");
          navigate("/my-tickets");
        }
      } finally {
        if (!cancelled) setStudioLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user, studioTicketParam, navigate]);

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
      toast.success("Event created. The details will be completed by an administrator.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error creating the event.");
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
    try {
      // Run QR decode and text extraction in parallel
      const [decoded, text] = await Promise.all([
        decodeQRFromFile(file),
        extractTextFromFile(file),
      ]);

      if (text) {
        setExtractedText(text);
      }

      if (decoded) {
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

    // Past-event guard — mirrors the server's 6h-grace expiry rule so a ticket
    // for an event that already happened is rejected with a clear reason.
    const evStartMs = selectedEvent.date ? new Date(selectedEvent.date).getTime() : NaN;
    if (!Number.isNaN(evStartMs)) {
      const evEnds = (selectedEvent as { ends_at?: string | null }).ends_at;
      const evEndsMs = evEnds ? new Date(evEnds).getTime() : evStartMs + 8 * 60 * 60 * 1000;
      if (Date.now() > evEndsMs + 6 * 60 * 60 * 1000) {
        toast.error("This event has already taken place — tickets can't be resold.");
        return;
      }
    }

    const price = parseFloat(formData.sellingPrice);
    if (!formData.sellingPrice || !isFinite(price) || price <= 0) {
      toast.error("Please enter a valid selling price");
      return;
    }

    if (!isQRTextValid(qrText)) {
      toast.error("QR not detected — please upload a photo or PDF of your ticket.");
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

    // Studio-resale fast path: insert directly into `tickets`. The QR is
    // already trusted (signed by our backend) so no admin review, no QR
    // upload, no submit-listing roundtrip.
    if (studioTicket) {
      try {
        const { data: ticket, error } = await supabase
          .from("tickets")
          .insert({
            seller_id: user.id,
            event_id: studioTicket.event_id,
            selling_price: price,
            quantity: parseInt(formData.quantity, 10) || 1,
            notes: formData.notes || null,
            status: "available",
            qr_hash: `studio:${studioTicket.id}`,
            qr_verified: true,
            verification_status: "verified",
            needs_review: false,
            studio_ticket_id: studioTicket.id,
          })
          .select("id")
          .single();
        if (error) {
          toast.error(error.message || "Could not list your ticket.");
          return;
        }
        setCreatedListingId(ticket.id);
        refetchListings();
        toast.success("Listed instantly. Your QR stays valid until it sells.");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Unexpected error.");
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

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

      // Encode ticket file as base64 for admin email attachment (max 4 MB)
      let fileBase64: string | undefined;
      let fileName: string | undefined;
      let fileMimeType: string | undefined;
      if (qrImageFile && qrImageFile.size <= 4 * 1024 * 1024) {
        const ab = await qrImageFile.arrayBuffer();
        const bytes = new Uint8Array(ab);
        let binary = "";
        for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
        fileBase64 = btoa(binary);
        fileName = qrImageFile.name;
        fileMimeType = qrImageFile.type;
      }

      const payload = {
        eventId: formData.eventId,
        sellingPrice: price,
        quantity: parseInt(formData.quantity, 10),
        notes: formData.notes || undefined,
        qrText,
        extractedText: extractedText || undefined,
        fileBase64,
        fileName,
        fileMimeType,
      };
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
        toast.success("Ticket submitted — pending admin approval.");
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
          <div className="container mx-auto px-4 max-w-md text-center">
            {/* Animated check — the moment lands with motion, not a static badge. */}
            <div className="relative w-20 h-20 mx-auto mb-6 animate-in zoom-in-50 duration-500 ease-out">
              <div className="absolute inset-0 rounded-full bg-emerald-100 animate-pulse" />
              <div className="absolute inset-2 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-lg">
                <CheckCircle2 className="w-9 h-9" strokeWidth={2.5} />
              </div>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold mb-2">
              {studioTicket ? "Your ticket is now listed!" : "Ticket submitted for review!"}
            </h1>
            <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
              {studioTicket
                ? "Your ticket has been listed for sale. We'll invalidate your QR and issue a new one in the buyer's name the moment it sells."
                : "Your ticket is pending admin approval. It will appear in the marketplace once verified."}
            </p>

            {/* Recap card — turns a plain message into a real confirmation. */}
            {selectedEvent && (
              <div className="rounded-2xl bg-card border border-border shadow-sm p-5 mb-6 text-left animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold truncate">{selectedEvent.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {new Date(selectedEvent.date).toLocaleDateString(dateLocale, { day: "numeric", month: "long", year: "numeric" })}
                      {selectedEvent.location ? ` · ${selectedEvent.location}` : ""}
                    </p>
                  </div>
                  {parseFloat(formData.sellingPrice) > 0 && (
                    <div className="text-right shrink-0">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Listed at</p>
                      <p className="text-lg font-bold text-primary tabular-nums">
                        €{parseFloat(formData.sellingPrice).toFixed(2)}
                      </p>
                    </div>
                  )}
                </div>
                {studioTicket && (
                  <div className="mt-3 pt-3 border-t border-border inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Live on the marketplace
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button variant="hero" asChild className="h-11">
                <Link to="/settings/listings">
                  View my listings
                  <ArrowRight className="w-4 h-4 ml-1" />
                </Link>
              </Button>
              <Button variant="outline" asChild className="h-11">
                <Link to="/marketplace/buy">
                  <ExternalLink className="w-4 h-4 mr-2" />
                  View marketplace
                </Link>
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

  // Block listing for events that have already taken place (mirrors the
  // server's 6h-grace expiry rule) so the seller gets instant, clear feedback
  // instead of a confusing QR error after upload.
  const eventIsPast = (() => {
    if (!selectedEvent?.date) return false;
    const startMs = new Date(selectedEvent.date).getTime();
    if (Number.isNaN(startMs)) return false;
    const endsAt = (selectedEvent as { ends_at?: string | null }).ends_at;
    const endsAtMs = endsAt ? new Date(endsAt).getTime() : startMs + 8 * 60 * 60 * 1000;
    return Date.now() > endsAtMs + 6 * 60 * 60 * 1000;
  })();

  const canSubmit =
    !!selectedEvent &&
    !eventIsPast &&
    !!formData.sellingPrice &&
    isQRTextValid(qrText) &&
    !isSubmitting;

  // Compute progress for the stepper. For Studio resales the event + QR are
  // already verified by definition, so the user only has to do "price" → "publish".
  const hasEvent = !!selectedEvent;
  const hasVerifiedQr =
    !!studioTicket || (qrVerifyStatus?.status === "valid");
  const hasPriceSet =
    parseFloat(formData.sellingPrice) > 0 &&
    isFinite(parseFloat(formData.sellingPrice));
  const steps = studioTicket
    ? [
        { label: "Set price", done: hasPriceSet },
        { label: "Publish", done: false },
      ]
    : [
        { label: "Event", done: hasEvent },
        { label: "Verify QR", done: hasVerifiedQr },
        { label: "Price", done: hasPriceSet },
        { label: "Publish", done: false },
      ];
  // First not-yet-done step = where the user currently is. Used by both the
  // desktop hero stepper and the mobile bottom process bar.
  const firstUndone = steps.findIndex((s) => !s.done);
  const activeStep = firstUndone === -1 ? steps.length - 1 : firstUndone;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SEOHead titleKey="marketplace.sell.title" descriptionKey="marketplace.sell.description" />
      <Header />

      {/* ===== Branded hero with step indicator =====
          Gradient strip on Ticket Safe blue. Title on the left, stepper on
          the right (or below on mobile). Each step has a numbered chip; the
          chip lights up brand-blue when its step is done. Gives the user a
          clear sense of "where am I in the process" without being childish. */}
      <section
        className="relative text-white overflow-hidden"
        style={{ background: "linear-gradient(135deg, hsl(220 100% 30%), hsl(210 100% 45%))" }}
      >
        <div
          className="absolute inset-0 opacity-30 pointer-events-none"
          style={{
            backgroundImage:
              "radial-gradient(circle at 15% 20%, rgba(255,255,255,.30), transparent 45%), radial-gradient(circle at 85% 80%, rgba(255,255,255,.12), transparent 50%)",
          }}
        />
        <div className="relative container mx-auto px-4 max-w-4xl pt-8 pb-10 md:pt-12 md:pb-14">
          <div className="mb-5">
            <BackButton />
          </div>
          <div className="text-[10px] md:text-xs font-bold uppercase tracking-[0.2em] text-white/80 mb-2">
            {studioTicket ? "Studio resale · instant" : "List a ticket"}
          </div>
          <h1 className="text-3xl md:text-5xl font-bold leading-tight tracking-tight mb-3">
            {studioTicket ? "Resell your ticket" : "Sell a ticket"}
          </h1>
          <p className="text-sm md:text-base text-white/85 max-w-xl mb-6 md:mb-8">
            {studioTicket
              ? "This Studio ticket is already verified — just set a price and you're listed."
              : "Verify your ticket with its QR code and list it in under a minute."}
          </p>

          {/* Stepper — desktop only; on phones the process lives in the sticky
              bottom bar so the interface fits the screen. */}
          <div className="hidden lg:flex items-center gap-2 md:gap-3 overflow-x-auto -mx-1 px-1 pb-1">
            {steps.map((s, i) => {
              const isActive = i === activeStep;
              const isDone = s.done;
              return (
                <div key={s.label} className="flex items-center gap-2 md:gap-3 flex-shrink-0">
                  <div
                    className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full ring-1 transition-colors ${
                      isDone
                        ? "bg-white text-primary ring-white"
                        : isActive
                        ? "bg-white/20 text-white ring-white/40 backdrop-blur"
                        : "bg-white/5 text-white/65 ring-white/15"
                    }`}
                  >
                    <span className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-bold bg-white/30">
                      {isDone ? "✓" : i + 1}
                    </span>
                    <span className="text-[11px] md:text-xs font-bold uppercase tracking-wider">
                      {s.label}
                    </span>
                  </div>
                  {i < steps.length - 1 && (
                    <span className="w-3 md:w-5 h-px bg-white/30" aria-hidden />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <main className="py-8 md:py-10 flex-1 pb-32 lg:pb-10">
        <div className="container mx-auto px-4 max-w-4xl">

          {studioLoading && (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* ---- Main form ---- */}
            <div className="lg:col-span-2 space-y-6">
              {studioTicket && selectedEvent && (
                <Card className="overflow-hidden border-primary/20 shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-300">
                  {/* Brand header strip — turns the form into a real ticket. */}
                  <div
                    className="px-5 py-3 flex items-center gap-2 text-white"
                    style={{ background: "linear-gradient(135deg, hsl(220 100% 30%), hsl(210 100% 45%))" }}
                  >
                    <Zap className="w-4 h-4" />
                    <span className="text-[11px] font-bold uppercase tracking-wider">
                      Instant resale · verified ticket
                    </span>
                    <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-bold bg-white/20 px-2 py-0.5 rounded-full">
                      <CheckCircle2 className="w-3 h-3" />
                      {studioTicket.status === "valid" ? "Valid" : studioTicket.status}
                    </span>
                  </div>
                  <CardContent className="p-5 space-y-4">
                    <div>
                      <h2 className="text-lg font-bold leading-tight">{selectedEvent.title}</h2>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {selectedEvent.university}
                        {selectedEvent.campus ? ` · ${selectedEvent.campus}` : ""}
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                          <Calendar className="w-4 h-4 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Date</p>
                          <p className="text-sm font-medium truncate">
                            {new Date(selectedEvent.date).toLocaleDateString(dateLocale, { weekday: "short", day: "numeric", month: "long" })}
                          </p>
                        </div>
                      </div>

                      {selectedEvent.location && (
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                            <MapPin className="w-4 h-4 text-primary" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Location</p>
                            <p className="text-sm font-medium truncate">{selectedEvent.location}</p>
                          </div>
                        </div>
                      )}

                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                          <Ticket className="w-4 h-4 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Ticket type</p>
                          <p className="text-sm font-medium truncate">{studioTicket.tierName ?? "Standard"}</p>
                        </div>
                      </div>

                      {studioTicket.facePriceEuros != null && (
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 text-primary font-bold text-sm">
                            €
                          </div>
                          <div className="min-w-0">
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Paid originally</p>
                            <p className="text-sm font-medium truncate">€{studioTicket.facePriceEuros.toFixed(2)}</p>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/40 rounded-lg p-3">
                      <ShieldCheck className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />
                      <span>
                        Your QR stays valid until it sells. The moment payment goes through, we
                        invalidate yours and issue a fresh one in the buyer's name — nothing else to do.
                      </span>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Event selection — hidden in Studio-resale fast path */}
              {!studioTicket && (
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
                          placeholder="Gala ESCP, BDE party, Intercampus…"
                          value={selectedEvent ? selectedEvent.title : eventSearch}
                          onChange={(e) => {
                            if (selectedEvent) {
                              setSelectedEvent(null);
                              setFormData((prev) => ({ ...prev, eventId: "", sellingPrice: "" }));
                            }
                            setEventSearch(e.target.value);
                            setShowSuggestions(true);
                          }}
                          onFocus={() => setShowSuggestions(true)}
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
                          {eventSearch.length < 2 ? (
                            myEventsLoading ? (
                              <div className="px-4 py-3 flex items-center gap-2 text-sm text-muted-foreground">
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Loading your events…
                              </div>
                            ) : myEvents.length > 0 ? (
                              <>
                                <div className="px-3 pt-2.5 pb-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                                  Your events
                                </div>
                                {myEvents.map(({ event: ev, count }) => (
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
                                    <p className="font-medium text-sm leading-none mb-1">{ev.title}</p>
                                    <p className="text-xs text-muted-foreground">
                                      {ev.date &&
                                        new Date(ev.date).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
                                      {ev.location && ` · ${ev.location}`}
                                      {` · ${count} ticket${count > 1 ? "s" : ""}`}
                                    </p>
                                  </button>
                                ))}
                                <div className="px-3 py-2 text-[11px] text-muted-foreground border-t">
                                  Or type to search another event…
                                </div>
                              </>
                            ) : (
                              <div className="px-4 py-3 text-sm text-muted-foreground text-center">
                                Type your event name to search.
                              </div>
                            )
                          ) : searchResults.length > 0 ? (
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
                                No results for &quot;{eventSearch}&quot;
                              </p>
                              {!showStubForm ? (
                                <button
                                  type="button"
                                  className="w-full text-left px-3 py-2 rounded border border-dashed border-primary/40 text-sm text-primary hover:bg-primary/5 transition-colors flex items-center gap-2"
                                  onClick={() => setShowStubForm(true)}
                                >
                                  <CalendarPlus className="w-4 h-4 shrink-0" />
                                  My event isn&apos;t listed — create it
                                </button>
                              ) : (
                                <div className="space-y-3 p-3 rounded border bg-muted/30">
                                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                    Create an event
                                  </p>
                                  <Input
                                    value={eventSearch}
                                    onChange={(e) => setEventSearch(e.target.value)}
                                    placeholder="Event name"
                                    className="text-sm"
                                  />
                                  <div>
                                    <Label htmlFor="stubDate" className="text-xs text-muted-foreground">
                                      Event date
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
                                        <><Loader2 className="w-3 h-3 mr-1 animate-spin" />Creating…</>
                                      ) : "Confirm"}
                                    </Button>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      onClick={() => setShowStubForm(false)}
                                    >
                                      Cancel
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
                      Type at least 2 characters to see suggestions.
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
                            {new Date(selectedEvent.date).toLocaleDateString(dateLocale, {
                              weekday: "long",
                              year: "numeric",
                              month: "long",
                              day: "numeric",
                            })}
                          </p>
                        </AlertDescription>
                      </Alert>
                      {eventIsPast && (
                        <Alert variant="destructive" className="mt-3">
                          <AlertTriangle className="w-4 h-4" />
                          <AlertDescription>
                            <span className="font-medium">This event has already taken place.</span>{" "}
                            Tickets for past events can't be resold on Ticket Safe.
                          </AlertDescription>
                        </Alert>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
              )}

              {/* ===== Vos billets — real tickets the user owns for this event =====
                  Shown first, right after the event is picked, so the seller can
                  resell a genuine ticket in one click. Reuses the existing Studio
                  fast-path (?studio_ticket=) — no new submit/payment/QR logic. */}
              {!studioTicket && selectedEvent && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Ticket className="w-5 h-5" />
                    Your tickets
                  </CardTitle>
                  <CardDescription>
                    Your tickets for this event. Click to resell one in seconds. For a ticket
                    bought elsewhere, use the option below.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {myTicketsLoading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Loading your tickets…
                    </div>
                  ) : myTickets.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground text-center">
                      You have no resellable tickets for this event.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {myTickets.map((t) => (
                        <div
                          key={t.id}
                          className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 hover:border-primary/40 transition-colors"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate flex items-center gap-1.5">
                              <ShieldCheck className="w-4 h-4 text-green-600 shrink-0" />
                              {t.tierName ?? "Ticket Safe verified ticket"}
                            </p>
                            {t.facePriceEuros != null && (
                              <p className="text-xs text-muted-foreground mt-0.5">
                                Original price €{t.facePriceEuros.toFixed(2)}
                              </p>
                            )}
                          </div>
                          <Button
                            size="sm"
                            variant="hero"
                            className="shrink-0"
                            onClick={() => navigate(`/marketplace/sell?studio_ticket=${t.id}`)}
                          >
                            Resell this ticket
                            <ArrowRight className="w-4 h-4 ml-1" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
              )}

              {/* QR Code — skipped for trusted Studio resales */}
              {!studioTicket && (
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
                  <div>
                      <Label>Upload your ticket</Label>
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
                            <Alert className="bg-primary/10 border-primary/30">
                              <CheckCircle2 className="w-4 h-4 text-primary" />
                              <AlertDescription className="text-primary font-medium">
                                Ticket accepted
                                {qrVerifyStatus.needs_review && (
                                  <span className="font-normal ml-1 text-primary/80">
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
                            <Alert className="bg-muted border-border">
                              <AlertTriangle className="w-4 h-4 text-foreground/70" />
                              <AlertDescription className="text-foreground/80">
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
              )}

              {/* Pricing */}
              <Card>
                <CardHeader>
                  <CardTitle>Set your price</CardTitle>
                  <CardDescription>Choose how much you want to sell your ticket for.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className={studioTicket ? "" : "grid grid-cols-1 md:grid-cols-2 gap-4"}>
                    <div>
                      <Label htmlFor="sellingPrice">
                        Resale price
                        <span className="text-destructive ml-1">*</span>
                      </Label>
                      <div className="relative mt-1.5">
                        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-lg font-semibold text-muted-foreground pointer-events-none">
                          €
                        </span>
                        <Input
                          id="sellingPrice"
                          type="number"
                          inputMode="decimal"
                          step="0.01"
                          min="0"
                          placeholder="0.00"
                          value={formData.sellingPrice}
                          onChange={(e) =>
                            setFormData({ ...formData, sellingPrice: e.target.value })
                          }
                          disabled={!selectedEvent}
                          className="pl-8 h-12 text-lg font-semibold"
                        />
                      </div>
                      <p className="text-xs text-muted-foreground mt-1.5">
                        Set a fair price to increase your chances of reselling.
                        {studioTicket?.facePriceEuros != null && (
                          <>
                            {" "}Originally paid{" "}
                            <span className="font-medium text-foreground">
                              €{studioTicket.facePriceEuros.toFixed(2)}
                            </span>
                            .
                          </>
                        )}
                      </p>
                    </div>

                    {!studioTicket && (
                      <div>
                        <Label htmlFor="quantity">Number of tickets</Label>
                        <Select
                          value={formData.quantity}
                          onValueChange={(v) => setFormData({ ...formData, quantity: v })}
                        >
                          <SelectTrigger className="mt-1.5">
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
                    )}
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
            <div className="space-y-5 lg:sticky lg:top-24 lg:self-start">
              {/* ===== Earnings card — the visual hero of the sidebar =====
                  "You receive €X" is the answer to the only question the
                  seller cares about. Big tabular-nums number in brand blue,
                  the breakdown lives below it as a quiet ledger. */}
              {(() => {
                const price = parseFloat(formData.sellingPrice);
                const qty = parseInt(formData.quantity, 10) || 1;
                const hasPrice = isFinite(price) && price > 0;
                const bd = hasPrice ? calcBreakdown(price, qty) : null;
                return (
                  <div className="rounded-2xl bg-card border border-border p-5 md:p-6 shadow-sm">
                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground mb-2">
                      You receive
                    </div>
                    <div className="text-3xl md:text-4xl font-semibold tracking-tight leading-none text-primary mb-4">
                      {bd ? (
                        <AnimatedNumber value={bd.sellerPayoutEuros} prefix="€" />
                      ) : (
                        <span className="tabular-nums">€—</span>
                      )}
                    </div>

                    <div className="space-y-1.5 text-sm pt-4 border-t border-border">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">
                          Listing price{qty > 1 ? ` × ${qty}` : ""}
                        </span>
                        <span className="tabular-nums">
                          {bd ? `€${bd.listPriceEuros.toFixed(2)}` : "—"}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">
                          Platform commission <span className="text-muted-foreground/70">(5%)</span>
                        </span>
                        <span className="tabular-nums text-muted-foreground">
                          {bd ? `−€${bd.sellerCommissionEuros.toFixed(2)}` : "—"}
                        </span>
                      </div>
                    </div>

                    <Button
                      variant="hero"
                      size="lg"
                      className="w-full mt-5 h-12 text-base font-semibold"
                      disabled={!canSubmit}
                      onClick={handleSubmit}
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Publishing your listing…
                        </>
                      ) : (
                        <>
                          Publish listing
                          <ArrowRight className="w-4 h-4 ml-1" />
                        </>
                      )}
                    </Button>

                    <p className="text-[11px] text-center text-muted-foreground mt-3">
                      By listing, you agree to our{" "}
                      <Link to="/privacy" className="underline hover:text-foreground">
                        terms of service
                      </Link>
                      .
                    </p>
                  </div>
                );
              })()}

              {/* ===== Guidelines — compact, brand-blue only ===== */}
              <div className="rounded-2xl bg-card border border-border p-5 md:p-6 shadow-sm">
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground mb-3">
                  How it works
                </div>
                <div className="space-y-2.5 text-sm">
                  {[
                    "Real QR from your original ticket",
                    "Each QR can only be listed once",
                    "Verified students only — no scalpers",
                    "Escrow payment, instant when sold",
                    "Set any price you want — fair is faster",
                  ].map((text) => (
                    <div key={text} className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                      <span className="text-foreground/85">{text}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* ===== Sticky mobile process bar =====
          On phones the whole "post your ticket" process lives at the bottom of
          the screen: a compact stepper that's always visible while filling the
          form, and that turns into the Publish CTA once a price is set. Keeps
          the interface perfectly fit for mobile (no scrolling back up). */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-background/95 backdrop-blur-md shadow-[0_-4px_24px_rgba(0,0,0,0.08)] px-4 pt-2.5 pb-3">
        <div className="container mx-auto max-w-4xl">
          {/* Compact progress: numbered chip per step + connecting bar */}
          <div className="flex items-center gap-1.5 mb-2.5">
            {steps.map((s, i) => (
              <div key={s.label} className="flex items-center gap-1.5 flex-1 last:flex-none">
                <span
                  className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold flex-shrink-0 transition-colors ${
                    s.done
                      ? "bg-primary text-white"
                      : i === activeStep
                      ? "bg-primary/15 text-primary ring-1 ring-primary/40"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {s.done ? "✓" : i + 1}
                </span>
                {i < steps.length - 1 && (
                  <span className={`flex-1 h-0.5 rounded ${s.done ? "bg-primary" : "bg-muted"}`} aria-hidden />
                )}
              </div>
            ))}
          </div>

          {hasPriceSet && canSubmit ? (
            <div className="flex items-center gap-3 animate-in fade-in duration-300">
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-medium text-muted-foreground">You receive</div>
                {(() => {
                  const price = parseFloat(formData.sellingPrice);
                  const qty = parseInt(formData.quantity, 10) || 1;
                  const bd = calcBreakdown(price, qty);
                  return (
                    <div className="text-lg font-semibold tabular-nums tracking-tight text-primary leading-tight">
                      €{bd.sellerPayoutEuros.toFixed(2)}
                    </div>
                  );
                })()}
              </div>
              <Button
                variant="hero"
                size="lg"
                className="flex-shrink-0 h-11 px-5 text-sm font-semibold"
                disabled={!canSubmit || isSubmitting}
                onClick={handleSubmit}
              >
                {isSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    Publish
                    <ArrowRight className="w-4 h-4 ml-1" />
                  </>
                )}
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm min-w-0">
                <span className="text-muted-foreground">
                  Step {activeStep + 1} of {steps.length} ·{" "}
                </span>
                <span className="font-semibold text-foreground">{steps[activeStep]?.label}</span>
              </div>
              <span className="text-[11px] font-medium text-muted-foreground flex-shrink-0">
                {steps.filter((s) => s.done).length}/{steps.length} done
              </span>
            </div>
          )}
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default Sell;
