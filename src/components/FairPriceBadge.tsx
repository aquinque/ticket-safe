import { TrendingDown, Check, TrendingUp } from "lucide-react";
import { evaluateFairPrice } from "@/lib/fees";

/**
 * Small chip that tells the buyer how a resale price compares to the ticket's
 * face value ("12% below face value" / "Fair price" / "20% above face value").
 * Renders nothing when no face value is known.
 */
export const FairPriceBadge = ({
  sellingPrice,
  faceValue,
  className = "",
}: {
  sellingPrice: number;
  faceValue: number | null | undefined;
  className?: string;
}) => {
  const fp = evaluateFairPrice(sellingPrice, faceValue);
  if (!fp) return null;

  const tone =
    fp.tone === "good"
      ? "bg-emerald-100 text-emerald-700"
      : fp.tone === "fair"
        ? "bg-blue-100 text-blue-700"
        : "bg-amber-100 text-amber-700";
  const Icon = fp.tone === "good" ? TrendingDown : fp.tone === "fair" ? Check : TrendingUp;

  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full ${tone} ${className}`}
      title={`Face value €${fp.faceValue.toFixed(2)}`}
    >
      <Icon className="w-3 h-3" />
      {fp.label}
    </span>
  );
};
