import { describe, expect, it } from "vitest";
import { authPath, currentReturnPath, emailConfirmLanding, returnPathOr, safeReturnPath } from "@/lib/returnTo";

describe("safeReturnPath", () => {
  it.each([
    ["/", "/"],
    ["/e/gala-escp-2026", "/e/gala-escp-2026"],
    ["/marketplace/buy?q=gala", "/marketplace/buy?q=gala"],
    ["/checkout?listing_id=42", "/checkout?listing_id=42"],
    ["/my-tickets", "/my-tickets"],
    ["/studio/events/new#tiers", "/studio/events/new#tiers"],
  ])("accepts the internal path %s", (raw, expected) => {
    expect(safeReturnPath(raw)).toBe(expected);
  });

  it.each([
    null,
    undefined,
    "",
    "e/gala",
    "//evil.com",
    "//evil.com/path",
    "/\\evil.com",
    "/\\/evil.com",
    "https://evil.com",
    "http://ticket-safe.eu/profile",
    "javascript:alert(1)",
    " //evil.com",
    "/\nevil",
    "/\t/evil.com",
    "/auth",
    "/auth?next=/e/x",
    "/auth/confirm?token_hash=x",
  ])("rejects %s", (raw) => {
    expect(safeReturnPath(raw as string | null | undefined)).toBeNull();
  });

  it("never falls back to the account page", () => {
    expect(returnPathOr(null)).toBe("/");
    expect(returnPathOr("//evil.com")).toBe("/");
    expect(returnPathOr("/e/x")).toBe("/e/x");
  });
});

describe("authPath", () => {
  it("carries the return path", () => {
    expect(authPath("/e/gala")).toBe("/auth?next=%2Fe%2Fgala");
    expect(authPath("/checkout?listing_id=1")).toBe("/auth?next=%2Fcheckout%3Flisting_id%3D1");
    expect(authPath("/", { signup: true })).toBe("/auth?mode=signup&next=%2F");
  });

  it("drops an unsafe or missing return path", () => {
    expect(authPath(null)).toBe("/auth");
    expect(authPath("https://evil.com")).toBe("/auth");
    expect(authPath("/auth?next=/x", { signup: true })).toBe("/auth?mode=signup");
  });

  it("round-trips through the query string", () => {
    const href = authPath("/marketplace/sell?studio_ticket=abc");
    const next = new URLSearchParams(href.split("?")[1]).get("next");
    expect(returnPathOr(next)).toBe("/marketplace/sell?studio_ticket=abc");
  });
});

describe("currentReturnPath", () => {
  it("reads the page currently open", () => {
    expect(currentReturnPath({ pathname: "/e/gala", search: "?ref=lea", hash: "" })).toBe("/e/gala?ref=lea");
    expect(currentReturnPath({ pathname: "/auth", search: "?mode=signup" })).toBeNull();
  });
});

describe("emailConfirmLanding", () => {
  it("opens the page of origin after the email is confirmed", () => {
    expect(emailConfirmLanding("/e/gala")).toBe("/e/gala");
    expect(emailConfirmLanding("/p/" + "a".repeat(40))).toBe("/p/" + "a".repeat(40));
  });

  it("sends the home through the sign-in page so the email hook does not turn it into the account page", () => {
    expect(emailConfirmLanding("/")).toBe("/auth?next=%2F");
    expect(emailConfirmLanding(null)).toBe("/auth?next=%2F");
    expect(emailConfirmLanding("//evil.com")).toBe("/auth?next=%2F");
  });
});
