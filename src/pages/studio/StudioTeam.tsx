import { useEffect, useState, useCallback } from "react";
import { Users, Plus, Copy, Check, Trash2, QrCode, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { StudioLayout } from "@/components/studio/StudioLayout";
import { SEOHead } from "@/components/SEOHead";
import { useAuth } from "@/hooks/useAuth";
import { useOrganizer } from "@/hooks/useOrganizer";
import { useThemeMode } from "@/hooks/useThemeMode";
import { supabase } from "@/integrations/supabase/client";

interface EventOption {
  id: string;
  title: string;
}

interface StaffRow {
  id: string;
  label: string;
  token: string;
  created_at: string;
  last_used_at: string | null;
  scan_count: number;
  event_id: string;
  event_title: string;
}

/**
 * Cross-event view of door-scan staff links (the sidebar's "Team / Staff").
 * Each event still owns its own links (see ScanStaffPanel on the per-event
 * dashboard) — this page just lets an organizer running several events see
 * and manage all of them from one place instead of opening each event.
 */
const StudioTeam = () => {
  useThemeMode("studio");
  const { user } = useAuth();
  const { organizer, loading: orgLoading } = useOrganizer();
  const [events, setEvents] = useState<EventOption[]>([]);
  const [rows, setRows] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [label, setLabel] = useState("");
  const [selectedEvent, setSelectedEvent] = useState("");
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!organizer) return;
    setLoading(true);
    const { data: eventData } = await supabase
      .from("events")
      .select("id, title")
      .eq("organizer_id", organizer.id)
      .order("date", { ascending: false });
    const evs = (eventData as EventOption[]) ?? [];
    setEvents(evs);
    if (!selectedEvent && evs.length > 0) setSelectedEvent(evs[0].id);

    if (evs.length === 0) {
      setRows([]);
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("event_scan_staff")
      .select("id, label, token, created_at, last_used_at, scan_count, event_id")
      .in("event_id", evs.map((e) => e.id))
      .is("revoked_at", null)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("[StudioTeam] load failed:", error);
      setRows([]);
    } else {
      const titleById = new Map(evs.map((e) => [e.id, e.title]));
      setRows(
        ((data as Omit<StaffRow, "event_title">[]) ?? []).map((r) => ({
          ...r,
          event_title: titleById.get(r.event_id) ?? "Unknown event",
        })),
      );
    }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizer]);

  useEffect(() => {
    load();
  }, [load]);

  const createLink = async () => {
    const trimmed = label.trim();
    if (!trimmed) {
      toast.error("Give this link a name (e.g. \"Main entrance\", \"Léa — volunteer\").");
      return;
    }
    if (!selectedEvent) {
      toast.error("Choose which event this link is for.");
      return;
    }
    if (!organizer || !user) return;
    setCreating(true);
    try {
      const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "").slice(0, 16);
      const { error } = await supabase.from("event_scan_staff").insert({
        event_id: selectedEvent,
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

  const copyLink = async (row: StaffRow) => {
    const url = `${window.location.origin}/scan/${row.token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(row.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      toast.error("Could not copy — long-press the link to copy it manually.");
    }
  };

  if (!user || orgLoading) {
    return (
      <StudioLayout active="team" organizer={null}>
        <div className="p-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      </StudioLayout>
    );
  }

  return (
    <StudioLayout active="team" organizer={organizer ? { name: organizer.name, logo_url: organizer.logo_url } : null}>
      <SEOHead title="Team / Staff · Studio" description="Door-scan access for your team, across all events." />
      <div className="p-4 md:p-6 max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl md:text-2xl font-bold text-foreground">Team / Staff</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Give door staff or volunteers a scan link — they don't need an account or your login. Each link only scans tickets for the event it was made for.
          </p>
        </div>

        {events.length === 0 && !loading ? (
          <div className="text-center py-12 text-sm text-muted-foreground border border-dashed border-border rounded-2xl">
            Create an event first — scan links are tied to one event each.
          </div>
        ) : (
          <>
            <section className="bg-card border border-border rounded-2xl p-5 md:p-6 mb-6">
              <h2 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
                <QrCode className="w-4 h-4 text-primary" />
                New scan link
              </h2>
              <div className="flex flex-wrap gap-2">
                <select
                  value={selectedEvent}
                  onChange={(e) => setSelectedEvent(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-border bg-background text-sm max-w-[220px]"
                >
                  {events.map((e) => (
                    <option key={e.id} value={e.id}>{e.title}</option>
                  ))}
                </select>
                <input
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="e.g. Main entrance, Léa — volunteer"
                  maxLength={80}
                  className="flex-1 min-w-[160px] px-3 py-2 rounded-lg border border-border bg-background text-sm"
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
            </section>

            <section className="bg-card border border-border rounded-2xl p-5 md:p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <Users className="w-4 h-4 text-primary" />
                  Active links
                </h2>
                <span className="text-xs text-muted-foreground">{rows.length} active</span>
              </div>
              {loading ? (
                <div className="py-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
              ) : rows.length === 0 ? (
                <div className="text-center py-6 text-sm text-muted-foreground border border-dashed border-border rounded-xl">
                  No scan links yet. Create one above.
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
                        <div className="text-xs text-muted-foreground truncate">
                          {row.event_title} · {row.scan_count} scan{row.scan_count === 1 ? "" : "s"}
                          {row.last_used_at && ` · last used ${new Date(row.last_used_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}`}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => copyLink(row)}
                        className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg text-xs font-bold border border-border hover:bg-muted shrink-0"
                      >
                        {copiedId === row.id ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
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
          </>
        )}
      </div>
    </StudioLayout>
  );
};

export default StudioTeam;
