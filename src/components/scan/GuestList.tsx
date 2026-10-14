import { useEffect, useMemo, useState } from "react";
import { Search, CheckCircle2, Loader2, Users } from "lucide-react";
import { Input } from "@/components/ui/input";

/**
 * Guest list for the door: everyone holding a ticket for the event, checked
 * in or not, with a one-tap "Check in" for the guest whose QR is lost and a
 * two-tap "Undo" for a mis-tap. Shared by the organizer scanner and the
 * door-staff scanner; the parent owns the data (polled) and the calls.
 */

export interface Guest {
  id: string;
  name: string;
  tier_name: string | null;
  email_hint: string | null;
  status: "valid" | "scanned";
  scanned_at: string | null;
}

type Filter = "all" | "out" | "in";

interface Props {
  guests: Guest[];
  totals: { scanned: number; total: number } | null;
  /** First load finished (even if empty). */
  loaded: boolean;
  /** Guest whose check-in / undo call is in flight. */
  busyId: string | null;
  onCheckIn: (guest: Guest) => void;
  onUndo: (guest: Guest) => void;
  className?: string;
}

const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

/** Diacritic-insensitive, case-insensitive "contains". */
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export const GuestList = ({ guests, totals, loaded, busyId, onCheckIn, onUndo, className = "" }: Props) => {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  // Undo is two taps: the first turns the button into "Sure?" for 4 seconds.
  const [confirmUndoId, setConfirmUndoId] = useState<string | null>(null);
  useEffect(() => {
    if (!confirmUndoId) return;
    const t = setTimeout(() => setConfirmUndoId(null), 4000);
    return () => clearTimeout(t);
  }, [confirmUndoId]);

  const scannedCount = totals?.scanned ?? guests.filter((g) => g.status === "scanned").length;
  const totalCount = totals?.total ?? guests.length;
  const pct = totalCount > 0 ? Math.round((scannedCount / totalCount) * 100) : 0;

  const shown = useMemo(() => {
    const q = norm(query.trim());
    return guests.filter((g) => {
      if (filter === "in" && g.status !== "scanned") return false;
      if (filter === "out" && g.status === "scanned") return false;
      if (!q) return true;
      return norm(`${g.name} ${g.tier_name ?? ""} ${g.email_hint ?? ""}`).includes(q);
    });
  }, [guests, query, filter]);

  const outCount = guests.length - guests.filter((g) => g.status === "scanned").length;

  return (
    <section className={`rounded-2xl border border-border bg-card p-4 ${className}`} aria-labelledby="guest-list-heading">
      <div className="flex items-center justify-between gap-2 mb-1">
        <h2 id="guest-list-heading" className="text-sm font-bold flex items-center gap-1.5">
          <Users className="w-4 h-4 text-primary" />
          Guest list
        </h2>
        <span className="text-xs font-bold tabular-nums text-muted-foreground">
          <span className="text-foreground">{scannedCount}</span>/{totalCount} in
        </span>
      </div>
      <div className="h-1 w-full bg-muted overflow-hidden mb-3" aria-hidden>
        <div className="h-full bg-emerald-500 transition-[width] duration-500 ease-out" style={{ width: `${pct}%` }} />
      </div>

      <div className="relative mb-2">
        <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <Input
          type="search"
          inputMode="search"
          autoComplete="off"
          placeholder="Find a name"
          aria-label="Find a guest"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-9 h-11"
        />
      </div>

      <div className="flex gap-1.5 mb-3" role="tablist" aria-label="Filter guests">
        {([
          ["all", "All", guests.length],
          ["out", "Not in", outCount],
          ["in", "In", guests.length - outCount],
        ] as [Filter, string, number][]).map(([key, label, n]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={filter === key}
            onClick={() => setFilter(key)}
            className={`min-h-[36px] px-3 text-xs font-bold rounded-full border transition-colors ${
              filter === key ? "bg-foreground text-background border-foreground" : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {label} <span className="tabular-nums opacity-70">{n}</span>
          </button>
        ))}
      </div>

      {!loaded ? (
        <div className="space-y-2" aria-busy>
          {[0, 1, 2].map((i) => <div key={i} className="h-12 bg-muted animate-pulse" />)}
        </div>
      ) : guests.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-6">No tickets sold yet. Guests appear here as soon as they buy.</p>
      ) : shown.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-6">
          {query ? `No one matches "${query}".` : filter === "in" ? "No one checked in yet." : "Everyone is in."}
        </p>
      ) : (
        <ul className="divide-y divide-border max-h-[60vh] overflow-y-auto -mx-1">
          {shown.map((g) => {
            const isIn = g.status === "scanned";
            const busy = busyId === g.id;
            const confirming = confirmUndoId === g.id;
            return (
              <li key={g.id} className={`flex items-center gap-3 px-1 py-2 min-h-[56px] ${isIn ? "opacity-80" : ""}`}>
                <span
                  aria-hidden
                  className={`w-2.5 h-2.5 rounded-full shrink-0 ${isIn ? "bg-emerald-500" : "border-2 border-border"}`}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate">{g.name}</p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {[g.tier_name, g.email_hint].filter(Boolean).join(" · ")}
                    {isIn && g.scanned_at ? `${g.tier_name || g.email_hint ? " · " : ""}in at ${fmtTime(g.scanned_at)}` : ""}
                  </p>
                </div>
                {isIn ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => (confirming ? (setConfirmUndoId(null), onUndo(g)) : setConfirmUndoId(g.id))}
                    className={`shrink-0 min-h-[44px] px-3 text-xs font-bold rounded-lg border transition-colors disabled:opacity-60 ${
                      confirming ? "border-destructive text-destructive bg-destructive/10" : "border-border text-muted-foreground hover:text-foreground"
                    }`}
                    aria-label={confirming ? `Confirm undo check-in for ${g.name}` : `Undo check-in for ${g.name}`}
                  >
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : confirming ? "Sure?" : "Undo"}
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onCheckIn(g)}
                    className="shrink-0 min-h-[44px] px-3.5 inline-flex items-center gap-1.5 text-xs font-bold rounded-lg bg-primary text-primary-foreground hover:bg-primary-hover transition-colors disabled:opacity-60"
                    aria-label={`Check in ${g.name}`}
                  >
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    Check in
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-[11px] text-muted-foreground mt-3">
        Lost ticket? Find the name and tap Check in. Every manual check-in is logged.
      </p>
    </section>
  );
};
