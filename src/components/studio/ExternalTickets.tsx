/**
 * ExternalTickets — Studio UI for the External Ticket Import feature.
 *
 * Renders inside StudioEventEdit (the event is already chosen). Two parts:
 *   1. ExternalTicketsSection — management view: every imported allocation for
 *      the event, grouped by category, with counts (available/sold/used/
 *      cancelled), price editing, publish/draft toggle, cancel-unsold, source
 *      provider, and CSV export.
 *   2. ImportWizard (dialog) — the 5-step import flow:
 *        Method -> Details -> Preview -> Confirm.
 *
 * Everything new to external tickets is commented. The buyer/checkout side is
 * untouched: an imported allocation is just an event_tier flagged
 * source='external', so it sells through the normal Revolut flow.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Building2,
  Upload,
  FileText,
  Loader2,
  Check,
  Tag,
  Trash2,
  Download,
  Eye,
  EyeOff,
  Hash,
  Files,
  AlertTriangle,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  Ticket as TicketIcon,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { parseExternalTicketsCsv, type ParsedExternalRow } from "@/lib/externalTicketsCsv";

// ── Types ────────────────────────────────────────────────────────────────
interface ExtTier {
  id: string;
  name: string;
  price_cents: number;
  is_active: boolean;
}
interface ExtRow {
  id: string;
  tier_id: string;
  status: "draft" | "available" | "sold" | "cancelled" | "used";
  external_code: string | null;
  external_reference: string | null;
  original_provider: string | null;
  uploaded_file_url: string | null;
  notes: string | null;
  platform_price_cents: number | null;
  created_at: string;
}

const euros = (cents: number | null | undefined) => `€${((cents ?? 0) / 100).toFixed(2)}`;

const STATUS_STYLE: Record<ExtRow["status"], string> = {
  available: "bg-emerald-50 text-emerald-700 border-emerald-200",
  sold: "bg-primary/10 text-primary border-primary/20",
  used: "bg-slate-100 text-slate-600 border-slate-200",
  cancelled: "bg-red-50 text-red-700 border-red-200",
  draft: "bg-amber-50 text-amber-700 border-amber-200",
};

function csvDownload(filename: string, rows: string[][]) {
  const esc = (v: unknown) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const text = rows.map((r) => r.map(esc).join(",")).join("\n");
  const blob = new Blob([text], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ════════════════════════════════════════════════════════════════════════
// Management section
// ════════════════════════════════════════════════════════════════════════
export function ExternalTicketsSection({
  eventId,
  eventPublished,
  onChanged,
}: {
  eventId: string;
  eventPublished: boolean;
  onChanged?: () => void;
}) {
  const [tiers, setTiers] = useState<ExtTier[]>([]);
  const [rows, setRows] = useState<ExtRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [busyTier, setBusyTier] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: t }, { data: r }] = await Promise.all([
      supabase
        .from("event_tiers")
        .select("id, name, price_cents, is_active")
        .eq("event_id", eventId)
        .eq("source", "external")
        .order("sort_order"),
      supabase
        .from("external_ticket_inventory")
        .select("id, tier_id, status, external_code, external_reference, original_provider, uploaded_file_url, notes, platform_price_cents, created_at")
        .eq("event_id", eventId)
        .order("created_at", { ascending: false }),
    ]);
    setTiers((t as ExtTier[]) ?? []);
    setRows((r as ExtRow[]) ?? []);
    setLoading(false);
  }, [eventId]);

  useEffect(() => {
    load();
  }, [load]);

  const rowsByTier = useMemo(() => {
    const m = new Map<string, ExtRow[]>();
    for (const row of rows) {
      const arr = m.get(row.tier_id) ?? [];
      arr.push(row);
      m.set(row.tier_id, arr);
    }
    return m;
  }, [rows]);

  const refresh = () => {
    load();
    onChanged?.();
  };

  // ── Per-tier actions ─────────────────────────────────────────────────
  const setTierPrice = async (tier: ExtTier, euroStr: string) => {
    const cents = Math.round(parseFloat(euroStr) * 100);
    if (!Number.isFinite(cents) || cents < 50) {
      toast.error("Enter a price of at least €0.50.");
      return;
    }
    setBusyTier(tier.id);
    const { error } = await supabase.from("event_tiers").update({ price_cents: cents }).eq("id", tier.id);
    setBusyTier(null);
    if (error) toast.error(error.message);
    else { toast.success("Price updated."); refresh(); }
  };

  const togglePublish = async (tier: ExtTier) => {
    setBusyTier(tier.id);
    const nextActive = !tier.is_active;
    // Flip the tier's sale state AND the matching allocations between
    // draft<->available so drafts can never be sold and re-drafting hides
    // only the still-unsold ones.
    const { error: e1 } = await supabase.from("event_tiers").update({ is_active: nextActive }).eq("id", tier.id);
    const { error: e2 } = await supabase
      .from("external_ticket_inventory")
      .update({ status: nextActive ? "available" : "draft" })
      .eq("tier_id", tier.id)
      .eq("status", nextActive ? "draft" : "available");
    setBusyTier(null);
    if (e1 || e2) toast.error((e1 ?? e2)?.message ?? "Could not update.");
    else { toast.success(nextActive ? "Published — on sale." : "Moved to draft."); refresh(); }
  };

  const cancelUnsold = async (tier: ExtTier) => {
    const ids = (rowsByTier.get(tier.id) ?? [])
      .filter((r) => r.status === "available" || r.status === "draft")
      .map((r) => r.id);
    if (ids.length === 0) { toast.info("No unsold tickets to cancel."); return; }
    if (!confirm(`Cancel ${ids.length} unsold "${tier.name}" ticket${ids.length > 1 ? "s" : ""}? Sold tickets are not affected.`)) return;
    setBusyTier(tier.id);
    const { data, error } = await supabase.rpc("external_cancel_rows", { p_row_ids: ids });
    setBusyTier(null);
    if (error) toast.error(error.message);
    else { toast.success(`Cancelled ${data ?? ids.length} ticket${(data ?? ids.length) > 1 ? "s" : ""}.`); refresh(); }
  };

  const exportTier = (tier: ExtTier) => {
    const list = rowsByTier.get(tier.id) ?? [];
    const header = ["Category", "Provider", "Ticket code", "Reference", "Status", "Price", "Notes", "Imported"];
    const body = list.map((r) => [
      tier.name,
      r.original_provider ?? "",
      r.external_code ?? "",
      r.external_reference ?? "",
      r.status,
      euros(r.platform_price_cents ?? tier.price_cents),
      r.notes ?? "",
      new Date(r.created_at).toLocaleString("en-GB"),
    ]);
    csvDownload(`external-${tier.name.replace(/\s+/g, "-").toLowerCase()}.csv`, [header, ...body]);
  };

  const count = (list: ExtRow[], s: ExtRow["status"]) => list.filter((r) => r.status === s).length;

  return (
    <section className="bg-card border border-border rounded-2xl p-5 md:p-6 mb-6">
      <div className="flex items-center justify-between mb-2 gap-3">
        <div className="flex items-center gap-2">
          <Building2 className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-bold">External tickets</h2>
        </div>
        <button
          onClick={() => setWizardOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 min-h-[36px] rounded-lg text-sm font-bold text-white bg-primary hover:shadow-md transition-all"
        >
          <Upload className="w-4 h-4" />
          Import tickets
        </button>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        Import allocations from nightclubs or partners (codes, QR/PDF files, or a fixed quantity),
        set your selling price, and they sell through Ticket Safe like any other ticket.
      </p>

      {loading ? (
        <div className="py-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : tiers.length === 0 ? (
        <div className="border border-dashed border-border rounded-xl p-6 text-center">
          <TicketIcon className="w-7 h-7 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">
            No imported tickets yet. Use <span className="font-semibold text-foreground">Import tickets</span> to add a partner allocation.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {tiers.map((tier) => {
            const list = rowsByTier.get(tier.id) ?? [];
            const provider = list.find((r) => r.original_provider)?.original_provider ?? null;
            const busy = busyTier === tier.id;
            return (
              <div key={tier.id} className="border border-border rounded-xl p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold">{tier.name}</span>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${tier.is_active ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}>
                        {tier.is_active ? "On sale" : "Draft"}
                      </span>
                    </div>
                    {provider && (
                      <div className="text-xs text-muted-foreground mt-0.5 inline-flex items-center gap-1">
                        <Building2 className="w-3 h-3" /> Source: {provider}
                      </div>
                    )}
                  </div>
                  {/* Inline price editor */}
                  <PriceEditor tier={tier} disabled={busy} onSave={(v) => setTierPrice(tier, v)} />
                </div>

                {/* Counts */}
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {(["available", "sold", "used", "cancelled", "draft"] as const).map((s) => {
                    const n = count(list, s);
                    if (n === 0) return null;
                    return (
                      <span key={s} className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold border ${STATUS_STYLE[s]}`}>
                        {n} {s}
                      </span>
                    );
                  })}
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold border bg-muted text-muted-foreground border-border">
                    {list.length} total
                  </span>
                </div>

                {/* Actions */}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    onClick={() => togglePublish(tier)}
                    disabled={busy || !eventPublished}
                    title={!eventPublished ? "Publish the event first to put tickets on sale" : undefined}
                    className="inline-flex items-center gap-1.5 px-2.5 min-h-[32px] rounded-lg text-xs font-bold bg-muted hover:bg-muted/80 border border-border disabled:opacity-50"
                  >
                    {tier.is_active ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    {tier.is_active ? "Move to draft" : "Put on sale"}
                  </button>
                  <button
                    onClick={() => exportTier(tier)}
                    className="inline-flex items-center gap-1.5 px-2.5 min-h-[32px] rounded-lg text-xs font-bold bg-muted hover:bg-muted/80 border border-border"
                  >
                    <Download className="w-3.5 h-3.5" /> Export CSV
                  </button>
                  <button
                    onClick={() => cancelUnsold(tier)}
                    disabled={busy}
                    className="inline-flex items-center gap-1.5 px-2.5 min-h-[32px] rounded-lg text-xs font-bold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 disabled:opacity-50"
                  >
                    {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    Cancel unsold
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {wizardOpen && (
        <ImportWizard
          eventId={eventId}
          eventPublished={eventPublished}
          existingTiers={tiers}
          onClose={() => setWizardOpen(false)}
          onDone={() => { setWizardOpen(false); refresh(); }}
        />
      )}
    </section>
  );
}

// Inline editable price for an external tier.
function PriceEditor({ tier, disabled, onSave }: { tier: ExtTier; disabled: boolean; onSave: (euroStr: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState((tier.price_cents / 100).toFixed(2));
  useEffect(() => { setVal((tier.price_cents / 100).toFixed(2)); }, [tier.price_cents]);
  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="inline-flex items-center gap-1.5 px-2.5 min-h-[34px] rounded-lg text-sm font-bold text-primary bg-primary/5 hover:bg-primary/10 border border-primary/15"
      >
        {euros(tier.price_cents)}
        <Tag className="w-3.5 h-3.5" />
      </button>
    );
  }
  return (
    <div className="flex items-center gap-1.5">
      <div className="relative">
        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">€</span>
        <input
          type="number"
          step="0.01"
          min="0.5"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          className="w-24 pl-5 pr-2 h-[34px] rounded-lg border border-border bg-background text-sm font-semibold"
          autoFocus
        />
      </div>
      <button
        disabled={disabled}
        onClick={() => { onSave(val); setEditing(false); }}
        className="inline-flex items-center justify-center w-[34px] h-[34px] rounded-lg bg-primary text-white disabled:opacity-50"
      >
        <Check className="w-4 h-4" />
      </button>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// Import wizard
// ════════════════════════════════════════════════════════════════════════
type Method = "manual" | "csv" | "files";
type Step = 1 | 2 | 3 | 4;

function ImportWizard({
  eventId,
  eventPublished,
  existingTiers,
  onClose,
  onDone,
}: {
  eventId: string;
  eventPublished: boolean;
  existingTiers: ExtTier[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { user } = useAuth();
  const [step, setStep] = useState<Step>(1);
  const [method, setMethod] = useState<Method>("manual");

  // Details
  const [targetTier, setTargetTier] = useState<string>("new"); // "new" or an existing external tier id
  const [tierName, setTierName] = useState("");
  const [priceEur, setPriceEur] = useState("");
  const [provider, setProvider] = useState("");
  const [notes, setNotes] = useState("");
  const [publish, setPublish] = useState(eventPublished); // default to on-sale only if event already live

  // Method-specific input
  const [quantity, setQuantity] = useState("");
  const [csvRows, setCsvRows] = useState<ParsedExternalRow[]>([]);
  const [csvName, setCsvName] = useState<string>("");
  const [files, setFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Preview / submit
  const [preview, setPreview] = useState<{ total: number; to_insert: number; duplicates: string[]; with_code: number; with_file: number } | null>(null);
  const [busy, setBusy] = useState(false);

  const creatingTier = targetTier === "new";

  // How many tickets this import will create (before dedup).
  const plannedCount = method === "manual"
    ? (parseInt(quantity, 10) || 0)
    : method === "csv"
      ? csvRows.length
      : files.length;

  const detailsValid = (() => {
    if (creatingTier) {
      if (tierName.trim().length < 1) return false;
      const cents = Math.round(parseFloat(priceEur) * 100);
      if (!Number.isFinite(cents) || cents < 50) return false;
    }
    return plannedCount > 0;
  })();

  // Build the row payload sent to the edge function (files carry no codes yet —
  // they're uploaded at confirm time and turned into paths there).
  const buildRows = (): ParsedExternalRow[] => {
    if (method === "csv") return csvRows;
    return []; // manual + files use quantity / uploaded paths
  };

  const handleCsv = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = parseExternalTicketsCsv(text);
      if (parsed.rows.length === 0) { toast.error("No rows found in that CSV."); return; }
      setCsvRows(parsed.rows);
      setCsvName(file.name);
      toast.success(`Parsed ${parsed.rows.length} row${parsed.rows.length > 1 ? "s" : ""}.`);
    } catch {
      toast.error("Could not read that file.");
    }
  };

  const callImport = async (dryRun: boolean) => {
    const payload: Record<string, unknown> = {
      event_id: eventId,
      method: method === "manual" ? "manual" : "list",
      publish,
      dry_run: dryRun,
      original_provider: provider.trim() || undefined,
      notes: notes.trim() || undefined,
    };
    if (creatingTier) {
      payload.tier_name = tierName.trim();
      payload.price_cents = Math.round(parseFloat(priceEur) * 100);
    } else {
      payload.tier_id = targetTier;
    }
    if (method === "manual") payload.quantity = parseInt(quantity, 10) || 0;
    else payload.rows = buildRows();
    return supabase.functions.invoke("import-external-tickets", { body: payload });
  };

  // Preview step — for csv/manual we can dry-run the dedup; for files we just
  // show the count (no codes to dedup).
  const goPreview = async () => {
    if (method === "files") {
      setPreview({ total: files.length, to_insert: files.length, duplicates: [], with_code: 0, with_file: files.length });
      setStep(3);
      return;
    }
    setBusy(true);
    const { data, error } = await callImport(true);
    setBusy(false);
    if (error || (data as { error?: string })?.error) {
      toast.error((data as { error?: string })?.error ?? error?.message ?? "Could not validate the import.");
      return;
    }
    setPreview((data as { preview: typeof preview }).preview);
    setStep(3);
  };

  // Upload one file per ticket into the private bucket, return PATHS.
  const uploadFiles = async (): Promise<string[]> => {
    if (!user) throw new Error("Not signed in.");
    const paths: string[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const ext = (f.name.split(".").pop() || "bin").toLowerCase();
      const safe = `${Date.now()}-${i}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const path = `${user.id}/${eventId}/${safe}`;
      const { error } = await supabase.storage.from("external-tickets").upload(path, f, { cacheControl: "3600", upsert: false });
      if (error) throw new Error(`Upload failed for ${f.name}: ${error.message}`);
      paths.push(path);
    }
    return paths;
  };

  const confirm = async () => {
    setBusy(true);
    try {
      let resp;
      if (method === "files") {
        // Upload first, then import rows that reference the uploaded paths.
        const paths = await uploadFiles();
        const payload: Record<string, unknown> = {
          event_id: eventId,
          method: "list",
          publish,
          original_provider: provider.trim() || undefined,
          notes: notes.trim() || undefined,
          rows: paths.map((p) => ({ uploaded_file_url: p })),
        };
        if (creatingTier) { payload.tier_name = tierName.trim(); payload.price_cents = Math.round(parseFloat(priceEur) * 100); }
        else payload.tier_id = targetTier;
        resp = await supabase.functions.invoke("import-external-tickets", { body: payload });
      } else {
        resp = await callImport(false);
      }
      const { data, error } = resp;
      if (error || (data as { error?: string })?.error) {
        toast.error((data as { error?: string })?.error ?? error?.message ?? "Import failed.");
        return;
      }
      const r = data as { inserted: number; skipped_duplicates: string[] };
      toast.success(
        `Imported ${r.inserted} ticket${r.inserted > 1 ? "s" : ""}${r.skipped_duplicates?.length ? `, skipped ${r.skipped_duplicates.length} duplicate${r.skipped_duplicates.length > 1 ? "s" : ""}` : ""}.`,
      );
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unexpected error.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5 text-primary" /> Import external tickets
          </DialogTitle>
          <DialogDescription>
            Step {step} of 4 · {step === 1 ? "Choose method" : step === 2 ? "Ticket details & price" : step === 3 ? "Preview" : "Confirm"}
          </DialogDescription>
        </DialogHeader>

        {/* Stepper */}
        <div className="flex items-center gap-1.5 mb-2">
          {[1, 2, 3, 4].map((s) => (
            <div key={s} className={`h-1.5 flex-1 rounded-full ${s <= step ? "bg-primary" : "bg-muted"}`} />
          ))}
        </div>

        {/* ── Step 1: Method ── */}
        {step === 1 && (
          <div className="space-y-2.5">
            {([
              { id: "manual", icon: Hash, title: "By quantity", desc: "A fixed number of tickets. Ticket Safe issues its own QR per ticket." },
              { id: "csv", icon: FileText, title: "CSV of codes", desc: "Upload a CSV with ticket_code / reference / type / provider / notes." },
              { id: "files", icon: Files, title: "Upload ticket files", desc: "One QR/PDF file per ticket — buyers get the original at the door." },
            ] as const).map((m) => (
              <button
                key={m.id}
                onClick={() => setMethod(m.id)}
                className={`w-full text-left flex items-start gap-3 p-3.5 rounded-xl border-2 transition-all ${method === m.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
              >
                <m.icon className={`w-5 h-5 mt-0.5 shrink-0 ${method === m.id ? "text-primary" : "text-muted-foreground"}`} />
                <div className="min-w-0">
                  <div className="font-bold text-sm">{m.title}</div>
                  <div className="text-xs text-muted-foreground">{m.desc}</div>
                </div>
                {method === m.id && <Check className="w-4 h-4 text-primary ml-auto shrink-0" />}
              </button>
            ))}
          </div>
        )}

        {/* ── Step 2: Details ── */}
        {step === 2 && (
          <div className="space-y-4">
            {/* Category: new or existing */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Ticket category</label>
              <select
                value={targetTier}
                onChange={(e) => setTargetTier(e.target.value)}
                className="w-full h-[42px] px-3 rounded-lg border border-border bg-background text-sm font-semibold"
              >
                <option value="new">+ New category…</option>
                {existingTiers.map((t) => (
                  <option key={t.id} value={t.id}>{t.name} ({euros(t.price_cents)})</option>
                ))}
              </select>
            </div>

            {creatingTier && (
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Category name</label>
                  <input
                    value={tierName}
                    onChange={(e) => setTierName(e.target.value)}
                    placeholder="e.g. Club Entry, VIP, Early Bird"
                    className="w-full h-[42px] px-3 rounded-lg border border-border bg-background text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Selling price</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">€</span>
                    <input
                      type="number" step="0.01" min="0.5"
                      value={priceEur}
                      onChange={(e) => setPriceEur(e.target.value)}
                      placeholder="15.00"
                      className="w-full h-[42px] pl-7 pr-3 rounded-lg border border-border bg-background text-sm font-semibold"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Method-specific input */}
            {method === "manual" && (
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5">How many tickets?</label>
                <input
                  type="number" min="1" max="5000"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="e.g. 50"
                  className="w-full h-[42px] px-3 rounded-lg border border-border bg-background text-sm font-semibold"
                />
              </div>
            )}
            {method === "csv" && (
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5">CSV file</label>
                <label className="flex items-center gap-2 px-3 h-[42px] rounded-lg border border-dashed border-border bg-background text-sm cursor-pointer hover:border-primary/40">
                  <FileText className="w-4 h-4 text-muted-foreground" />
                  <span className="truncate">{csvName || "Choose a .csv file…"}</span>
                  <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleCsv(f); }} />
                </label>
                {csvRows.length > 0 && <p className="text-xs text-emerald-700 mt-1.5">{csvRows.length} ticket{csvRows.length > 1 ? "s" : ""} ready.</p>}
                <p className="text-[11px] text-muted-foreground mt-1.5">Columns: ticket_code, external_reference, ticket_type, original_provider, notes.</p>
              </div>
            )}
            {method === "files" && (
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Ticket files (one per ticket)</label>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full flex items-center justify-center gap-2 px-3 h-[42px] rounded-lg border border-dashed border-border bg-background text-sm hover:border-primary/40"
                >
                  <Upload className="w-4 h-4 text-muted-foreground" />
                  {files.length > 0 ? `${files.length} file${files.length > 1 ? "s" : ""} selected` : "Choose PDF / image files…"}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="application/pdf,image/*"
                  className="hidden"
                  onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
                />
              </div>
            )}

            {/* Shared optional fields */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Provider / source (optional)</label>
              <input
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                placeholder="e.g. Teatro Kapital"
                className="w-full h-[42px] px-3 rounded-lg border border-border bg-background text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Internal notes (optional)</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Anything your team should know about this batch."
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm resize-none"
              />
            </div>

            {/* Draft vs available */}
            <label className="flex items-center gap-2.5 p-3 rounded-lg border border-border cursor-pointer">
              <input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} className="w-4 h-4 accent-[hsl(220_100%_30%)]" />
              <div>
                <div className="text-sm font-semibold">Put on sale immediately</div>
                <div className="text-xs text-muted-foreground">
                  {eventPublished ? "Uncheck to save as a draft you can publish later." : "The event is a draft — these will save as a draft until you publish the event."}
                </div>
              </div>
            </label>
          </div>
        )}

        {/* ── Step 3: Preview ── */}
        {step === 3 && preview && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Stat label="To import" value={String(preview.to_insert)} accent />
              <Stat label="Category" value={creatingTier ? (tierName || "—") : (existingTiers.find((t) => t.id === targetTier)?.name ?? "—")} />
              <Stat label="Price each" value={creatingTier ? `€${(parseFloat(priceEur) || 0).toFixed(2)}` : euros(existingTiers.find((t) => t.id === targetTier)?.price_cents)} />
              <Stat label="On sale" value={publish ? "Yes" : "Draft"} />
            </div>
            {preview.with_file > 0 && (
              <p className="text-xs text-muted-foreground">{preview.with_file} file{preview.with_file > 1 ? "s" : ""} will be uploaded securely and attached to each ticket.</p>
            )}
            {preview.duplicates.length > 0 && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">{preview.duplicates.length} duplicate code{preview.duplicates.length > 1 ? "s" : ""}</span> will be skipped (already in this event):
                  <span className="break-all"> {preview.duplicates.slice(0, 8).join(", ")}{preview.duplicates.length > 8 ? "…" : ""}</span>
                </div>
              </div>
            )}
            {preview.to_insert === 0 && (
              <p className="text-sm text-red-600 font-semibold">Nothing to import — every row was a duplicate.</p>
            )}
          </div>
        )}

        {/* ── Step 4: Confirm ── */}
        {step === 4 && (
          <div className="text-center py-4">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
              <Sparkles className="w-6 h-6 text-primary" />
            </div>
            <p className="text-sm">
              Import <span className="font-bold">{preview?.to_insert ?? plannedCount}</span> ticket{(preview?.to_insert ?? plannedCount) > 1 ? "s" : ""}
              {publish ? " and put them on sale" : " as a draft"}?
            </p>
          </div>
        )}

        {/* Footer nav */}
        <div className="flex items-center justify-between gap-2 pt-2">
          <button
            onClick={() => (step === 1 ? onClose() : setStep((step - 1) as Step))}
            className="inline-flex items-center gap-1.5 px-3 min-h-[40px] rounded-lg text-sm font-bold bg-muted hover:bg-muted/80 border border-border"
          >
            <ChevronLeft className="w-4 h-4" /> {step === 1 ? "Cancel" : "Back"}
          </button>

          {step === 1 && (
            <button onClick={() => setStep(2)} className="inline-flex items-center gap-1.5 px-4 min-h-[40px] rounded-lg text-sm font-bold text-white bg-primary hover:shadow-md">
              Next <ChevronRight className="w-4 h-4" />
            </button>
          )}
          {step === 2 && (
            <button
              onClick={goPreview}
              disabled={!detailsValid || busy}
              className="inline-flex items-center gap-1.5 px-4 min-h-[40px] rounded-lg text-sm font-bold text-white bg-primary hover:shadow-md disabled:opacity-50"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Preview <ChevronRight className="w-4 h-4" /></>}
            </button>
          )}
          {step === 3 && (
            <button
              onClick={() => setStep(4)}
              disabled={(preview?.to_insert ?? 0) === 0}
              className="inline-flex items-center gap-1.5 px-4 min-h-[40px] rounded-lg text-sm font-bold text-white bg-primary hover:shadow-md disabled:opacity-50"
            >
              Continue <ChevronRight className="w-4 h-4" />
            </button>
          )}
          {step === 4 && (
            <button
              onClick={confirm}
              disabled={busy}
              className="inline-flex items-center gap-1.5 px-4 min-h-[40px] rounded-lg text-sm font-bold text-white bg-primary hover:shadow-md disabled:opacity-50"
            >
              {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Importing…</> : <><Check className="w-4 h-4" /> Confirm import</>}
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${accent ? "border-primary/20 bg-primary/5" : "border-border bg-muted/40"}`}>
      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-lg font-black ${accent ? "text-primary" : "text-foreground"}`}>{value}</div>
    </div>
  );
}
