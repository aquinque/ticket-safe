import { useEffect, useState } from "react";
import { ShieldCheck, BadgeCheck, CalendarDays, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface SellerStats {
  full_name: string | null;
  university: string | null;
  campus: string | null;
  member_since: string | null;
  completed_sales: number;
}

/**
 * Buyer-facing trust panel for a resale seller. Profiles are private (RLS), so
 * we read non-sensitive public stats through the `seller_public_stats` RPC:
 * display name, verified-student status, member-since year, completed sales.
 */
export const SellerTrust = ({
  sellerId,
  fallbackName,
}: {
  sellerId: string;
  fallbackName?: string;
}) => {
  const [stats, setStats] = useState<SellerStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      // seller_public_stats isn't in the generated types yet.
      const { data, error } = await (supabase as unknown as {
        rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
      }).rpc("seller_public_stats", { p_seller_id: sellerId });
      if (cancelled) return;
      const row = Array.isArray(data) ? (data[0] as SellerStats | undefined) : null;
      if (!error && row) setStats(row);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [sellerId]);

  const name = stats?.full_name || fallbackName || "Verified student";
  const isVerifiedStudent = !!(stats?.university && /escp/i.test(stats.university));
  const memberYear = stats?.member_since ? new Date(stats.member_since).getFullYear() : null;
  const sales = stats?.completed_sales ?? 0;

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <span className="text-sm font-bold text-primary">
            {name.trim().charAt(0).toUpperCase() || "S"}
          </span>
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">Sold by</p>
          <p className="font-semibold truncate">{loading ? "…" : name}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {isVerifiedStudent && (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
            <BadgeCheck className="w-3 h-3" />
            Verified ESCP student
          </span>
        )}
        {sales > 0 && (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
            <ShieldCheck className="w-3 h-3" />
            {sales} successful sale{sales > 1 ? "s" : ""}
          </span>
        )}
        {memberYear && (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
            <CalendarDays className="w-3 h-3" />
            Member since {memberYear}
          </span>
        )}
      </div>

      <div className="mt-3 pt-3 border-t border-border flex items-start gap-2 text-xs text-muted-foreground">
        <Lock className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
        <span>
          Buyer protection: your payment is held securely and only released to the seller after the
          ticket is transferred to you.
        </span>
      </div>
    </div>
  );
};
