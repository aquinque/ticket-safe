/**
 * QRScanner — live camera QR code reader using html5-qrcode.
 *
 * Works in all modern browsers (Chrome, Firefox, Safari, Edge).
 * Falls back to an error message if camera permission is denied.
 *
 * Props:
 *   onScan(text)  — called once when a QR code is successfully decoded
 *   onClose()     — called when the user dismisses the scanner
 */

import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Camera, X } from "lucide-react";

interface QRScannerProps {
  onScan: (text: string) => void;
  onClose: () => void;
}

const CONTAINER_ID = "qr-scanner-live";

export function QRScanner({ onScan, onClose }: QRScannerProps) {
  const [starting, setStarting] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Stable refs so the effect never needs to re-run for callback changes
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    let scanner: Html5Qrcode | null = null;
    let done = false; // prevent double-fire in React StrictMode

    const stopScanner = async () => {
      if (!scanner) return;
      try {
        const state = scanner.getState();
        // State 2 = SCANNING, state 3 = PAUSED
        if (state === 2 || state === 3) {
          await scanner.stop();
        }
      } catch {
        // ignore — already stopped
      }
      try { scanner.clear(); } catch { /* ignore */ }
    };

    const startScanner = async () => {
      try {
        scanner = new Html5Qrcode(CONTAINER_ID, { verbose: false });

        await scanner.start(
          { facingMode: "environment" },
          {
            fps: 10,
            qrbox: (w: number, h: number) => {
              const side = Math.min(w, h, 280);
              return { width: side, height: side };
            },
            aspectRatio: 1.0,
          },
          (decodedText: string) => {
            if (done) return;
            done = true;
            console.log("[QRScanner] scan success →", decodedText);
            stopScanner();
            onScanRef.current(decodedText);
          },
          () => {
            // per-frame decode error — normal when no QR visible, ignore
          }
        );

        if (!done) setStarting(false);
      } catch (err: unknown) {
        if (done) return;
        const msg = err instanceof Error ? err.message : String(err);
        const isDenied =
          msg.toLowerCase().includes("permission") ||
          msg.toLowerCase().includes("denied") ||
          msg.toLowerCase().includes("notallowed");
        setError(
          isDenied
            ? "Camera access was denied. Please allow camera access in your browser settings, then try again."
            : "Could not start the camera. Please try uploading an image instead."
        );
        setStarting(false);
      }
    };

    startScanner();

    return () => {
      done = true;
      stopScanner();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleClose = () => {
    onCloseRef.current();
  };

  return (
    <div className="space-y-3">
      {/* Camera viewport */}
      <div className="relative rounded-lg overflow-hidden bg-black min-h-[300px] flex items-center justify-center">
        {/* html5-qrcode mounts into this div */}
        <div id={CONTAINER_ID} className="w-full" />

        {starting && !error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70 rounded-lg">
            <div className="flex flex-col items-center gap-2 text-white">
              <Loader2 className="w-8 h-8 animate-spin" />
              <p className="text-sm">Starting camera…</p>
            </div>
          </div>
        )}
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex items-center justify-between">
        {!error && (
          <p className="text-sm text-muted-foreground flex items-center gap-1.5">
            <Camera className="w-4 h-4 shrink-0" />
            Point the camera at the QR code on your ticket
          </p>
        )}
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={handleClose}
          className="ml-auto"
        >
          <X className="w-3 h-3 mr-1" />
          Close camera
        </Button>
      </div>
    </div>
  );
}
