import { useCallback, useEffect, useState } from "react";
import { Users, Plus, Copy, Check, Trash2, QrCode } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface ScanStaffRow {
  id: string;
  label: string;
  token: string;
  created_at: string;
  revoked_at: string | null;
  last_used_at: string | null;
  scan_count: number;
}

/**
 * Studio panel for handing out door-scan access without sharing the
 * organizer's own login: each row is a named, revocable link
 * (/scan/:token) scoped to exactly this event, with scan-only permission.
 * See supabase/migrations/20260929120000_event_scan_staff.sql and the
 * staff_token path in validate-event-ticket.
 */
export const ScanStaffPanel = ({ eventId }: { eventId: string }) => {
  const [rows, setRows] = useState<ScanStaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [label, setLabel] = useState("");
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("event_scan_staff")
      .select("id, label, token, created_at, revoked_at, last_used_at, scan_count")
      .eq("event_id", eventId)
      .is("revoked_at", null)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("[ScanStaffPanel] load failed:", error);
    } else {
      setRows((data as ScanStaffRow[]) ?? []);
    }
    setLoading(false);
  }, [eventId]);

  useEffect(() => {
    load();
  }, [load]);

  const createLink = async () => {
    const trimmed = label.trim();
    if (!trimmed) {
      toast.error("Give this link a name (e.g. \"Main entrance\", \"Léa — bénévole\").");
      return;
    }
    setCreating(true);
    try {
      // Client-generated token: crypto.randomUUID() gives 122 bits of
      // entropy, unguessable enough for a door-scan bearer link. RLS on
      // event_scan_staff restricts the insert to this event's own
      // organizer, so there's no separate edge function needed here.
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in.");

      const { data: organizer } = await supabase
        .from("organizer_profiles")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!organizer) throw new Error("Organizer profile not found.");

      const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "").slice(0, 16);
      const { error } = await supabase.from("event_scan_staff").insert({
        event_id: eventId,
        organizer_id: organizer.id,
        label: trimmed,
        token,
        created_by: user.id,
      });
      if (error) throw error;
      setLabel("");
      await load();
      toast.success("Scan link created.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create the link.");
    } finally {
      setCreating(false);
    }
  };

  const revoke = async (id: string) => {
    const { error } = await supabase
      .from("event_scan_staff")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      toast.error("Could not revoke the link.");
      return;
    }
    setRows((prev) => prev.filter((r) => r.id !== id));
    toast.success("Link revoked.");
  };

  const copyLink = async (row: ScanStaffRow) => {
    const url = `${window.location.origin}/scan/${row.token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(row.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      toast.error("Could not copy — long-press the link to copy it manually.");
    }
  };

  return (
    <section className="bg-card border border-border rounded-2xl p-5 md:p-6">
      <div className="flex items-center justify-between mb-2 gap-3">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <QrCode className="w-4 h-4 text-primary" />
          Scan staff
        </h2>
        <span className="text-xs text-muted-foreground">{rows.length} active link{rows.length === 1 ? "" : "s"}</span>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        Give door staff or volunteers a scan link for this event — they don't need an account or your
        login. Each link only lets them scan tickets for this event.
      </p>

      <div className="flex gap-2 mb-4">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g. Main entrance, Léa — bénévole"
          maxLength={80}
          className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-sm"
          onKeyDown={(e) => e.key === "Enter" && createLink()}
        />
        <button
          type="button"
          onClick={createLink}
          disabled={creating}
          className="inline-flex items-center gap-1.5 px-4 min-h-[40px] rounded-lg font-bold text-sm bg-primary text-primary-foreground hover:bg-primary-hover disabled:opacity-60 shrink-0"
        >
          <Plus className="w-4 h-4" />
          Create link
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="text-center py-6 text-sm text-muted-foreground border border-dashed border-border rounded-xl">
          No scan links yet. Create one above to share with your door team.
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => (
            <div key={row.id} className="flex items-center gap-3 p-3 rounded-lg border border-border">
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Users className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm truncate">{row.label}</div>
                <div className="text-xs text-muted-foreground">
                  {row.scan_count} scan{row.scan_count === 1 ? "" : "s"}
                  {row.last_used_at && ` · last used ${new Date(row.last_used_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}`}
                </div>
              </div>
              <button
                type="button"
                onClick={() => copyLink(row)}
                className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg text-xs font-bold border border-border hover:bg-muted shrink-0"
              >
                {copiedId === row.id ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedId === row.id ? "Copied" : "Copy link"}
              </button>
              <button
                type="button"
                onClick={() => revoke(row.id)}
                title="Revoke this link"
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
