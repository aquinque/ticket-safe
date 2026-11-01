import { useServiceFeeForPrice } from "@/hooks/useServiceFee";
import { formatMajor } from "@/lib/money";
import { studioFeeRuleWithMin } from "@/lib/studioFee";

/**
 * Under a tier's price field: what the buyer will pay and what the organizer
 * receives, in the event's currency. The fee comes from the server; nothing is
 * computed here (the rule is only named, from src/lib/studioFee.ts).
 */
export const BuyerPaysHint = ({ priceEuros, currency = "EUR" }: { priceEuros: number; currency?: string }) => {
  const priceCents = Math.round(priceEuros * 100);
  const feeCents = useServiceFeeForPrice(priceCents > 0 ? priceCents : null, currency);
  if (priceCents <= 0) return null;
  const fee = feeCents === null ? null : feeCents / 100;
  const rule = studioFeeRuleWithMin(currency);
  return (
    <p className="text-[11px] text-muted-foreground mt-1.5 leading-snug">
      {fee === null ? (
        <>Buyer pays the ticket price plus a service fee ({rule})</>
      ) : (
        <>
          Buyer pays <strong className="text-foreground">{formatMajor(priceEuros + fee, currency)}</strong> (incl. a {formatMajor(fee, currency)} service fee: {rule})
        </>
      )}
      {" "}· you receive the full{" "}
      <strong className="text-primary">{formatMajor(priceEuros, currency)}</strong> per ticket — Ticket Safe takes 0% from you.
    </p>
  );
};
