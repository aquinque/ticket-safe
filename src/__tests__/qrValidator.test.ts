/**
 * Tests for src/lib/qrValidator.ts
 *
 * Coverage:
 *  - isQRTextValid()   — client-side length guard
 *  - parseQRPayload()  — payload parsing (JWT / JSON / plain)
 *  - decodeQRFromImage() — browser API fallback error
 *
 * Tests for edge-function QR validation logic are written as pure
 * functions extracted from the edge function logic (no Deno globals).
 * This lets Vitest execute them in Node.js.
 */

import { describe, it, expect, vi, beforeAll } from "vitest";
import {
  isQRTextValid,
  parseQRPayload,
  type QRPayloadSummary,
} from "../lib/qrValidator";

// ---------------------------------------------------------------------------
// isQRTextValid
// ---------------------------------------------------------------------------

describe("isQRTextValid", () => {
  it("returns false for empty string", () => {
    expect(isQRTextValid("")).toBe(false);
  });

  it("returns false for whitespace-only string", () => {
    expect(isQRTextValid("   ")).toBe(false);
  });

  it("returns false for strings shorter than 5 chars after trim", () => {
    expect(isQRTextValid("abc")).toBe(false);
    expect(isQRTextValid("1234")).toBe(false);
  });

  it("returns true for strings of exactly 5 chars", () => {
    expect(isQRTextValid("12345")).toBe(true);
  });

  it("returns true for a normal JWT-like string", () => {
    const jwt =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0aWQiOiJ0ZXN0LTEyMyJ9.SIG";
    expect(isQRTextValid(jwt)).toBe(true);
  });

  it("returns true for a JSON payload", () => {
    expect(
      isQRTextValid(JSON.stringify({ id: "abc-123", event: "gala" }))
    ).toBe(true);
  });

  it("returns false for strings longer than 10 000 chars", () => {
    expect(isQRTextValid("a".repeat(10_001))).toBe(false);
  });

  it("returns true for strings exactly 10 000 chars", () => {
    expect(isQRTextValid("a".repeat(10_000))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// parseQRPayload
// ---------------------------------------------------------------------------

describe("parseQRPayload — type detection", () => {
  it("detects JWT format", () => {
    // Header: {"alg":"HS256","typ":"JWT"} → eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9
    // Payload: {"tid":"ticket-123","iss":"ticket-safe","iat":1700000000}
    const payload = btoa(
      JSON.stringify({ tid: "ticket-123", iss: "ticket-safe", iat: 1700000000 })
    )
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    const token = `eyJhbGciOiJIUzI1NiJ9.${payload}.fakesig`;
    const result: QRPayloadSummary = parseQRPayload(token);
    expect(result.type).toBe("jwt");
    expect(result.fields.tid).toBe("ticket-123");
    expect(result.fields.iss).toBe("ticket-safe");
  });

  it("detects JSON format", () => {
    const qr = JSON.stringify({ id: "evt-001", event: "Ski Trip", price: 45 });
    const result = parseQRPayload(qr);
    expect(result.type).toBe("json");
    expect(result.fields.id).toBe("evt-001");
    expect(result.fields.event).toBe("Ski Trip");
  });

  it("detects plain-text format", () => {
    const result = parseQRPayload("QR-EBS-SKI-2025-001");
    expect(result.type).toBe("plain");
    expect(result.fields.value).toBe("QR-EBS-SKI-2025-001");
  });

  it("always returns the raw string unchanged", () => {
    const raw = "hello-world-ticket-42";
    const result = parseQRPayload(raw);
    expect(result.raw).toBe(raw);
  });

  it("handles malformed JSON gracefully (falls back to plain)", () => {
    const result = parseQRPayload("{not-valid-json");
    expect(result.type).toBe("plain");
  });
});

// ---------------------------------------------------------------------------
// decodeQRFromImage — browser API absence error
// ---------------------------------------------------------------------------

describe("decodeQRFromImage", () => {
  it("throws when BarcodeDetector is not available", async () => {
    // Make sure BarcodeDetector is NOT defined in the test env
    const { decodeQRFromImage } = await import("../lib/qrValidator");

    const fakeFile = new File(["data"], "qr.png", { type: "image/png" });
    await expect(decodeQRFromImage(fakeFile)).rejects.toThrow(
      /not supported in your browser/i
    );
  });

  it("throws on unsupported file type", async () => {
    const { decodeQRFromImage } = await import("../lib/qrValidator");
    const badFile = new File(["data"], "ticket.pdf", {
      type: "application/pdf",
    });
    await expect(decodeQRFromImage(badFile)).rejects.toThrow(
      /unsupported file type/i
    );
  });

  it("throws on oversized file", async () => {
    const { decodeQRFromImage } = await import("../lib/qrValidator");
    // Create a fake large file (10 MB + 1 byte)
    const bigBlob = new Blob([new ArrayBuffer(10 * 1024 * 1024 + 1)], {
      type: "image/png",
    });
    const bigFile = new File([bigBlob], "big.png", { type: "image/png" });
    await expect(decodeQRFromImage(bigFile)).rejects.toThrow(/too large/i);
  });
});

// ---------------------------------------------------------------------------
// Pure edge-function logic — QR validation rules (extracted as pure fns)
// ---------------------------------------------------------------------------

/**
 * Mirrors the server-side validation rules, extracted as pure TypeScript
 * so they can run in Vitest without Deno globals.
 */

type QRValidationCode =
  | "VALID"
  | "INVALID_FORMAT"
  | "UNKNOWN_TICKET"
  | "ALREADY_LISTED"
  | "ALREADY_USED"
  | "CANCELLED"
  | "REFUNDED"
  | "EXPIRED"
  | "INTERNAL_ERROR";

interface QRCheck {
  code: QRValidationCode;
  message: string;
}

function checkQRText(qrText: string): QRCheck | null {
  if (!qrText || qrText.trim().length === 0) {
    return { code: "INVALID_FORMAT", message: "QR code text is required" };
  }
  const trimmed = qrText.trim();
  if (trimmed.length > 10_000) {
    return { code: "INVALID_FORMAT", message: "QR code text is too long" };
  }
  if (trimmed.length < 5) {
    return {
      code: "INVALID_FORMAT",
      message: "QR code text is too short to be a valid ticket",
    };
  }
  return null; // OK
}

function checkEventDate(eventDate: Date): QRCheck | null {
  if (eventDate < new Date()) {
    return { code: "EXPIRED", message: "Cannot sell tickets for past events" };
  }
  return null;
}

function checkPriceRange(
  price: number,
  basePrice: number | null
): QRCheck | null {
  if (!isFinite(price) || price <= 0 || price > 10_000) {
    return {
      code: "INVALID_FORMAT",
      message: "Selling price must be between €0.01 and €10,000",
    };
  }
  if (basePrice !== null && price > basePrice + 1) {
    return {
      code: "INVALID_FORMAT",
      message: `Selling price cannot exceed €${(basePrice + 1).toFixed(2)}`,
    };
  }
  return null;
}

function checkForDuplicate(
  qrHash: string,
  existingHashes: Set<string>
): QRCheck | null {
  if (existingHashes.has(qrHash)) {
    return {
      code: "ALREADY_LISTED",
      message: "This ticket is already listed on the marketplace",
    };
  }
  return null;
}

// ---------------------------------------------------------------------------

describe("Server-side validation rules (pure functions)", () => {
  // -- QR text validation --

  describe("checkQRText", () => {
    it("INVALID_FORMAT on empty input", () => {
      expect(checkQRText("")).toEqual({
        code: "INVALID_FORMAT",
        message: "QR code text is required",
      });
    });

    it("INVALID_FORMAT on whitespace-only", () => {
      expect(checkQRText("   ")).toEqual({
        code: "INVALID_FORMAT",
        message: "QR code text is required",
      });
    });

    it("INVALID_FORMAT when text is too short (< 5 chars)", () => {
      const result = checkQRText("abc");
      expect(result?.code).toBe("INVALID_FORMAT");
    });

    it("INVALID_FORMAT when text exceeds 10 000 chars", () => {
      const result = checkQRText("x".repeat(10_001));
      expect(result?.code).toBe("INVALID_FORMAT");
    });

    it("returns null (OK) for a valid plain-text QR", () => {
      expect(checkQRText("QR-EBS-SKI-2025-001")).toBeNull();
    });

    it("returns null (OK) for a valid JSON QR", () => {
      expect(
        checkQRText(JSON.stringify({ tid: "test-ticket", eid: "event-123" }))
      ).toBeNull();
    });
  });

  // -- Event date validation --

  describe("checkEventDate", () => {
    it("EXPIRED for a past event", () => {
      const pastDate = new Date("2020-01-01");
      const result = checkEventDate(pastDate);
      expect(result?.code).toBe("EXPIRED");
    });

    it("returns null for a future event", () => {
      const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      expect(checkEventDate(futureDate)).toBeNull();
    });
  });

  // -- Price validation --

  describe("checkPriceRange", () => {
    it("INVALID_FORMAT for price = 0", () => {
      expect(checkPriceRange(0, null)?.code).toBe("INVALID_FORMAT");
    });

    it("INVALID_FORMAT for negative price", () => {
      expect(checkPriceRange(-1, null)?.code).toBe("INVALID_FORMAT");
    });

    it("INVALID_FORMAT for price > 10 000", () => {
      expect(checkPriceRange(10_001, null)?.code).toBe("INVALID_FORMAT");
    });

    it("INVALID_FORMAT when price exceeds base + 1", () => {
      // base = 50 → max = 51
      expect(checkPriceRange(52, 50)?.code).toBe("INVALID_FORMAT");
    });

    it("returns null for a price exactly at base + 1", () => {
      expect(checkPriceRange(51, 50)).toBeNull();
    });

    it("returns null for a valid price with no base constraint", () => {
      expect(checkPriceRange(99.99, null)).toBeNull();
    });
  });

  // -- Duplicate check --

  describe("checkForDuplicate", () => {
    it("ALREADY_LISTED when qr_hash exists", () => {
      const hashes = new Set(["abc123"]);
      expect(checkForDuplicate("abc123", hashes)?.code).toBe("ALREADY_LISTED");
    });

    it("returns null for a fresh QR hash", () => {
      const hashes = new Set(["abc123"]);
      expect(checkForDuplicate("newHash", hashes)).toBeNull();
    });

    it("is case-sensitive (SHA-256 hashes are lowercase hex)", () => {
      const hashes = new Set(["ABC123"]);
      expect(checkForDuplicate("abc123", hashes)).toBeNull();
    });
  });

  // -- Integration: chained validations --

  describe("Full validation chain", () => {
    it("passes a complete valid listing request", () => {
      const qrCheck = checkQRText("QR-VALID-TICKET-001");
      const dateCheck = checkEventDate(new Date(Date.now() + 86_400_000));
      const priceCheck = checkPriceRange(45, null);
      const dupCheck = checkForDuplicate("newhash123", new Set());

      expect(qrCheck).toBeNull();
      expect(dateCheck).toBeNull();
      expect(priceCheck).toBeNull();
      expect(dupCheck).toBeNull();
    });

    it("catches double-submit (same QR submitted twice)", () => {
      const qrHash = "deadbeef1234";
      const existingHashes = new Set([qrHash]);
      const result = checkForDuplicate(qrHash, existingHashes);
      expect(result?.code).toBe("ALREADY_LISTED");
    });

    it("catches listing for an expired event", () => {
      const result = checkEventDate(new Date("2020-06-15"));
      expect(result?.code).toBe("EXPIRED");
    });

    it("catches empty QR before any other check", () => {
      const result = checkQRText("");
      expect(result?.code).toBe("INVALID_FORMAT");
    });

    it("catches over-priced listing", () => {
      const result = checkPriceRange(200, 50); // max = 51
      expect(result?.code).toBe("INVALID_FORMAT");
    });
  });
});

// ---------------------------------------------------------------------------
// QR_ERROR_MESSAGES — all non-VALID codes have a message
// ---------------------------------------------------------------------------

describe("QR_ERROR_MESSAGES completeness", () => {
  it("has a friendly message for every non-VALID code", async () => {
    const { QR_ERROR_MESSAGES } = await import("../types/listings");

    const codes: Array<Exclude<QRValidationCode, "VALID">> = [
      "INVALID_FORMAT",
      "UNKNOWN_TICKET",
      "ALREADY_LISTED",
      "ALREADY_USED",
      "CANCELLED",
      "REFUNDED",
      "EXPIRED",
      "INTERNAL_ERROR",
    ];

    for (const code of codes) {
      expect(QR_ERROR_MESSAGES[code]).toBeTruthy();
      expect(typeof QR_ERROR_MESSAGES[code]).toBe("string");
    }
  });
});
