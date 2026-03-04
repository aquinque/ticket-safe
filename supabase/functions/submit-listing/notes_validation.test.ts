/**
 * Notes field allowlist validation tests
 *
 * Run with:  deno test notes_validation.test.ts
 *
 * These tests verify that the allowlist in submit-listing correctly rejects
 * injection payloads and accepts legitimate notes.
 */

import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";

// Mirror of the allowlist defined in the Edge Function
const NOTES_ALLOWLIST = /^[a-zA-Z0-9\s.,!?'"()\-]*$/;

function validateNotes(raw: unknown): { ok: boolean; error?: string; value: string | null } {
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  if (trimmed.length > 1000) {
    return { ok: false, error: "Notes must be 1000 characters or fewer", value: null };
  }
  if (trimmed.length > 0 && !NOTES_ALLOWLIST.test(trimmed)) {
    return { ok: false, error: "Notes contain invalid characters", value: null };
  }
  return { ok: true, value: trimmed.length > 0 ? trimmed : null };
}

// ---------------------------------------------------------------------------
// Legitimate inputs — should pass
// ---------------------------------------------------------------------------

Deno.test("accepts empty notes", () => {
  assertEquals(validateNotes(""), { ok: true, value: null });
  assertEquals(validateNotes(null), { ok: true, value: null });
  assertEquals(validateNotes(undefined), { ok: true, value: null });
});

Deno.test("accepts normal text notes", () => {
  assertEquals(validateNotes("Seat A12, row 3").ok, true);
  assertEquals(validateNotes("General admission ticket, valid all day.").ok, true);
  assertEquals(validateNotes("Two tickets - together preferred!").ok, true);
});

Deno.test("accepts whitespace-only as empty", () => {
  assertEquals(validateNotes("   "), { ok: true, value: null });
});

// ---------------------------------------------------------------------------
// Injection payloads — must be rejected
// ---------------------------------------------------------------------------

Deno.test("rejects HTML script injection", () => {
  const r = validateNotes("<script>alert('xss')</script>");
  assertEquals(r.ok, false);
});

Deno.test("rejects HTML tag injection", () => {
  const r = validateNotes("<img src=x onerror=alert(1)>");
  assertEquals(r.ok, false);
});

Deno.test("rejects event handler injection", () => {
  const r = validateNotes("onclick=stealCookies()");
  assertEquals(r.ok, false);
});

Deno.test("rejects SQL injection attempt", () => {
  // Semicolons and angle-brackets are outside the allowlist
  const r = validateNotes("'; DROP TABLE tickets; --");
  assertEquals(r.ok, false);
});

Deno.test("rejects URL injection", () => {
  const r = validateNotes("https://evil.com/steal?c=<data>");
  assertEquals(r.ok, false);
});

Deno.test("rejects notes exceeding 1000 chars", () => {
  const r = validateNotes("a".repeat(1001));
  assertEquals(r.ok, false);
  assertEquals(r.error, "Notes must be 1000 characters or fewer");
});

Deno.test("accepts exactly 1000 chars", () => {
  const r = validateNotes("a".repeat(1000));
  assertEquals(r.ok, true);
});
