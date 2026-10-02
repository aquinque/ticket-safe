/**
 * ScanStaff — /scan/:token, the door-scan page for staff/volunteers handed
 * a link from Studio's "Scan staff" panel (see ScanStaffPanel.tsx +
 * event_scan_staff). No Supabase Auth login, no account — the token in the
 * URL IS the credential, validated server-side in validate-event-ticket and
 * locked to the one event it was created for. Deliberately minimal: no
 * header nav, no event picker, nothing beyond "scan a ticket, see the
 * result".
 */
import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Camera, Scan, Loader2, CheckCircle2, XCircle, AlertTriangle, RefreshCw, ShieldCheck, Users, Clock } from "lucide-react";
import { toast } from "sonner";
import Logo from "@/components/Logo";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { QRScanner } from "@/components/QRScanner";
import { decodeQRFromFile } from "@/lib/qrValidator";
import { SEOHead } from "@/components/SEOHead";

type ScanResultCode =
  | "VALID" | "INVALID" | "FORGED" | "WRONG_EVENT" | "ALREADY_USED"
  | "REVOKED" | "FORBIDDEN" | "RATE_LIMITED";

interface ScanResult {
  valid: boolean;
  result: ScanResultCode;
  message: string;
  ticket_info?: {
    event_title?: string;
    tier_name?: string;
    holder_name?: string | null;
    holder_email?: string | null;
    scanned_at?: string;
  };
}

const RESULT_SEMANTICS: Record<ScanResultCode, { emphasis: "ok" | "warn" | "danger"; label: string }> = {
  VALID: { emphasis: "ok", label: "Entry granted" },
  ALREADY_USED: { emphasis: "danger", label: "Already scanned" },
  WRONG_EVENT: { emphasis: "warn", label: "Wrong event" },
  REVOKED: { emphasis: "danger", label: "Refunded / cancelled" },
  FORGED: { emphasis: "danger", label: "Fake or unknown" },
  INVALID: { emphasis: "danger", label: "Invalid" },
  FORBIDDEN: { emphasis: "danger", label: "Link revoked" },
  RATE_LIMITED: { emphasis: "warn", label: "Too many scans" },
};

interface CheckinRow {
  id: string;
  name: string;
  tier_name: string | null;
  scanned_at: string;
}

