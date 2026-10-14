import { useEffect, useState, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import { Plus, Copy, Check, Trash2, QrCode, Loader2, Share2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { StudioLayout } from "@/components/studio/StudioLayout";
import { SEOHead } from "@/components/SEOHead";
import { useAuth } from "@/hooks/useAuth";
import { useOrganizer } from "@/hooks/useOrganizer";
import { useThemeMode } from "@/hooks/useThemeMode";
import { supabase } from "@/integrations/supabase/client";
import { plural, relativeTime, whenLabel, phaseOf, startOfDay } from "@/lib/studioFormat";

interface EventOption {
  id: string;
  title: string;
  date: string;
}

// event_scan_staff is newer than the generated database types, so it is queried through a narrow typed wrapper.
type Thenable<T> = PromiseLike<{ data: T; error: { message: string } | null }>;
const staffTable = () =>
  (supabase as unknown as {
    from: (table: "event_scan_staff") => {
      select: (columns: string) => { in: (column: string, values: string[]) => { is: (column: string, value: null) => { order: (column: string, opts: { ascending: boolean }) => Thenable<unknown> } } };
      insert: (row: Record<string, unknown>) => Thenable<null>;
      update: (row: Record<string, unknown>) => { eq: (column: string, value: string) => Thenable<null> };
    };
  }).from("event_scan_staff");

interface StaffRow {
  id: string;
  label: string;
  token: string;
  created_at: string;
  last_used_at: string | null;
  scan_count: number;
  event_id: string;
}

/**
 * Door staff: scan links, across all events. A link opens the door scanner
 * for one event with no account and no login; the organizer hands it to a
 * volunteer or a bouncer. Each event still owns its links (ScanStaffPanel
 * on the event page); this page shows them all, grouped by event, with the
 * events that are coming up first.
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
  const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null);

  useEffect(() => {
    if (!confirmRevokeId) return;
    const t = setTimeout(() => setConfirmRevokeId(null), 4000);
    return () => clearTimeout(t);
  }, [confirmRevokeId]);

  const load = useCallback(async () => {
    if (!organizer) return;
    setLoading(true);
    const { data: eventData } = await supabase
      .from("events")
      .select("id, title, date")
      .eq("organizer_id", organizer.id)
      .neq("status", "cancelled")
      .order("date", { ascending: false });
    const all = (eventData as EventOption[]) ?? [];
    // Upcoming first (soonest at the top), then past, most recent first.
    const today = startOfDay(new Date()).getTime();
    const upcoming = all.filter((e) => startOfDay(new Date(e.date)).getTime() >= today).sort((a, b) => +new Date(a.date) - +new Date(b.date));
    const past = all.filter((e) => startOfDay(new Date(e.date)).getTime() < today);
    const evs = [...upcoming, ...past];
    setEvents(evs);
    if (!selectedEvent && evs.length > 0) setSelectedEvent(evs[0].id);

    if (evs.length === 0) {
      setRows([]);
      setLoading(false);
      return;
    }

    const { data, error } = await staffTable()
      .select("id, label, token, created_at, last_used_at, scan_count, event_id")
      .in("event_id", evs.map((e) => e.id))
      .is("revoked_at", null)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("[StudioTeam] load failed:", error);
      setRows([]);
    } else {
      setRows((data as StaffRow[]) ?? []);
    }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizer]);

  useEffect(() => {
    load();
  }, [load]);

  const groups = useMemo(
    () => events.map((e) => ({ event: e, links: rows.filter((r) => r.event_id === e.id) })).filter((g) => g.links.length > 0),
    [events, rows],
  );

  const createLink = async () => {
    const trimmed = label.trim();
    if (!trimmed) {
      toast.error("Give the link a name, like \"Main entrance\" or \"Léa\".");
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
      const { error } = await staffTable().insert({
        event_id: selectedEvent,
        organizer_id: organizer.id,
        label: trimmed,
        token,
        created_by: user.id,
      });
      if (error) throw error;
      setLabel("");
      await load();
      toast.success(`Link created for ${trimmed}. Copy it and send it over.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create the link.");
    } finally {
      setCreating(false);
    }
  };

  const revoke = async (id: string) => {
    const { error } = await staffTable()
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      toast.error("Could not revoke the link.");
      return;
    }
    setRows((prev) => prev.filter((r) => r.id !== id));
    setConfirmRevokeId(null);
    toast.success("Link revoked. It stops working right away.");
  };

  const linkUrl = (row: StaffRow) => `${window.location.origin}/scan/${row.token}`;

  const copyLink = async (row: StaffRow) => {
    try {
      await navigator.clipboard.writeText(linkUrl(row));
      setCopiedId(row.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      toast.error("Could not copy. Open the link and copy it from the address bar.");
    }
  };

  const shareLink = async (row: StaffRow, eventTitle: string) => {
    try {
      if (navigator.share) await navigator.share({ title: `Door scan · ${eventTitle}`, text: `Scan link for ${row.label}`, url: linkUrl(row) });
      else await copyLink(row);
    } catch { /* share sheet dismissed */ }
  };

  if (!user || orgLoading) {
    return (
      <StudioLayout active="team" organizer={null}>
        <div className="p-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      </StudioLayout>
    );
  }

  const active = rows.length;

  return (
    <StudioLayout active="team" organizer={organizer ? { name: organizer.name, logo_url: organizer.logo_url } : null}>
      <SEOHead title="Door staff · Studio" description="Scan links for your door staff, across all events." />
      <div className="p-4 md:p-6 max-w-4xl mx-auto">
        <div className="mb-5">
          <h1 className="text-xl md:text-2xl font-bold text-foreground">Door staff</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            A scan link opens the door scanner on any phone. No account, no login, one event per link. {active > 0 ? `${plural(active, "link")} active.` : ""}
          </p>
        </div>

        {events.length === 0 && !loading ? (
          <div className="text-center py-12 px-6 bg-card border border-border">
            <p className="text-sm text-muted-foreground mb-4">Links are tied to an event. Create one first.</p>
            <Link to="/studio/events/new" className="inline-flex items-center justify-center gap-2 px-5 min-h-[44px] font-bold bg-primary text-primary-foreground hover:bg-primary-hover">
              <Plus className="w-4 h-4" /> New event
            </Link>
          </div>
        ) : (
          <>
            <section className="bg-card border border-border p-4 md:p-5 mb-4" aria-labelledby="new-link-heading">
              <h2 id="new-link-heading" className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
                <QrCode className="w-4 h-4 text-primary" />
                New link
              </h2>
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto]">
                <select
                  value={selectedEvent}
                  onChange={(e) => setSelectedEvent(e.target.value)}
                  aria-label="Event"
                  className="h-11 px-3 border border-border bg-background text-sm font-semibold min-w-0"
                >
                  {events.map((e) => (
                    <option key={e.id} value={e.id}>{e.title} · {whenLabel(e.date)}</option>
                  ))}
                </select>
                <input
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="Who or where: Main entrance, Léa, VIP door"
                  aria-label="Link name"
                  maxLength={80}
                  className="h-11 px-3 border border-border bg-background text-sm min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onKeyDown={(e) => e.key === "Enter" && createLink()}
                />
                <button
                  type="button"
                  onClick={createLink}
                  disabled={creating}
                  className="inline-flex items-center justify-center gap-1.5 px-4 min-h-[44px] font-bold text-sm bg-primary text-primary-foreground hover:bg-primary-hover disabled:opacity-60"
                >
                  {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  Create link
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground mt-2">Name links after the person or the door, so you can see who scanned what and revoke one without touching the others.</p>
            </section>

            {loading ? (
              <div className="space-y-2">{[0, 1].map((i) => <div key={i} className="h-16 bg-muted animate-pulse" />)}</div>
            ) : groups.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-10 bg-card border border-border">No links yet. Create one above and send it to whoever works the door.</p>
            ) : (
              <div className="space-y-5">
                {groups.map(({ event, links }) => {
                  const phase = phaseOf(event.date);
                  return (
                    <section key={event.id} aria-labelledby={`links-${event.id}`}>
                      <div className="flex items-baseline justify-between mb-2">
                        <h2 id={`links-${event.id}`} className="text-sm font-bold truncate">
                          {event.title} <span className={`font-medium ${phase === "today" ? "text-emerald-700" : "text-muted-foreground"}`}>· {whenLabel(event.date)}</span>
                        </h2>
                        <span className="text-[11px] text-muted-foreground shrink-0">{plural(links.length, "link")}</span>
                      </div>
                      <ul className="bg-card border border-border divide-y divide-border">
                        {links.map((row) => {
                          const confirming = confirmRevokeId === row.id;
                          return (
                            <li key={row.id} className="flex items-center gap-3 px-4 py-3 min-h-[60px]">
                              <div className="flex-1 min-w-0">
                                <div className="font-semibold text-sm truncate">{row.label}</div>
                                <div className="text-[11px] text-muted-foreground truncate tabular-nums">
                                  {row.scan_count > 0 ? plural(row.scan_count, "scan") : "No scans yet"}
                                  {row.last_used_at ? ` · last used ${relativeTime(row.last_used_at)}` : ""}
                                  {` · created ${relativeTime(row.created_at)}`}
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => copyLink(row)}
                                className="inline-flex items-center gap-1.5 px-3 h-10 text-xs font-bold border border-border hover:bg-muted shrink-0"
                              >
                                {copiedId === row.id ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                                {copiedId === row.id ? "Copied" : "Copy"}
                              </button>
                              <button
                                type="button"
                                onClick={() => shareLink(row, event.title)}
                                title="Share"
                                aria-label={`Share the link for ${row.label}`}
                                className="w-10 h-10 border border-border text-muted-foreground hover:text-foreground hover:bg-muted flex items-center justify-center shrink-0"
                              >
                                <Share2 className="w-3.5 h-3.5" />
                              </button>
                              <a
                                href={linkUrl(row)}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="Open the scanner"
                                aria-label={`Open the scanner for ${row.label}`}
                                className="hidden sm:flex w-10 h-10 border border-border text-muted-foreground hover:text-foreground hover:bg-muted items-center justify-center shrink-0"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                              <button
                                type="button"
                                onClick={() => (confirming ? revoke(row.id) : setConfirmRevokeId(row.id))}
                                title={confirming ? "Tap again to revoke" : "Revoke this link"}
                                aria-label={confirming ? `Confirm revoking ${row.label}` : `Revoke ${row.label}`}
                                className={`h-10 border flex items-center justify-center shrink-0 text-xs font-bold transition-colors ${
                                  confirming ? "px-3 border-destructive text-destructive bg-destructive/10" : "w-10 border-border text-muted-foreground hover:text-destructive hover:border-destructive/40"
                                }`}
                              >
                                {confirming ? "Revoke?" : <Trash2 className="w-3.5 h-3.5" />}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </section>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </StudioLayout>
  );
};

export default StudioTeam;
