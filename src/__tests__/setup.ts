/**
 * Vitest global setup (referenced from vitest.config.ts → test.setupFiles).
 *
 * jsdom does not implement DOMMatrix, but pdfjs-dist — imported transitively by
 * src/lib/qrValidator.ts — references it at module-evaluation time. Without a
 * stub the whole qrValidator test file fails to load with
 * "ReferenceError: DOMMatrix is not defined".
 *
 * Our tests only exercise the pure QR helpers (isQRTextValid, parseQRPayload,
 * input-validation throws) — never real PDF rendering — so a no-op stub is
 * enough to let the module import.
 */

class DOMMatrixStub {
  constructor(_init?: unknown) {
    void _init;
  }
}

const g = globalThis as unknown as { DOMMatrix?: unknown };
if (typeof g.DOMMatrix === "undefined") {
  g.DOMMatrix = DOMMatrixStub;
}
