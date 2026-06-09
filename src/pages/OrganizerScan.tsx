/**
 * OrganizerScan — ticket validation page for event organizers.
 *
 * Supports three ticket types automatically:
 *  - Platform JWT tickets  → validated via validate-scan (secure_tickets table)
 *  - Studio primary tickets → validated via validate-event-ticket (event_tickets table, hex qr_token)
 *  - Marketplace tickets   → validated via check-ticket-entry (tickets table, qr_hash)
 *
 * Input methods: camera QR scan, image upload, or manual paste.
 */

import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Shield,
  Camera,
  Scan,
  Loader2,
  Clock,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { SEOHead } from "@/components/SEOHead";
import { QRScanner } from "@/components/QRScanner";
import { decodeQRFromFile } from "@/lib/qrValidator";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Event {
  id: string;
  title: string;
  date: string;
  location: string | null;
}

type ScanResultCode =
  | "VALID"
  | "INVALID"
  | "FORGED"
  | "WRONG_EVENT"
  | "NOT_PURCHASED"
  | "ALREADY_USED"
  | "REVOKED"
  | "FORBIDDEN"
  | "EXPIRED"
  | "EVENT_NOT_STARTED"
  | "EVENT_ENDED"
  | "SUSPECT_FRAUD"
  | "RATE_LIMITED";

interface ScanResult {
  valid: boolean;
  result: ScanResultCode;
  message: string;
  buyer_info?: {
    full_name: string;
    email: string;
    campus: string | null;
    university: string;
  };
  event_info?: {
    title: string;
    date: string;
    location: string | null;
  };
  ticket_info?: {
    ticket_number?: string;
    event_title?: string;
    selling_price?: number;
    quantity?: number;
    qr_verified?: boolean;
    scan_count?: number;
    owner_initials?: string;
    seat_info?: string | null;
    // Studio fields:
    actual_event_title?: string;
    actual_event_date?: string;
    expected_event_title?: string;
    scanned_at?: string;
    holder_name?: string | null;
    holder_email?: string | null;
    tier_name?: string;
  };
  risk_level?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  fraud_signals?: string[];
  scanned_at: string;
}

/**
 * Visual semantics for every result code. A scanner at the door is making
 * a snap decision — make rejections impossible to misread.
 */
const RESULT_SEMANTICS: Record<ScanResultCode, {
  emphasis: "ok" | "warn" | "danger" | "danger-loud";
  label: string;
  guidance: string;
}> = {
  VALID:             { emphasis: "ok",          label: "Entry granted",      guidance: "Welcome — let them in." },
  ALREADY_USED:      { emphasis: "danger",      label: "Already scanned",     guidance: "This ticket was used. Deny entry." },
  WRONG_EVENT:       { emphasis: "warn",        label: "Wrong event",         guidance: "Different event — they may be at the wrong door." },
  REVOKED:           { emphasis: "danger",      label: "Refunded / cancelled",guidance: "Buyer was refunded. Deny entry." },
  FORGED:            { emphasis: "danger-loud", label: "Fake or unknown",     guidance: "This QR is NOT a Ticket Safe ticket. Refuse." },
  INVALID:           { emphasis: "danger",      label: "Invalid",             guidance: "Could not verify. Refuse." },
  NOT_PURCHASED:     { emphasis: "danger",      label: "Not purchased",       guidance: "No purchase on record. Refuse." },
  EXPIRED:           { emphasis: "danger",      label: "Expired",             guidance: "Token has expired." },
  EVENT_NOT_STARTED: { emphasis: "warn",        label: "Too early",           guidance: "Doors are not open yet." },
  EVENT_ENDED:       { emphasis: "warn",        label: "Event ended",         guidance: "Event already finished." },
  FORBIDDEN:         { emphasis: "danger",      label: "Not your event",      guidance: "You can't scan tickets for this event." },
  SUSPECT_FRAUD:     { emphasis: "danger-loud", label: "Suspected fraud",     guidance: "Stop the scan, call security." },
  RATE_LIMITED:      { emphasis: "warn",        label: "Too many scans",      guidance: "Wait a second and retry." },
};

