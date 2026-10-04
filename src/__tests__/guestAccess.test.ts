import { describe, it, expect } from "vitest";
import { isWellFormedAccessToken, TICKET_QR_OPTIONS } from "../lib/guestAccess";

describe("access token shape", () => {
  it("accepts a 43-character base64url token", () => {
    expect(isWellFormedAccessToken("A".repeat(43))).toBe(true);
    expect(isWellFormedAccessToken("aZ09_-".repeat(7) + "a")).toBe(true);
  });
  it("rejects other lengths", () => {
    expect(isWellFormedAccessToken("A".repeat(42))).toBe(false);
    expect(isWellFormedAccessToken("A".repeat(44))).toBe(false);
  });
  it("rejects characters outside base64url, including padding", () => {
    expect(isWellFormedAccessToken("A".repeat(42) + "+")).toBe(false);
    expect(isWellFormedAccessToken("A".repeat(42) + "/")).toBe(false);
    expect(isWellFormedAccessToken("A".repeat(42) + "=")).toBe(false);
  });
  it("rejects missing or empty values", () => {
    expect(isWellFormedAccessToken(null)).toBe(false);
    expect(isWellFormedAccessToken(undefined)).toBe(false);
    expect(isWellFormedAccessToken("")).toBe(false);
  });
});

describe("QR parameters match the event-ticket-qr function", () => {
  // If you change these, change supabase/functions/event-ticket-qr/index.ts too.
  it("uses error correction L and a 4-module quiet zone", () => {
    expect(TICKET_QR_OPTIONS.errorCorrectionLevel).toBe("L");
    expect(TICKET_QR_OPTIONS.margin).toBe(4);
  });
  it("renders dark modules on a white background", () => {
    expect(TICKET_QR_OPTIONS.color).toEqual({ dark: "#000000", light: "#FFFFFF" });
  });
});