const ScanStaff = () => {
  const { token } = useParams<{ token: string }>();
  const [inputMode, setInputMode] = useState<"camera" | "manual">("camera");
  const [manualToken, setManualToken] = useState("");
  const [isValidating, setIsValidating] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [cameraActive, setCameraActive] = useState(true);
  const [sessionCount, setSessionCount] = useState({ valid: 0, rejected: 0 });

  // Live "who's been checked in" list — shared across every device scanning
  // this event (polled, since this page has no Supabase Auth session for a
  // Realtime subscription to authorize against).
  const [checkins, setCheckins] = useState<CheckinRow[]>([]);
  const [totals, setTotals] = useState<{ scanned: number; total: number } | null>(null);
  const loadingRef = useRef(false);

  const loadCheckins = async () => {
    if (!token || loadingRef.current) return;
    loadingRef.current = true;
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/list-event-checkins`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
        body: JSON.stringify({ staff_token: token }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setCheckins(data.checkins ?? []);
        setTotals({ scanned: data.total_scanned ?? 0, total: data.total_tickets ?? 0 });
      }
    } catch (err) {
      console.error("[ScanStaff] checkins poll failed:", err);
    } finally {
      loadingRef.current = false;
    }
  };

  useEffect(() => {
    loadCheckins();
    const interval = setInterval(loadCheckins, 4000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const validate = async (qrText: string) => {
    if (!token) return;
    const cleaned = qrText.trim();
    if (!cleaned) {
      toast.error("QR code is empty");
      return;
    }
    setIsValidating(true);
    setScanResult(null);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/validate-event-ticket`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ qr_token: cleaned, staff_token: token }),
        },
      );
      const data = await res.json();
      const code = (data.result ?? "INVALID") as ScanResultCode;
      const result: ScanResult = {
        valid: code === "VALID",
        result: code,
        message: data.message ?? "Unknown error",
        ticket_info: data.ticket_info,
      };
      setScanResult(result);
      setSessionCount((c) => (result.valid ? { ...c, valid: c.valid + 1 } : { ...c, rejected: c.rejected + 1 }));
      if (result.valid) {
        toast.success(result.message);
        loadCheckins(); // refresh the live list immediately instead of waiting for the next poll
      } else {
        toast.error(result.message);
      }
    } catch (err) {
      console.error("[ScanStaff] error:", err);
      const r: ScanResult = { valid: false, result: "INVALID", message: "Network error — check your connection" };
      setScanResult(r);
      toast.error(r.message);
    } finally {
      setIsValidating(false);
      if (inputMode === "camera") setTimeout(() => setCameraActive(true), 2000);
    }
  };

  const handleCameraScan = (text: string) => {
    setCameraActive(false);
    validate(text);
  };

  const handleImageUpload = async (file: File) => {
    setIsValidating(true);
    try {
      const decoded = await decodeQRFromFile(file);
      if (decoded) await validate(decoded);
      else toast.error("No QR code detected in this image");
    } catch {
      toast.error("Failed to read the image");
    } finally {
      setIsValidating(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <p className="text-sm text-muted-foreground">Missing scan link.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SEOHead title="Door scan — Ticket Safe" description="Ticket scanning" />
      <header className="border-b border-border">
        <div className="container mx-auto px-4 h-14 flex items-center justify-between">
          <Logo height={26} iconOnly />
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <ShieldCheck className="w-3.5 h-3.5 text-primary" />
            Door scan
          </span>
        </div>
      </header>

      <main className="flex-1 py-6">
        <div className="container mx-auto px-4 max-w-5xl lg:grid lg:grid-cols-[minmax(0,420px)_320px] lg:gap-6 lg:items-start lg:justify-center">
        <div className="max-w-md mx-auto lg:mx-0 space-y-4">
          <div className="flex items-center gap-3 text-xs text-muted-foreground justify-center">
            <span>Valid: <strong className="text-foreground">{sessionCount.valid}</strong></span>
            <span>·</span>
            <span>Rejected: <strong className="text-foreground">{sessionCount.rejected}</strong></span>
          </div>

          <div className="flex gap-2 justify-center">
            <Button size="sm" variant={inputMode === "camera" ? "default" : "outline"} onClick={() => { setInputMode("camera"); setCameraActive(true); setScanResult(null); }}>
              <Camera className="w-4 h-4 mr-1.5" />
              Camera
            </Button>
            <Button size="sm" variant={inputMode === "manual" ? "default" : "outline"} onClick={() => { setInputMode("manual"); setScanResult(null); }}>
              <Scan className="w-4 h-4 mr-1.5" />
              Manual / Image
            </Button>
          </div>

          {inputMode === "camera" ? (
            <div className="rounded-2xl border border-border bg-card p-4">
              {isValidating ? (
                <div className="flex flex-col items-center gap-3 py-12">
                  <Loader2 className="w-10 h-10 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">Validating…</p>
                </div>
              ) : cameraActive ? (
                <QRScanner onScan={handleCameraScan} onClose={() => setCameraActive(false)} />
              ) : (
                <div className="flex flex-col items-center gap-3 py-8 text-center">
                  <p className="text-sm text-muted-foreground">Camera paused after scan</p>
                  <Button variant="outline" size="sm" onClick={() => { setCameraActive(true); setScanResult(null); }}>
                    <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                    Scan next ticket
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
              <div className="flex gap-2">
                <Input
                  value={manualToken}
                  onChange={(e) => setManualToken(e.target.value)}
                  placeholder="Paste QR token…"
                  className="font-mono text-sm"
                  onKeyDown={(e) => { if (e.key === "Enter" && manualToken.trim()) { validate(manualToken); setManualToken(""); } }}
                />
                <Button variant="hero" disabled={isValidating || !manualToken.trim()} onClick={() => { validate(manualToken); setManualToken(""); }}>
                  {isValidating ? <Loader2 className="w-4 h-4 animate-spin" /> : "Verify"}
                </Button>
              </div>
              <div className="text-center text-xs text-muted-foreground">— or —</div>
              <div
                className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary transition-colors"
                onClick={() => document.getElementById("scan-file-input")?.click()}
              >
                <p className="text-sm text-muted-foreground">
                  {isValidating ? "Reading…" : "Click to upload a ticket image"}
                </p>
              </div>
              <input
                id="scan-file-input"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); e.target.value = ""; }}
              />
            </div>
          )}

          {scanResult && (() => {
            const sem = RESULT_SEMANTICS[scanResult.result] ?? RESULT_SEMANTICS.INVALID;
            const border = sem.emphasis === "ok" ? "border-emerald-500 bg-emerald-50" : sem.emphasis === "warn" ? "border-amber-500 bg-amber-50" : "border-red-500 bg-red-50";
            const Icon = sem.emphasis === "ok" ? CheckCircle2 : sem.emphasis === "warn" ? AlertTriangle : XCircle;
            const iconColor = sem.emphasis === "ok" ? "text-emerald-600" : sem.emphasis === "warn" ? "text-amber-600" : "text-red-600";
            return (
              <div className={`rounded-2xl border-2 p-5 text-center ${border}`}>
                <Icon className={`w-12 h-12 mx-auto mb-2 ${iconColor}`} />
                <p className="text-xl font-black uppercase tracking-wide">{sem.label}</p>
                <p className="text-sm mt-1.5">{scanResult.message}</p>
                {scanResult.ticket_info?.holder_name && (
                  <div className="mt-3 rounded-lg bg-white border border-emerald-200 px-4 py-3 text-left">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700 mb-1">Check ID against</p>
                    <p className="text-lg font-black">{scanResult.ticket_info.holder_name}</p>
                    {scanResult.ticket_info.tier_name && (
                      <p className="text-xs text-muted-foreground">{scanResult.ticket_info.tier_name}</p>
                    )}
                  </div>
                )}
              </div>
            );
          })()}
        </div>

        {/* Live check-in list — shared across every device scanning this
            event, polled every few seconds. */}
        <div className="max-w-md mx-auto lg:mx-0 mt-6 lg:mt-0">
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold flex items-center gap-1.5">
                <Users className="w-4 h-4 text-primary" />
                Checked in
              </h2>
              {totals && (
                <span className="text-xs font-bold text-muted-foreground tabular-nums">
                  {totals.scanned}/{totals.total}
                </span>
              )}
            </div>
            {checkins.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6">No one checked in yet.</p>
            ) : (
              <div className="space-y-1.5 max-h-[60vh] overflow-y-auto">
                {checkins.map((c) => (
                  <div key={c.id} className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-emerald-50 border border-emerald-200">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold truncate">{c.name}</div>
                      <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                        {c.tier_name && <span className="truncate">{c.tier_name}</span>}
                        <span className="inline-flex items-center gap-0.5 shrink-0">
                          <Clock className="w-2.5 h-2.5" />
                          {new Date(c.scanned_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        </div>
      </main>
    </div>
  );
};

export default ScanStaff;
