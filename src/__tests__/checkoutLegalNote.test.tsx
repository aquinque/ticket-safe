import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { CheckoutLegalNote } from "../components/checkout/CheckoutLegalNote";

const render = (el: JSX.Element) => renderToStaticMarkup(<MemoryRouter>{el}</MemoryRouter>);

describe("the notice shown before paying", () => {
  it("links the Terms and Refund Policy and says there is no 14-day withdrawal", () => {
    const html = render(<CheckoutLegalNote />);
    expect(html).toContain('href="/terms"');
    expect(html).toContain('href="/refund-policy"');
    expect(html).toContain("L221-28");
    expect(html).toContain("By paying");
    expect(html).not.toContain("resold by another user");
  });

  it("tells a resale buyer the seller is a private individual", () => {
    expect(render(<CheckoutLegalNote resale />)).toContain("resold by another user, not by a business");
  });

  it("says continuing, not paying, for a free ticket", () => {
    expect(render(<CheckoutLegalNote free />)).toContain("By continuing");
  });
});