type InputMode = "camera" | "manual";

// JWT pattern: three base64url segments separated by dots
const JWT_RE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

// Studio primary-sale tokens: 40-character lowercase hex (generated server-side
// in stripe-webhook as `crypto.randomUUID().replace(/-/g, "") + …slice(0,8)`).
const STUDIO_TOKEN_RE = /^[a-f0-9]{32,128}$/;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const OrganizerScan = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const eventIdFromUrl = searchParams.get("event_id");
  const { user, loading: authLoading } = useAuth();

  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>(eventIdFromUrl ?? "");
  const [inputMode, setInputMode] = useState<InputMode>("camera");
  const [manualToken, setManualToken] = useState("");
  const [isValidating, setIsValidating] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [scanHistory, setScanHistory] = useState<ScanResult[]>([]);
  const [cameraActive, setCameraActive] = useState(true);

  // Stable device ID for rate-limit tracking (JWT path)
  const [deviceId] = useState(() => {
    let id = localStorage.getItem("scanner_device_id");
    if (!id) {
      id = `device-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      localStorage.setItem("scanner_device_id", id);
    }
    return id;
  });

  // Redirect if not logged in
  useEffect(() => {
    if (!authLoading && !user) navigate("/auth?next=/organizer/scan");
  }, [user, authLoading, navigate]);

  // Load upcoming events the user can scan tickets for:
  //  - Studio events they organize (events.organizer_id → organizer_profiles.user_id)
  //  - Plus any active resale-catalog event so the resale flow keeps working.
  useEffect(() => {
    if (!user) return;
    (async () => {
      const cutoffISO = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();

      // Studio events owned by the current user (their organizer profile)
      const { data: studioOrg } = await supabase
        .from("organizer_profiles")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      const studioPromise = studioOrg?.id
        ? supabase
            .from("events")
            .select("id, title, date, location")
            .eq("organizer_id", studioOrg.id)
            .in("status", ["published", "sold_out"])
            .gte("date", cutoffISO)
            .order("date", { ascending: true })
        : Promise.resolve({ data: [] as Event[] });

      // Catalog / resale events (legacy path)
      const catalogPromise = supabase
        .from("events")
        .select("id, title, date, location")
        .eq("is_active", true)
        .gte("date", cutoffISO)
        .order("date", { ascending: true });

      const [studioRes, catalogRes] = await Promise.all([studioPromise, catalogPromise]);
      const merged: Event[] = [
        ...((studioRes.data as Event[]) ?? []),
        ...((catalogRes.data as Event[]) ?? []),
      ];
      // Dedup by id, preserve first occurrence (Studio wins for organizers)
      const seen = new Set<string>();
      const deduped = merged.filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true)));

      setEvents(deduped);
      // Respect the event_id from the URL if it's a valid choice;
      // otherwise default to the soonest upcoming event.
      const urlMatch = eventIdFromUrl && deduped.find((e) => e.id === eventIdFromUrl);
      if (urlMatch) {
        setSelectedEventId(urlMatch.id);
      } else if (deduped.length > 0 && !selectedEventId) {
        setSelectedEventId(deduped[0].id);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, eventIdFromUrl]);

  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------

  const validate = async (qrText: string) => {
    if (!selectedEventId) {
      toast.error("Please select an event first");
      return;
    }
    if (!qrText.trim()) {
      toast.error("QR code is empty");
      return;
    }

    setIsValidating(true);
    setScanResult(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const cleaned = qrText.trim();
      const isJWT = JWT_RE.test(cleaned);
      const isStudio = !isJWT && STUDIO_TOKEN_RE.test(cleaned);

      let result: ScanResult;

      if (isStudio) {
        // ── Studio primary-sale QR → validate-event-ticket ──────────────────
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/validate-event-ticket`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.access_token}`,
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            },
            body: JSON.stringify({
              qr_token: cleaned,
              event_id: selectedEventId,
            }),
          }
        );
        const data = await res.json();
        const code = (data.result ?? "INVALID") as ScanResultCode;
        result = {
          valid: code === "VALID",
          result: code,
          message: data.message ?? "Unknown error",
          ticket_info: data.ticket_info
            ? {
                event_title: data.ticket_info.event_title,
                tier_name: data.ticket_info.tier_name,
                actual_event_title: data.ticket_info.actual_event_title,
                actual_event_date: data.ticket_info.actual_event_date,
                expected_event_title: data.ticket_info.expected_event_title,
                scanned_at: data.ticket_info.scanned_at,
                holder_name: data.ticket_info.holder_name,
                holder_email: data.ticket_info.holder_email,
              }
            : undefined,
          scanned_at: new Date().toISOString(),
        };
      } else if (isJWT) {
        // ── Platform JWT → validate-scan ────────────────────────────────────
        let location: { latitude?: number; longitude?: number } | undefined;
        if (navigator.geolocation) {
          await new Promise<void>((resolve) => {
            navigator.geolocation.getCurrentPosition(
              (p) => { location = { latitude: p.coords.latitude, longitude: p.coords.longitude }; resolve(); },
              () => resolve()
            );
          });
        }

        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/validate-scan`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.access_token}`,
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            },
            body: JSON.stringify({
              ticket_token: qrText.trim(),
              event_id: selectedEventId,
              scanner_device_id: deviceId,
              scanner_location: location,
              timestamp: new Date().toISOString(),
            }),
          }
        );
        const data = await res.json();
        result = {
          valid: data.valid ?? false,
          result: data.result ?? "INVALID",
          message: data.message ?? "Unknown error",
          ticket_info: data.ticket_info,
          risk_level: data.risk_level,
          fraud_signals: data.fraud_signals,
          scanned_at: new Date().toISOString(),
        };
      } else {
        // ── Marketplace QR → check-ticket-entry ──────────────────────────────
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/check-ticket-entry`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.access_token}`,
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            },
            body: JSON.stringify({
              qrText: qrText.trim(),
              eventId: selectedEventId,
            }),
          }
        );
        const data = await res.json();
        result = {
          valid: data.valid ?? false,
          result: data.result ?? "INVALID",
          message: data.message ?? "Unknown error",
          ticket_info: data.ticket_info,
          scanned_at: new Date().toISOString(),
        };
      }

      setScanResult(result);
      setScanHistory((prev) => [result, ...prev].slice(0, 20));

      // Loud alert sound for forged / suspect fraud so it's audible above a crowd.
      if (result.result === "FORGED" || result.result === "SUSPECT_FRAUD") {
        playAlarm();
      } else {
        playBeep(result.valid);
      }
      if (result.valid) toast.success(result.message);
      else toast.error(result.message);

    } catch (err) {
      console.error("[OrganizerScan] error:", err);
      const r: ScanResult = {
        valid: false,
        result: "INVALID",
        message: "Network error — check your connection",
        scanned_at: new Date().toISOString(),
      };
      setScanResult(r);
      toast.error(r.message);
    } finally {
      setIsValidating(false);
      // Re-activate camera after a result
      if (inputMode === "camera") {
        setTimeout(() => setCameraActive(true), 2500);
      }
    }
  };

  // ---------------------------------------------------------------------------
  // Camera scan handler
  // ---------------------------------------------------------------------------

  const handleCameraScan = (text: string) => {
    setCameraActive(false);
    validate(text);
  };

  // ---------------------------------------------------------------------------
  // Image upload handler
  // ---------------------------------------------------------------------------

  const handleImageUpload = async (file: File) => {
    setIsValidating(true);
    try {
      const decoded = await decodeQRFromFile(file);
      if (decoded) {
        await validate(decoded);
      } else {
        toast.error("No QR code detected in this image");
      }
    } catch {
      toast.error("Failed to read the image");
    } finally {
      setIsValidating(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Audio feedback
  // ---------------------------------------------------------------------------

  // Three short low pulses — loud enough to flag a forged QR across a crowd.
  const playAlarm = () => {
    const AC = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    [0, 0.25, 0.5].forEach((delay) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 240;
      osc.type = "square";
      const t = ctx.currentTime + delay;
      gain.gain.setValueAtTime(0.5, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.18);
      osc.start(t);
      osc.stop(t + 0.18);
    });
  };

  const playBeep = (success: boolean) => {
    const AC = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = success ? 880 : 350;
    osc.type = "sine";
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + (success ? 0.4 : 0.6));
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + (success ? 0.4 : 0.6));
  };

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  const selectedEvent = events.find((e) => e.id === selectedEventId);

  const validCount = scanHistory.filter((s) => s.valid).length;
  const invalidCount = scanHistory.filter((s) => !s.valid).length;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SEOHead titleKey="organizer.scan" descriptionKey="organizer.scan" />
      <Header />

      <main className="flex-1 py-8">
        <div className="container mx-auto px-4 max-w-5xl">

          {/* Title */}
          <div className="mb-6 flex items-center gap-3">
            <Shield className="w-7 h-7 text-primary" />
            <div>
              <h1 className="text-2xl font-bold">Ticket Verification</h1>
              <p className="text-sm text-muted-foreground">Validate tickets at event entry</p>
            </div>
          </div>

          {/* Locked banner when the page was opened via a deep link from a specific event */}
          {eventIdFromUrl && events.find((e) => e.id === eventIdFromUrl) && (
            <div className="mb-6 rounded-2xl bg-primary/5 border border-primary/30 px-5 py-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary text-primary-foreground flex items-center justify-center shrink-0">
                <Shield className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-primary">
                  Scanning at the door
                </div>
                <div className="font-bold text-base truncate">
                  {events.find((e) => e.id === eventIdFromUrl)?.title}
                </div>
              </div>
              <button
                onClick={() => navigate("/studio")}
                className="text-xs font-bold text-primary hover:underline shrink-0"
              >
                Back to Studio
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            {/* ── Left: Scanner ── */}
            <div className="lg:col-span-2 space-y-4">

              {/* Event selector */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Event</CardTitle>
                </CardHeader>
                <CardContent>
                  <Select value={selectedEventId} onValueChange={setSelectedEventId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select event…" />
                    </SelectTrigger>
                    <SelectContent>
                      {events.map((ev) => (
                        <SelectItem key={ev.id} value={ev.id}>
                          {ev.title} — {new Date(ev.date).toLocaleDateString("fr-FR")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedEvent && (
                    <p className="text-xs text-muted-foreground mt-2">
                      {new Date(selectedEvent.date).toLocaleDateString("fr-FR", {
                        weekday: "long", day: "numeric", month: "long", year: "numeric",
                      })}
                      {selectedEvent.location && ` · ${selectedEvent.location}`}
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Input mode toggle */}
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={inputMode === "camera" ? "default" : "outline"}
                  onClick={() => { setInputMode("camera"); setCameraActive(true); setScanResult(null); }}
                >
                  <Camera className="w-4 h-4 mr-1.5" />
                  Camera
                </Button>
                <Button
                  size="sm"
                  variant={inputMode === "manual" ? "default" : "outline"}
                  onClick={() => { setInputMode("manual"); setScanResult(null); }}
                >
                  <Scan className="w-4 h-4 mr-1.5" />
                  Manual / Image
                </Button>
              </div>

              {/* Camera mode */}
              {inputMode === "camera" && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Scan QR Code</CardTitle>
                    <CardDescription>Point the camera at the ticket QR code</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {isValidating ? (
                      <div className="flex flex-col items-center gap-3 py-12">
                        <Loader2 className="w-10 h-10 animate-spin text-primary" />
                        <p className="text-sm text-muted-foreground">Validating…</p>
                      </div>
                    ) : cameraActive ? (
                      <QRScanner
                        onScan={handleCameraScan}
                        onClose={() => setCameraActive(false)}
                      />
                    ) : (
                      <div className="flex flex-col items-center gap-3 py-8 text-center">
                        <p className="text-sm text-muted-foreground">Camera paused after scan</p>
                        <Button variant="outline" size="sm" onClick={() => { setCameraActive(true); setScanResult(null); }}>
                          <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                          Scan next ticket
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Manual / image mode */}
              {inputMode === "manual" && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Manual Entry or Image Upload</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label htmlFor="manualToken">Paste QR code text</Label>
                      <div className="flex gap-2 mt-1">
                        <Input
                          id="manualToken"
                          value={manualToken}
                          onChange={(e) => setManualToken(e.target.value)}
                          placeholder="Paste token or QR content…"
                          className="font-mono text-sm"
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && manualToken.trim()) {
                              validate(manualToken);
                              setManualToken("");
                            }
                          }}
                        />
                        <Button
                          variant="hero"
                          disabled={isValidating || !manualToken.trim() || !selectedEventId}
                          onClick={() => { validate(manualToken); setManualToken(""); }}
                        >
                          {isValidating ? <Loader2 className="w-4 h-4 animate-spin" /> : "Verify"}
                        </Button>
                      </div>
                    </div>

                    <div className="text-center text-xs text-muted-foreground">— or —</div>

                    <div>
                      <Label>Upload ticket image / PDF</Label>
                      <div
                        className="mt-1 border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary transition-colors"
                        onClick={() => document.getElementById("scan-file-input")?.click()}
                      >
                        {isValidating ? (
                          <div className="flex flex-col items-center gap-2">
                            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                            <p className="text-xs text-muted-foreground">Reading…</p>
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            Click to upload a ticket image or PDF
                          </p>
                        )}
                      </div>
                      <input
                        id="scan-file-input"
                        type="file"
                        accept="image/jpeg,image/png,image/webp,application/pdf"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleImageUpload(f);
                          e.target.value = "";
                        }}
                      />
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Scan result */}
              {scanResult && (() => {
                const sem = RESULT_SEMANTICS[scanResult.result] ?? RESULT_SEMANTICS.INVALID;
                const cardBorder =
                  sem.emphasis === "ok" ? "border-green-500 bg-green-50 dark:bg-green-950/30" :
                  sem.emphasis === "warn" ? "border-amber-500 bg-amber-50 dark:bg-amber-950/30" :
                  sem.emphasis === "danger" ? "border-red-500 bg-red-50 dark:bg-red-950/30" :
                  /* danger-loud */ "border-red-700 bg-red-100 dark:bg-red-950/50 ring-4 ring-red-200 dark:ring-red-900/40";
                const titleColor =
                  sem.emphasis === "ok" ? "text-green-700 dark:text-green-300" :
                  sem.emphasis === "warn" ? "text-amber-800 dark:text-amber-200" :
                  "text-red-700 dark:text-red-300";
                const Icon =
                  sem.emphasis === "ok" ? CheckCircle2 :
                  sem.emphasis === "warn" ? AlertTriangle :
                  XCircle;
                const iconColor =
                  sem.emphasis === "ok" ? "text-green-500" :
                  sem.emphasis === "warn" ? "text-amber-500" :
                  sem.emphasis === "danger-loud" ? "text-red-700 animate-pulse" :
                  "text-red-500";
                return (
                <Card className={`border-2 ${cardBorder}`}>
                  <CardContent className="pt-6 space-y-4">
                    {/* Status header */}
                    <div className="flex flex-col items-center text-center gap-3">
                      <Icon className={`w-14 h-14 ${iconColor}`} />
                      <div>
                        <p className={`text-2xl font-black uppercase tracking-wide ${titleColor}`}>
                          {sem.label}
                        </p>
                        <p className="text-sm text-foreground/80 mt-2 max-w-sm">
                          {scanResult.message}
                        </p>
                        <p className="text-xs text-muted-foreground mt-2 italic">
                          {sem.guidance}
                        </p>
                      </div>
                    </div>

                    {/* Studio VALID — show the holder so the door agent can check ID */}
                    {scanResult.result === "VALID" && scanResult.ticket_info?.holder_name && (
                      <div className="rounded-lg border-2 border-green-400 bg-white dark:bg-green-950/30 px-4 py-3 text-sm">
                        <p className="text-xs font-semibold uppercase tracking-wide text-green-700 dark:text-green-400 mb-2">
                          Check ID against this name
                        </p>
                        <div className="text-xl font-black leading-tight mb-0.5">
                          {scanResult.ticket_info.holder_name}
                        </div>
                        {scanResult.ticket_info.tier_name && (
                          <div className="text-xs text-muted-foreground">
                            Tier: {scanResult.ticket_info.tier_name}
                          </div>
                        )}
                        {scanResult.ticket_info.holder_email && (
                          <div className="text-xs text-muted-foreground break-all">
                            {scanResult.ticket_info.holder_email}
                          </div>
                        )}
                        <p className="text-[11px] text-muted-foreground mt-2 italic">
                          The bouncer should verify the attendee's photo ID matches this name before letting them in.
                        </p>
                      </div>
                    )}

                    {/* Studio-specific call-outs */}
                    {scanResult.result === "WRONG_EVENT" && scanResult.ticket_info?.actual_event_title && (
                      <div className="rounded-lg border-2 border-amber-300 bg-white dark:bg-amber-950/20 px-4 py-3 text-sm">
                        <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400 mb-2">
                          This QR belongs to a different event
                        </p>
                        <div className="space-y-1">
                          <div className="flex justify-between gap-3">
                            <span className="text-muted-foreground">Ticket is for</span>
                            <span className="font-semibold text-right">{scanResult.ticket_info.actual_event_title}</span>
                          </div>
                          {scanResult.ticket_info.actual_event_date && (
                            <div className="flex justify-between gap-3">
                              <span className="text-muted-foreground">On</span>
                              <span className="text-right">{new Date(scanResult.ticket_info.actual_event_date).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</span>
                            </div>
                          )}
                          {scanResult.ticket_info.expected_event_title && (
                            <div className="flex justify-between gap-3">
                              <span className="text-muted-foreground">You selected</span>
                              <span className="text-right">{scanResult.ticket_info.expected_event_title}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {scanResult.result === "ALREADY_USED" && scanResult.ticket_info?.scanned_at && (
                      <div className="rounded-lg border-2 border-red-300 bg-white dark:bg-red-950/20 px-4 py-3 text-sm">
                        <p className="text-xs font-semibold uppercase tracking-wide text-red-700 dark:text-red-400 mb-1">
                          Previously scanned
                        </p>
                        <p>
                          {new Date(scanResult.ticket_info.scanned_at).toLocaleString("en-GB", { dateStyle: "long", timeStyle: "medium" })}
                        </p>
                      </div>
                    )}

                    {scanResult.result === "FORGED" && (
                      <div className="rounded-lg border-2 border-red-500 bg-red-50 dark:bg-red-950/40 px-4 py-3 text-sm">
                        <p className="text-xs font-bold uppercase tracking-wide text-red-700 dark:text-red-300 mb-1">
                          This QR does not match any ticket on Ticket Safe
                        </p>
                        <p className="text-xs text-red-900 dark:text-red-200">
                          It may be a screenshot from another platform, a fake, or a recycled link.
                          Do not let this person in based on this QR.
                        </p>
                      </div>
                    )}

                    {/* Buyer identity — shown only on valid scan */}
                    {scanResult.valid && scanResult.buyer_info && (
                      <div className="rounded-lg border-2 border-green-300 bg-white dark:bg-green-950/20 px-4 py-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-green-700 dark:text-green-400 mb-2">
                          Verify buyer identity
                        </p>
                        <div className="space-y-1 text-sm">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Name</span>
                            <span className="font-semibold">{scanResult.buyer_info.full_name}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Email</span>
                            <span className="font-mono text-xs">{scanResult.buyer_info.email}</span>
                          </div>
                          {scanResult.buyer_info.campus && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Campus</span>
                              <span>{scanResult.buyer_info.campus}</span>
                            </div>
                          )}
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">School</span>
                            <span>{scanResult.buyer_info.university}</span>
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground mt-2 italic">
                          Ask the attendee to show their student card to confirm identity.
                        </p>
                      </div>
                    )}

                    {/* Ticket/event details */}
                    {(scanResult.ticket_info || scanResult.event_info) && (
                      <div className="bg-background/60 rounded-lg px-4 py-3 space-y-1.5 text-sm">
                        {scanResult.event_info?.title && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Event</span>
                            <span className="font-medium">{scanResult.event_info.title}</span>
                          </div>
                        )}
                        {scanResult.ticket_info?.quantity && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Qty</span>
                            <span>{scanResult.ticket_info.quantity}</span>
                          </div>
                        )}
                        {scanResult.ticket_info?.selling_price && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Paid</span>
                            <span>€{scanResult.ticket_info.selling_price}</span>
                          </div>
                        )}
                        {scanResult.ticket_info?.qr_verified === false && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">QR status</span>
                            <span className="text-amber-600 text-xs">Unverified (external ticket)</span>
                          </div>
                        )}
                        {scanResult.ticket_info?.scan_count !== undefined && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Scan #</span>
                            <span>{scanResult.ticket_info.scan_count}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Badges */}
                    <div className="flex gap-2 flex-wrap justify-center">
                      <Badge variant="outline">{scanResult.result.replace(/_/g, " ")}</Badge>
                      {scanResult.risk_level && scanResult.risk_level !== "LOW" && (
                        <Badge variant="destructive">Risk: {scanResult.risk_level}</Badge>
                      )}
                      {scanResult.fraud_signals?.map((s) => (
                        <Badge key={s} variant="outline" className="text-xs">{s.replace(/_/g, " ")}</Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
                );
              })()}
            </div>

            {/* ── Right: Stats + History ── */}
            <div className="space-y-4">
              {/* Stats */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Session Stats</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total scans</span>
                    <span className="font-semibold">{scanHistory.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Valid</span>
                    <span className="font-semibold text-green-600">{validCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Rejected</span>
                    <span className="font-semibold text-red-600">{invalidCount}</span>
                  </div>
                </CardContent>
              </Card>

              {/* History */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    Recent Scans
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {scanHistory.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">No scans yet</p>
                  ) : (
                    <div className="space-y-2">
                      {scanHistory.map((s, i) => (
                        <div
                          key={i}
                          className={`flex items-center gap-2 p-2 rounded text-sm ${s.valid ? "bg-green-100 dark:bg-green-950/40" : "bg-red-100 dark:bg-red-950/40"}`}
                        >
                          {s.valid
                            ? <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                            : <XCircle className="w-4 h-4 text-red-600 shrink-0" />
                          }
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{s.result.replace(/_/g, " ")}</p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(s.scanned_at).toLocaleTimeString("fr-FR")}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Info */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">How it works</CardTitle>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground space-y-2">
                  <p>Scans Studio direct-sale tickets (event_tickets, hex QR token).</p>
                  <p>Also scans resale marketplace tickets and platform-issued JWT tickets.</p>
                  <p>Format is auto-detected; each scan is logged in the audit trail.</p>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default OrganizerScan;
