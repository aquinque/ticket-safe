import { Link } from "react-router-dom";

/**
 * Information the buyer must see before paying (French Consumer Code, art. L221-5 and L111-7):
 * the Terms they accept, that the 14-day withdrawal right does not apply to tickets for a dated
 * event (art. L221-28 12°), and, on resale, that the seller is a private individual.
 */
export function CheckoutLegalNote({ resale = false, free = false }: { resale?: boolean; free?: boolean }) {
  return (
    <p className="text-[11px] leading-relaxed text-muted-foreground text-center">
      By {free ? "continuing" : "paying"} you accept the{" "}
      <Link to="/terms" className="underline underline-offset-2 hover:text-foreground">Terms</Link> and the{" "}
      <Link to="/refund-policy" className="underline underline-offset-2 hover:text-foreground">Refund Policy</Link>.
      {" "}Tickets are for an event on a set date, so the 14-day right to cancel does not apply (art. L221-28 12°,
      French Consumer Code).
      {resale && (
        <>
          {" "}This ticket is resold by another user, not by a business: the consumer rights that apply when you buy
          from a business do not apply to the sale itself. Ticket Safe's Refund Policy still covers your payment.
        </>
      )}
    </p>
  );
}
