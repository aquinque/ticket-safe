import { useCallback, useEffect, useState } from "react";
import { Tag, Plus, Trash2, Percent, Euro } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface PromoCodeRow {
  id: string;
  code: string;
  discount_type: "percent" | "fixed";
  discount_value: number;
  max_uses: number | null;
  used_count: number;
  is_active: boolean;
  created_at: string;
}

/**
 * Studio panel to create/manage per-event promo codes. Discounts apply to
 * the ticket price only (never the flat €1.40 buyer service fee) — see the
 * promo_code handling in revolut-create-checkout.
 */
export const PromoCodesPanel = ({ eventId }: { eventId: string }) => {
  const [rows, setRows] = useState<PromoCodeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState("");
  const [discountType, setDiscountType] = useState<"percent" | "fixed">("percent");
  const [discountValue, setDiscountValue] = useState("10");
  const [maxUses, setMaxUses] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("event_promo_codes")
      .select("id, code, discount_type, discount_value, max_uses, used_count, is_active, created_at")
      .eq("event_id", eventId)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("[PromoCodesPanel] load failed:", error);
    } else {
      setRows((data as PromoCodeRow[]) ?? []);
    }
    setLoading(false);
  }, [eventId]);

  useEffect(() => {
    load();
  }, [load]);

  const createCode = async () => {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed || trimmed.length < 2) {
      toast.error("Give the code a name, e.g. \"EARLYBIRD\".");
      return;
    }
    const value = parseInt(discountValue, 10);
    if (!Number.isFinite(value) || value <= 0 || (discountType === "percent" && value > 100)) {
      toast.error(discountType === "percent" ? "Enter a percentage between 1 and 100." : "Enter a discount amount in cents.");
      return;
    }
    setCreating(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { error } = await supabase.from("event_promo_codes").insert({
        event_id: eventId,
        code: trimmed,
        discount_type: discountType,
        discount_value: discountType === "fixed" ? Math.round(value * 100) : value,
        max_uses: maxUses.trim() ? Math.max(1, parseInt(maxUses, 10)) : null,
        created_by: user?.id ?? null,
      });
      if (error) throw error;
      setCode("");
      setMaxUses("");
      await load();
      toast.success("Promo code created.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create the code — it may already exist.");
    } finally {
      setCreating(false);
    }
  };

  const toggleActive = async (row: PromoCodeRow) => {
    const { error } = await supabase
      .from("event_promo_codes")
      .update({ is_active: !row.is_active })
      .eq("id", row.id);
    if (error) {
      toast.error("Could not update the code.");
      return;
    }
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, is_active: !r.is_active } : r)));
  };

  const deleteCode = async (id: string) => {
    const { error } = await supabase.from("event_promo_codes").delete().eq("id", id);
    if (error) {
      toast.error("Could not delete the code.");
      return;
    }
    setRows((prev) => prev.filter((r) => r.id !== id));
    toast.success("Code deleted.");
  };

  return (
    <section className="bg-card border border-border rounded-2xl p-5 md:p-6">
      <div className="flex items-center justify-between mb-2 gap-3">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Tag className="w-4 h-4 text-primary" />
          Promo codes
        </h2>
        <span className="text-xs text-muted-foreground">{rows.length} code{rows.length === 1 ? "" : "s"}</span>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        Discounts apply to the ticket price only — buyers still pay the flat €1.40 service fee.
      </p>

      <div className="flex flex-wrap gap-2 mb-4">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="e.g. EARLYBIRD"
          maxLength={40}
          className="flex-1 min-w-[140px] px-3 py-2 rounded-lg border border-border bg-background text-sm uppercase"
        />
        <select
          value={discountType}
          onChange={(e) => setDiscountType(e.target.value as "percent" | "fixed")}
          className="px-3 py-2 rounded-lg border border-border bg-background text-sm"
        >
          <option value="percent">% off</option>
          <option value="fixed">€ off</option>
        </select>
        <input
          type="number"
          value={discountValue}
          onChange={(e) => setDiscountValue(e.target.value)}
          min="1"
          max={discountType === "percent" ? 100 : undefined}
          className="w-20 px-3 py-2 rounded-lg border border-border bg-background text-sm"
        />
        <input
          type="number"
          value={maxUses}
          onChange={(e) => setMaxUses(e.target.value)}
          placeholder="Max uses"
          min="1"
          className="w-24 px-3 py-2 rounded-lg border border-border bg-background text-sm"
        />
        <button
          type="button"
          onClick={createCode}
          disabled={creating}
          className="inline-flex items-center gap-1.5 px-4 min-h-[40px] rounded-lg font-bold text-sm bg-primary text-primary-foreground hover:bg-primary-hover disabled:opacity-60 shrink-0"
        >
          <Plus className="w-4 h-4" />
          Create
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="text-center py-6 text-sm text-muted-foreground border border-dashed border-border rounded-xl">
          No promo codes yet.
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => (
            <div key={row.id} className="flex items-center gap-3 p-3 rounded-lg border border-border">
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                {row.discount_type === "percent" ? <Percent className="w-4 h-4 text-primary" /> : <Euro className="w-4 h-4 text-primary" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-mono font-bold text-sm truncate">{row.code}</div>
                <div className="text-xs text-muted-foreground">
                  {row.discount_type === "percent" ? `${row.discount_value}% off` : `€${(row.discount_value / 100).toFixed(2)} off`}
                  {" · "}
                  {row.used_count} used{row.max_uses ? ` / ${row.max_uses}` : ""}
                </div>
              </div>
              <button
                type="button"
                onClick={() => toggleActive(row)}
                className={`px-3 h-9 rounded-lg text-xs font-bold border shrink-0 ${
                  row.is_active
                    ? "border-success/40 text-success hover:bg-success/10"
                    : "border-border text-muted-foreground hover:bg-muted"
                }`}
              >
                {row.is_active ? "Active" : "Paused"}
              </button>
              <button
                type="button"
                onClick={() => deleteCode(row.id)}
                title="Delete this code"
                className="w-9 h-9 rounded-lg border border-border text-muted-foreground hover:text-destructive hover:border-destructive/40 flex items-center justify-center shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};
