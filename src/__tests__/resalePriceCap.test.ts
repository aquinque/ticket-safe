import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { checkResalePrice, parseResaleCap } from "../../supabase/functions/_shared/resalePriceCap";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("reading resale_price_cap()", () => {
  it("takes the first row of the set the RPC returns", () => {
    expect(parseResaleCap([{ cap_cents: 2400, source: "face_value_markup", face_value_cents: 2000 }]))
      .toEqual({ capCents: 2400, source: "face_value_markup", faceValueCents: 2000 });
  });

  it("means no cap when there is no row, no amount or an unknown source", () => {
    expect(parseResaleCap([])).toEqual({ capCents: null, source: "none", faceValueCents: null });
    expect(parseResaleCap(null).capCents).toBeNull();
    expect(parseResaleCap([{ cap_cents: null, source: "none", face_value_cents: null }]).capCents).toBeNull();
    expect(parseResaleCap([{ cap_cents: 3000, source: "???" }]).source).toBe("none");
  });
});

describe("checking the final price against the cap", () => {
  const organizer = { capCents: 3000, source: "organizer_event" as const, faceValueCents: null };
  const faceValue = { capCents: 2400, source: "face_value_markup" as const, faceValueCents: 2000 };

  it("lets any price through when there is no cap", () => {
    expect(checkResalePrice(999_900, { capCents: null, source: "none", faceValueCents: null }, false)).toEqual({ ok: true });
  });

  it("accepts a price at or under the cap", () => {
    expect(checkResalePrice(3000, organizer, false)).toEqual({ ok: true });
    expect(checkResalePrice(2399, faceValue, true)).toEqual({ ok: true });
  });

  it("refuses an offer agreed in chat above the organizer's maximum, telling the buyer what to do", () => {
    expect(checkResalePrice(3500, organizer, true)).toEqual({
      ok: false,
      error:
        "The price agreed in chat (€35.00 per ticket) is above the maximum resale price the organizer set for this ticket (€30.00). Ask the seller for a new offer of €30.00 or less.",
    });
  });

  it("refuses a listing price above face value + markup, naming the face value", () => {
    expect(checkResalePrice(2500, faceValue, false)).toEqual({
      ok: false,
      error:
        "This listing's price (€25.00 per ticket) is above the resale cap for this ticket (€24.00, based on its €20.00 face value). The seller needs to lower the price before it can be bought.",
    });
  });
});

describe("the checkout enforces it", () => {
  it("checks the cap on the final price (offer or listing) before reserving the ticket", () => {
    const checkout = read("supabase/functions/stripe-connect-resale-checkout/index.ts");
    const offerAt = checkout.indexOf('.from("offers")');
    const capAt = checkout.indexOf('rpc("resale_price_cap"');
    const checkAt = checkout.indexOf("checkResalePrice(unitCents, parseResaleCap(capRow), negotiatedPrice != null)");
    const reserveAt = checkout.indexOf('rpc("reserve_resale_listing"');
    expect(offerAt).toBeGreaterThan(-1);
    expect(capAt).toBeGreaterThan(offerAt);
    expect(checkAt).toBeGreaterThan(capAt);
    expect(reserveAt).toBeGreaterThan(checkAt);
  });

  it("is also checked by the legacy Revolut checkout", () => {
    expect(read("supabase/functions/revolut-resale-checkout/index.ts")).toMatch(/checkResalePrice\(/);
  });
});
