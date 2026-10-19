import { useServiceFeeForPrice } from "@/hooks/useServiceFee";
import { STUDIO_FEE_RULE_MAX } from "@/lib/studioFee";

/**
 * Under a tier's price field: what the buyer will pay and what the organizer
 * receives. The fee comes from the server; nothing is computed here (the rule
 * is only named, from src/lib/studioFee.ts).
 */
export const BuyerPaysHint = ({ priceEuros }: { priceEuros: number }) => {
  const priceCents = Math.round(priceEuros * 100);
  const feeCents = useServiceFeeForPrice(priceCents > 0 ? priceCents : null);
  if (priceCents <= 0) return null;
  const fee = feeCents === null ? null : feeCents / 100;
  return (
    <p className="text-[11px] text-muted-foreground mt-1.5 leading-snug">
      {fee === null ? (
        <>Buyer pays the ticket price plus a service fee ({STUDIO_FEE_RULE_MAX})</>
      ) : (
        <>
          Buyer pays <strong className="text-foreground">€{(priceEuros + fee).toFixed(2)}</strong> (incl. a €{fee.toFixed(2)} service fee: {STUDIO_FEE_RULE_MAX})
        </>
      )}
      {" "}· you receive the full{" "}
      <strong className="text-primary">€{priceEuros.toFixed(2)}</strong> per ticket — Ticket Safe takes 0% from you.
    </p>
  );
};
