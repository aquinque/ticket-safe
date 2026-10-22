import { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, ArchiveRestore, Check, ChevronDown, Copy, Loader2, Megaphone, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { eur, plural, relativeTime } from "@/lib/studioFormat";
import {
  PROMOTER_LINKS_MAX,
  PROMOTER_NAME_MAX,
  conversionRate,
  createPromoterLink,
  fetchPromoterStats,
  formatRate,
  orderPromoterLinks,
  promoterLinkUrl,
  promoterShare,
  setPromoterLinkArchived,
  type PromoterDay,
  type PromoterLinkStats,
  type PromoterStats,
} from "@/lib/promoterLinks";

const money = (cents: number) => eur(cents, cents % 100 === 0 ? 0 : 2);
const count = (n: number) => n.toLocaleString("en-GB");
const dayLabel = (day: string) =>
  new Date(`${day}T12:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });

/** Visits per day over the last 14 days. A darker bar is a day with at least one sale. */
const DaysChart = ({ series }: { series: PromoterDay[] }) => {
  const max = Math.max(1, ...series.map((d) => d.visits));
  const visits = series.reduce((sum, d) => sum + d.visits, 0);
  return (
    <div
      className="flex items-end gap-[3px] h-9 w-full"
      role="img"
      aria-label={`${plural(visits, "visit")} in the last ${series.length} days`}
    >
      {series.map((d) => {
        const sold = d.tickets > 0;
        const height = d.visits > 0 ? Math.max(14, Math.round((d.visits / max) * 100)) : sold ? 14 : 5;
        return (
          <div
            key={d.day}
            title={`${dayLabel(d.day)}: ${plural(d.visits, "visit")}${sold ? `, ${plural(d.tickets, "ticket")} sold` : ""}`}
            className={`flex-1 min-w-[3px] ${sold ? "bg-primary" : "bg-primary/25"}`}
            style={{ height: `${height}%` }}
          />
        );
      })}
    </div>
  );
};

const Figure = ({ label, value, hint }: { label: string; value: string; hint: string }) => (
  <div title={hint} className="min-w-0">
    <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground truncate">{label}</div>
    <div className="font-display text-xl font-bold tabular-nums leading-tight mt-0.5">{value}</div>
  </div>
);

interface LinkCardProps {
  link: PromoterLinkStats;
  url: string;
  isNew: boolean;
  copied: boolean;
  busy: boolean;
  onCopy: () => void;
  onArchive: () => void;
}

const LinkCard = ({ link, url, isNew, copied, busy, onCopy, onArchive }: LinkCardProps) => {
  const rate = conversionRate(link.visits, link.paidOrders);
  const base = url.replace(/^https?:\/\//, "").replace(/\?ref=.*$/, "");
  return (
    <li className={`px-4 md:px-5 py-4 ${isNew ? "bg-primary/[0.04]" : ""}`}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-sm truncate">{link.name}</div>
          <div className="text-xs text-muted-foreground truncate mt-0.5" title={url}>
            <span className="hidden sm:inline">{base}</span>?ref={link.code}
          </div>
        </div>
        <button
          type="button"
          onClick={onCopy}
          aria-label={`Copy the link for ${link.name}`}
          className="shrink-0 inline-flex items-center justify-center gap-1.5 px-3 min-h-[40px] text-xs font-bold bg-primary text-primary-foreground hover:bg-primary-hover transition-colors"
        >
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? "Copied" : "Copy link"}
        </button>
        <button
          type="button"
          onClick={onArchive}
          disabled={busy}
          title="Archive this link. It stops counting; its numbers stay."
          aria-label={`Archive the link for ${link.name}`}
          className="shrink-0 w-10 min-h-[40px] flex items-center justify-center bg-card border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-60"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Archive className="w-3.5 h-3.5" />}
        </button>
      </div>

      <div className="mt-3 grid grid-cols-3 sm:grid-cols-5 gap-x-4 gap-y-3">
        <Figure label="Visits" value={count(link.visits)} hint="Times your page was opened from this link." />
        <Figure label="Checkouts" value={count(link.checkouts)} hint="Checkouts started from this link, paid or not." />
        <Figure label="Tickets sold" value={count(link.tickets)} hint="Tickets in paid orders that came from this link." />
        <Figure label="Revenue" value={money(link.revenueCents)} hint="What you receive for those tickets. The service fee is paid by the buyer on top and is not included." />
        <Figure label="Conversion" value={formatRate(rate)} hint="Paid orders per visit." />
      </div>

      <div className="mt-3 max-w-sm">
        <div className="flex items-baseline justify-between gap-3 text-[11px] text-muted-foreground mb-1">
          <span>Visits per day · darker bars: a sale</span>
          <span className="shrink-0">{link.lastSaleAt ? `Last sale ${relativeTime(link.lastSaleAt)}` : "No sale yet"}</span>
        </div>
        <DaysChart series={link.series} />
      </div>
    </li>
  );
};

/**
 * Studio card under the event's main share link: one named link per promoter (street team, student society,
 * an Instagram page...), each opening the same ticket page, with what each one brought.
 * Data and rules: src/lib/promoterLinks.ts and supabase/migrations/20261021120000_event_promoter_links.sql.
 */
export const PromoterLinksPanel = ({ eventId, slug, userId }: { eventId: string; slug: string; userId: string | null }) => {
  const [stats, setStats] = useState<PromoterStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [newId, setNewId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  // Returns what it loaded so a caller that needs the fresh list (a link was just created) does not read it twice.
  const load = useCallback(async (): Promise<PromoterStats | null> => {
    setRefreshing(true);
    try {
      const fresh = await fetchPromoterStats(eventId);
      setStats(fresh);
      setFailed(false);
      return fresh;
    } catch (err) {
      console.error("[PromoterLinksPanel] load failed:", err);
      setFailed(true);
      return null;
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [eventId]);

  useEffect(() => {
    load();
  }, [load]);

  // Sales and visits arrive while the organizer is elsewhere: refresh when they come back to the tab.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);

  const ordered = useMemo(() => (stats ? orderPromoterLinks(stats.links, newId) : []), [stats, newId]);
  const active = ordered.filter((l) => !l.archivedAt);
  const archived = ordered.filter((l) => l.archivedAt);
  const share = stats ? promoterShare(stats) : null;
  const atLimit = active.length >= PROMOTER_LINKS_MAX;

  const create = async () => {
    if (!name.trim()) {
      toast.error("Give the link the promoter's name.");
      return;
    }
    setCreating(true);
    try {
      const code = await createPromoterLink(eventId, name, userId);
      setName("");
      toast.success("Link created. Copy it and send it to the promoter.");
      // The row id is only known once the list reloads, but the code is: pin the link that carries it on top.
      const fresh = await load();
      setNewId(fresh?.links.find((l) => l.code === code)?.id ?? null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create the link.");
    } finally {
      setCreating(false);
    }
  };

  const copy = async (link: PromoterLinkStats) => {
    try {
      await navigator.clipboard.writeText(promoterLinkUrl(slug, link.code));
      setCopiedId(link.id);
      toast.success("Link copied");
      setTimeout(() => setCopiedId((id) => (id === link.id ? null : id)), 2000);
    } catch {
      toast.error("Could not copy the link.");
    }
  };

  const setArchived = async (link: PromoterLinkStats, archive: boolean) => {
    setBusyId(link.id);
    try {
      await setPromoterLinkArchived(link.id, archive);
      await load();
      toast.success(archive ? "Link archived. It no longer counts; its numbers stay here." : "Link restored.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update the link.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="bg-card border border-border mt-3" aria-labelledby="promoter-heading">
      <div className="flex items-start justify-between gap-3 px-4 md:px-5 pt-4">
        <div className="min-w-0">
          <h2 id="promoter-heading" className="text-sm font-bold flex items-center gap-1.5">
            <Megaphone className="w-4 h-4 text-primary" />
            Promoter links
          </h2>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            One link per promoter. They all open your ticket page; you see what each one brings.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          aria-label="Refresh the numbers"
          title="Refresh the numbers"
          className="shrink-0 w-9 h-9 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
        </button>
      </div>

      <form
        className="flex flex-col sm:flex-row gap-2 px-4 md:px-5 mt-3"
        onSubmit={(e) => {
          e.preventDefault();
          create();
        }}
      >
        <label htmlFor="promoter-name" className="sr-only">Promoter name</label>
        <input
          id="promoter-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Promoter's name, e.g. Léa, BDE Sciences, @soireesparis"
          maxLength={PROMOTER_NAME_MAX}
          autoComplete="off"
          className="flex-1 min-w-0 h-11 px-3 border border-border bg-background text-sm"
        />
        <button
          type="submit"
          disabled={creating || atLimit}
          className="inline-flex items-center justify-center gap-1.5 px-4 min-h-[44px] font-bold text-sm bg-primary text-primary-foreground hover:bg-primary-hover transition-colors disabled:opacity-60 shrink-0"
        >
          {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Create link
        </button>
      </form>

      {atLimit && (
        <p className="px-4 md:px-5 mt-2 text-xs text-muted-foreground">
          {PROMOTER_LINKS_MAX} active links is the maximum for an event. Archive one to add another.
        </p>
      )}

      {loading && !stats ? (
        <div className="p-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
      ) : failed && !stats ? (
        <div className="px-4 md:px-5 py-5 text-sm text-muted-foreground">
          The promoter links couldn't be loaded.{" "}
          <button type="button" onClick={load} className="font-semibold text-primary hover:underline">Try again</button>
        </div>
      ) : (
        <>
          {share && share.total > 0 && (
            <p className="px-4 md:px-5 mt-4 text-[13px] tabular-nums">
              <span className="font-semibold">{plural(share.viaLinks, "ticket")}</span> of {count(share.total)} came through promoter links
              {share.viaLinks > 0 && <> ({share.percent}%)</>}.
            </p>
          )}

          {active.length === 0 ? (
            <div className="mx-4 md:mx-5 mt-4 mb-4 px-4 py-6 text-center text-sm text-muted-foreground border border-dashed border-border">
              No promoter link yet. Create one for each promoter above, send it to them, and their visits and sales will show up here.
            </div>
          ) : (
            <ul className="mt-3 border-t border-border divide-y divide-border">
              {active.map((link) => (
                <LinkCard
                  key={link.id}
                  link={link}
                  url={promoterLinkUrl(slug, link.code)}
                  isNew={link.id === newId}
                  copied={copiedId === link.id}
                  busy={busyId === link.id}
                  onCopy={() => copy(link)}
                  onArchive={() => setArchived(link, true)}
                />
              ))}
            </ul>
          )}

          {stats && (
            <div className="px-4 md:px-5 py-3 border-t border-border">
              <div className="flex items-baseline justify-between gap-3 text-[13px]">
                <span className="font-semibold">Main link and other sources</span>
                <span className="shrink-0 tabular-nums">
                  {plural(stats.other.tickets, "ticket")} · {money(stats.other.revenueCents)}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">Sales that did not come through a promoter link.</p>
            </div>
          )}

          {archived.length > 0 && (
            <div className="border-t border-border">
              <button
                type="button"
                onClick={() => setShowArchived((v) => !v)}
                aria-expanded={showArchived}
                className="w-full flex items-center justify-between gap-2 px-4 md:px-5 py-3 text-[13px] font-semibold text-muted-foreground hover:text-foreground transition-colors"
              >
                Archived links ({archived.length})
                <ChevronDown className={`w-4 h-4 transition-transform ${showArchived ? "rotate-180" : ""}`} />
              </button>
              {showArchived && (
                <ul className="divide-y divide-border border-t border-border">
                  {archived.map((link) => (
                    <li key={link.id} className="flex items-center gap-3 px-4 md:px-5 py-3">
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-sm truncate">{link.name}</div>
                        <div className="text-xs text-muted-foreground tabular-nums">
                          {plural(link.visits, "visit")} · {plural(link.tickets, "ticket")} · {money(link.revenueCents)}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setArchived(link, false)}
                        disabled={busyId === link.id}
                        className="shrink-0 inline-flex items-center gap-1.5 px-3 min-h-[40px] text-xs font-bold bg-card border border-border hover:bg-muted transition-colors disabled:opacity-60"
                      >
                        {busyId === link.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArchiveRestore className="w-3.5 h-3.5" />}
                        Restore
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}

      <p className="px-4 md:px-5 py-3 border-t border-border text-[11px] leading-relaxed text-muted-foreground">
        A visit is counted each time your page opens from a link; nothing is stored in the visitor's browser, and your own visits are not counted.
        A sale belongs to a link when the buyer starts the checkout on a page opened from it. Revenue is the ticket price you receive,
        without the service fee the buyer pays on top.
      </p>
    </section>
  );
};
