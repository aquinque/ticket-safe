import { Shield, ShieldCheck, Lock, QrCode, Banknote, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Variant = "verified" | "escrow" | "protected" | "qr-locked" | "refundable";
type Size = "sm" | "md";

const VARIANTS: Record<Variant, { Icon: typeof Shield; label: string }> = {
  verified:    { Icon: ShieldCheck, label: "Vérifié par TicketSafe" },
  escrow:      { Icon: Lock,        label: "Paiement sécurisé par Revolut" },
  protected:   { Icon: Shield,      label: "Protection acheteur incluse" },
  "qr-locked": { Icon: QrCode,      label: "QR signé · usage unique" },
  refundable:  { Icon: Banknote,    label: "Remboursé si l'événement est annulé" },
};

interface TrustBadgeProps {
  variant: Variant;
  /** Override the default label (e.g. localize, shorten). */
  label?: string;
  /** Center-align with horizontal spacing — used inside checkout panels. */
  inline?: boolean;
  size?: Size;
  className?: string;
}

/**
 * Single source of truth for trust signals across the funnel.
 * Replaces the scattered "Secured by Stripe" / "Verified by Ticket Safe" /
 * GDPR row / green-amber per-ticket pills that were all visually different.
 */
export function TrustBadge({ variant, label, inline = false, size = "sm", className }: TrustBadgeProps) {
  const { Icon, label: defaultLabel } = VARIANTS[variant];
  const text = label ?? defaultLabel;
  const isMd = size === "md";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 font-medium",
        isMd ? "text-sm" : "text-[11px]",
        inline ? "justify-center" : "",
        "text-foreground/70",
        className,
      )}
    >
      <Icon className={cn(isMd ? "w-4 h-4" : "w-3 h-3", "text-primary/80 shrink-0")} aria-hidden="true" />
      {text}
    </span>
  );
}

/**
 * The four promises — StubHub FanProtect-style. Render as a horizontal row
 * (desktop) or vertical stack (mobile) on /how-it-works and other trust
 * surfaces. One visual vocabulary, four concrete commitments.
 */
export function TrustPromises() {
  const PROMISES: { Icon: typeof Shield; title: string; sub: string }[] = [
    { Icon: ShieldCheck,  title: "Billet authentique",    sub: "Ou nous vous remboursons." },
    { Icon: Lock,         title: "Paiement sécurisé",     sub: "Via Revolut Business." },
    { Icon: QrCode,       title: "QR valide à l'entrée",   sub: "Signé, usage unique." },
    { Icon: CheckCircle2, title: "Annulation = remboursé", sub: "Sans question." },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
      {PROMISES.map(({ Icon, title, sub }) => (
        <div key={title} className="flex flex-col items-start gap-2 p-4 rounded-lg bg-card border border-border">
          <Icon className="w-5 h-5 text-primary" aria-hidden="true" />
          <div>
            <div className="text-sm font-semibold text-foreground">{title}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
