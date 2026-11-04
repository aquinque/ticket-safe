import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Banknote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

// Same floor the payout form enforces (€1.00).
const MIN_WITHDRAW_CENTS = 100;

const formatEur = (cents: number) => `€${(cents / 100).toFixed(2)}`;

/**
 * Header balance, only for a balance left from the resales sold before Stripe (paid outside
 * Stripe), with a Withdraw action. Otherwise nothing: Stripe pays resales automatically.
 */
const WalletBalanceButton = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [availableCents, setAvailableCents] = useState<number | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    let active = true;
    supabase
      .from("seller_earnings")
      .select("available_cents")
      .eq("seller_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (active) setAvailableCents((data as { available_cents?: number } | null)?.available_cents ?? 0);
      });
    return () => {
      active = false;
    };
  }, [user]);

  if (!user) return null;

  const balance = availableCents ?? 0;

  // Resales are paid to the seller's bank by Stripe after each event: there is nothing to withdraw,
  // and My wallet is already in the account menu, so nothing shows here. Only a balance left from
  // the resales sold before Stripe (paid outside Stripe; none are left today) shows, with Withdraw.
  if (availableCents === null || balance <= 0) return null;
  const canWithdraw = balance >= MIN_WITHDRAW_CENTS;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-2 h-9 px-3 rounded-md font-semibold text-sm text-foreground border border-border hover:bg-secondary transition-colors"
          aria-label="Wallet balance"
        >
          <Banknote className="w-4 h-4" />
          <span className="tabular-nums">{availableCents === null ? "…" : formatEur(balance)}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 space-y-3">
        <div>
          <div className="text-xs uppercase tracking-wider font-bold text-muted-foreground">Balance</div>
          <div className="text-2xl font-black text-foreground tabular-nums">{formatEur(balance)}</div>
        </div>
        <Button
          className="w-full"
          disabled={!canWithdraw}
          onClick={() => {
            setOpen(false);
            navigate("/settings/listings?withdraw=1");
          }}
        >
          Withdraw
        </Button>
        {!canWithdraw && <p className="text-xs text-muted-foreground">Minimum withdrawal is €1.00.</p>}
      </PopoverContent>
    </Popover>
  );
};

export default WalletBalanceButton;
