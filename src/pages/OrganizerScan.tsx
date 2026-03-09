/**
 * OrganizerScan — ticket validation page for event organizers.
 *
 * Supports two ticket types automatically:
 *  - Platform JWT tickets  → validated via validate-scan (secure_tickets table)
 *  - Marketplace tickets   → validated via check-ticket-entry (tickets table, qr_hash)
 *
 * Input methods: camera QR scan, image upload, or manual paste.
 */

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
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
  | "WRONG_EVENT"
  | "NOT_PURCHASED"
  | "ALREADY_USED"
  | "REVOKED"
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
  };
  risk_level?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  fraud_signals?: string[];
  scanned_at: string;
}

type InputMode = "camera" | "manual";

// JWT pattern: three base64url segments separated by dots
const JWT_RE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const OrganizerScan = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>("");
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
    if (!authLoading && !user) navigate("/auth");
  }, [user, authLoading, navigate]);

  // Load upcoming active events
  useEffect(() => {
    if (!user) return;
    supabase
      .from("events")
      .select("id, title, date, location")
      .eq("is_active", true)
      .gte("date", new Date().toISOString())
      .order("date", { ascending: true })
      .then(({ data }) => {
        setEvents(data ?? []);
        if (data && data.length > 0) setSelectedEventId(data[0].id);
      });
  }, [user]);

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

      const isJWT = JWT_RE.test(qrText.trim());

      let result: ScanResult;

      if (isJWT) {
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

      playBeep(result.valid);
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
          <div className="mb-8 flex items-center gap-3">
            <Shield className="w-7 h-7 text-primary" />
            <div>
              <h1 className="text-2xl font-bold">Ticket Verification</h1>
              <p className="text-sm text-muted-foreground">Validate tickets at event entry</p>
            </div>
          </div>

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
              {scanResult && (
                <Card className={`border-2 ${scanResult.valid ? "border-green-500 bg-green-50 dark:bg-green-950/30" : "border-red-400 bg-red-50 dark:bg-red-950/30"}`}>
                  <CardContent className="pt-6 space-y-4">
                    {/* Status header */}
                    <div className="flex flex-col items-center text-center gap-3">
                      {scanResult.valid
                        ? <CheckCircle2 className="w-14 h-14 text-green-500" />
                        : scanResult.result === "WRONG_EVENT" || scanResult.result === "EVENT_NOT_STARTED"
                          ? <AlertTriangle className="w-14 h-14 text-orange-500" />
                          : <XCircle className="w-14 h-14 text-red-500" />
                      }
                      <div>
                        <p className={`text-2xl font-bold ${scanResult.valid ? "text-green-700 dark:text-green-300" : "text-red-700 dark:text-red-300"}`}>
                          {scanResult.valid ? "Entry Granted" : "Entry Denied"}
                        </p>
                        <p className="text-sm text-muted-foreground mt-1">{scanResult.message}</p>
                      </div>
                    </div>

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
              )}
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
                  <p>Scans tickets bought via the Ticket Safe marketplace.</p>
                  <p>Also validates platform-issued JWT tickets with cryptographic verification.</p>
                  <p>Each scan is logged for audit.</p>
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
