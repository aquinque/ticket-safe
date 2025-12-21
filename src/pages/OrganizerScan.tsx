/**
 * ORGANIZER SCAN PAGE
 * Secure ticket validation interface for event organizers/staff
 * Includes QR scanning, manual token entry, and real-time fraud detection
 */

import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Shield,
  Camera,
  Scan,
  AlertCircle,
  Loader2,
  MapPin,
  Clock,
  User,
  Ticket as TicketIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { SEOHead } from "@/components/SEOHead";

interface Event {
  id: string;
  title: string;
  date: string;
  location: string;
}

interface ScanResult {
  valid: boolean;
  result: 'VALID' | 'INVALID' | 'ALREADY_USED' | 'WRONG_EVENT' | 'EXPIRED' | 'REVOKED' | 'SUSPECT_FRAUD' | 'RATE_LIMITED';
  message: string;
  risk_score: number;
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  fraud_signals: string[];
  ticket_info?: {
    ticket_number: string;
    owner_initials: string;
    seat_info: string | null;
    scan_count: number;
  };
}

const OrganizerScan = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>("");
  const [ticketToken, setTicketToken] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [scanHistory, setScanHistory] = useState<ScanResult[]>([]);
  const [deviceId] = useState(() => {
    let id = localStorage.getItem('scanner_device_id');
    if (!id) {
      id = `device-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      localStorage.setItem('scanner_device_id', id);
    }
    return id;
  });

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) {
      fetchEvents();
    }
  }, [user]);

  const fetchEvents = async () => {
    try {
      const { data, error } = await supabase
        .from("events")
        .select("id, title, date, location")
        .eq("is_active", true)
        .gte("date", new Date().toISOString())
        .order("date", { ascending: true });

      if (error) throw error;
      setEvents(data || []);

      // Auto-select first event
      if (data && data.length > 0) {
        setSelectedEventId(data[0].id);
      }
    } catch (error) {
      console.error("Error fetching events:", error);
      toast.error("Failed to load events");
    }
  };

  const handleScan = async () => {
    if (!selectedEventId) {
      toast.error("Please select an event first");
      return;
    }

    if (!ticketToken.trim()) {
      toast.error("Please enter or scan a ticket token");
      return;
    }

    setIsScanning(true);
    setScanResult(null);

    try {
      // Get current location (if available)
      let location: { latitude?: number; longitude?: number } | undefined;
      if (navigator.geolocation) {
        await new Promise<void>((resolve) => {
          navigator.geolocation.getCurrentPosition(
            (position) => {
              location = {
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
              };
              resolve();
            },
            () => resolve() // Continue even if location fails
          );
        });
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      // Call validation Edge Function
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/validate-scan`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            ticket_token: ticketToken.trim(),
            event_id: selectedEventId,
            scanner_device_id: deviceId,
            scanner_location: location,
            timestamp: new Date().toISOString(),
          }),
        }
      );

      const result: ScanResult = await response.json();
      setScanResult(result);

      // Add to history
      setScanHistory((prev) => [result, ...prev].slice(0, 10));

      // Visual/audio feedback
      if (result.valid) {
        toast.success(result.message);
        playSound('success');
      } else {
        toast.error(result.message);
        playSound('error');
      }

      // Clear input after scan
      setTicketToken("");
    } catch (error) {
      console.error("Scan error:", error);
      toast.error("Failed to validate ticket");
      setScanResult({
        valid: false,
        result: 'INVALID',
        message: 'Network error or server unavailable',
        risk_score: 0,
        risk_level: 'LOW',
        fraud_signals: [],
      });
    } finally {
      setIsScanning(false);
    }
  };

  const playSound = (type: 'success' | 'error') => {
    // Create simple audio feedback
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const audioContext = new AudioContextClass();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.value = type === 'success' ? 800 : 400;
    oscillator.type = 'sine';

    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.3);
  };

  const getRiskColor = (level: string) => {
    switch (level) {
      case 'CRITICAL': return 'destructive';
      case 'HIGH': return 'destructive';
      case 'MEDIUM': return 'warning';
      default: return 'default';
    }
  };

  const getResultIcon = (result: ScanResult) => {
    if (result.valid) {
      return <CheckCircle2 className="w-16 h-16 text-green-500" />;
    } else if (result.risk_level === 'CRITICAL' || result.risk_level === 'HIGH') {
      return <AlertTriangle className="w-16 h-16 text-red-500" />;
    } else {
      return <XCircle className="w-16 h-16 text-orange-500" />;
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SEOHead titleKey="organizer.scan" descriptionKey="organizer.scan" />
      <Header />

      <main className="flex-1 py-8">
        <div className="container mx-auto px-4 max-w-6xl">
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-2">
              <Shield className="w-8 h-8 text-primary" />
              <h1 className="text-3xl font-bold">Secure Ticket Scanner</h1>
            </div>
            <p className="text-muted-foreground">
              Validate tickets with real-time fraud detection
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left: Scanner Interface */}
            <div className="lg:col-span-2 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Scan className="w-5 h-5" />
                    Scan Ticket
                  </CardTitle>
                  <CardDescription>
                    Select event and scan/enter ticket token
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label>Event</Label>
                    <Select value={selectedEventId} onValueChange={setSelectedEventId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select event" />
                      </SelectTrigger>
                      <SelectContent>
                        {events.map((event) => (
                          <SelectItem key={event.id} value={event.id}>
                            {event.title} - {new Date(event.date).toLocaleDateString()}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Ticket Token / QR Code</Label>
                    <div className="flex gap-2">
                      <Input
                        value={ticketToken}
                        onChange={(e) => setTicketToken(e.target.value)}
                        placeholder="Scan QR or paste token..."
                        onKeyPress={(e) => e.key === 'Enter' && handleScan()}
                        className="font-mono text-sm"
                      />
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => {
                          // In production, integrate with camera/QR scanner
                          toast.info("QR Camera scanner coming soon. Please paste token manually.");
                        }}
                      >
                        <Camera className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  <Button
                    onClick={handleScan}
                    disabled={isScanning || !selectedEventId || !ticketToken}
                    className="w-full"
                    size="lg"
                    variant="hero"
                  >
                    {isScanning ? (
                      <>
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                        Validating...
                      </>
                    ) : (
                      <>
                        <Shield className="w-5 h-5 mr-2" />
                        Validate Ticket
                      </>
                    )}
                  </Button>

                  <p className="text-xs text-muted-foreground text-center">
                    🔒 Scan secured with real-time fraud detection
                  </p>
                </CardContent>
              </Card>

              {/* Scan Result */}
              {scanResult && (
                <Card className={`border-2 ${scanResult.valid ? 'border-green-500 bg-green-50 dark:bg-green-950' : 'border-red-500 bg-red-50 dark:bg-red-950'}`}>
                  <CardContent className="pt-6">
                    <div className="flex flex-col items-center text-center space-y-4">
                      {getResultIcon(scanResult)}

                      <div>
                        <h3 className={`text-2xl font-bold mb-2 ${scanResult.valid ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}`}>
                          {scanResult.result}
                        </h3>
                        <p className="text-lg text-foreground">
                          {scanResult.message}
                        </p>
                      </div>

                      {scanResult.ticket_info && (
                        <div className="w-full bg-background/50 rounded-lg p-4 space-y-2">
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Ticket:</span>
                            <span className="font-mono font-semibold">{scanResult.ticket_info.ticket_number}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Owner:</span>
                            <span className="font-semibold">{scanResult.ticket_info.owner_initials}</span>
                          </div>
                          {scanResult.ticket_info.seat_info && (
                            <div className="flex justify-between text-sm">
                              <span className="text-muted-foreground">Seat:</span>
                              <span className="font-semibold">{scanResult.ticket_info.seat_info}</span>
                            </div>
                          )}
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Scan Count:</span>
                            <span className="font-semibold">{scanResult.ticket_info.scan_count}</span>
                          </div>
                        </div>
                      )}

                      <div className="flex gap-2 flex-wrap justify-center">
                        <Badge variant={getRiskColor(scanResult.risk_level) as "default" | "secondary" | "destructive" | "outline"}>
                          Risk: {scanResult.risk_level} ({scanResult.risk_score}/100)
                        </Badge>
                        {scanResult.fraud_signals.map((signal, idx) => (
                          <Badge key={idx} variant="outline" className="text-xs">
                            {signal.replace(/_/g, ' ')}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Right: History & Stats */}
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Scan History</CardTitle>
                </CardHeader>
                <CardContent>
                  {scanHistory.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No scans yet
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {scanHistory.map((scan, idx) => (
                        <div
                          key={idx}
                          className={`p-3 rounded-lg text-sm ${scan.valid ? 'bg-green-100 dark:bg-green-950' : 'bg-red-100 dark:bg-red-950'}`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-semibold">{scan.result}</span>
                            {scan.valid ? (
                              <CheckCircle2 className="w-4 h-4 text-green-600" />
                            ) : (
                              <XCircle className="w-4 h-4 text-red-600" />
                            )}
                          </div>
                          {scan.ticket_info && (
                            <p className="text-xs font-mono">{scan.ticket_info.ticket_number}</p>
                          )}
                          <Badge variant="outline" className="mt-1 text-xs">
                            {scan.risk_level}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Scanner Info</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Device ID:</span>
                    <span className="font-mono text-xs">{deviceId.substring(0, 16)}...</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Scans Today:</span>
                    <span className="font-semibold">{scanHistory.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Valid:</span>
                    <span className="font-semibold text-green-600">
                      {scanHistory.filter(s => s.valid).length}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Invalid:</span>
                    <span className="font-semibold text-red-600">
                      {scanHistory.filter(s => !s.valid).length}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Instructions */}
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-lg">Security Features</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="flex items-start gap-3">
                  <Shield className="w-5 h-5 text-primary mt-0.5" />
                  <div>
                    <p className="font-semibold text-sm">Cryptographic Validation</p>
                    <p className="text-xs text-muted-foreground">JWT signature verification prevents tampering</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-primary mt-0.5" />
                  <div>
                    <p className="font-semibold text-sm">Fraud Detection</p>
                    <p className="text-xs text-muted-foreground">Real-time detection of suspicious patterns</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Clock className="w-5 h-5 text-primary mt-0.5" />
                  <div>
                    <p className="font-semibold text-sm">Audit Trail</p>
                    <p className="text-xs text-muted-foreground">Immutable log of all scan attempts</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default OrganizerScan;
