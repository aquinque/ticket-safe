/**
 * /studio/sales — the archive. Every event that has ended, newest first, with what it sold
 * (tickets, gross, net), whether it has been paid out, and its exports (CSV, financial
 * statement PDF). An event moves here on its own the moment it is over: the phase is computed
 * at read time from events.date and events.ends_at (isPastEvent), nothing is written for it.
 * What still sells is managed from /studio/events.
 */
import { useCallback, useEffect, useMemo, useState, type MouseEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { StudioLayout } from "@/components/studio/StudioLayout";
import { StudioDocuments } from "@/components/studio/StudioDocuments";
import { StatFigure } from "@/components/studio/StatFigure";
import EventStatusBadge, { type EventStatus } from "@/components/studio/EventStatusBadge";
import { SalesExportMenu } from "@/components/studio/SalesExportMenu";
import { Skeleton } from "@/components/ui/skeleton";
import { SEOHead } from "@/components/SEOHead";
import { useAuth } from "@/hooks/useAuth";
import { useOrganizer } from "@/hooks/useOrganizer";
import { useThemeMode } from "@/hooks/useThemeMode";
import { supabase } from "@/integrations/supabase/client";
import { fmtDate, fmtMoney, fmtTime } from "@/lib/studioFormat";
import {
  attachSales,
  pastEventsNewestFirst,
  payoutLabel,
  totalsByCurrency,
  type ArchiveEvent,
  type ArchiveEventRow,
  type CurrencyTotals,
  type SalesSummaryRow,
} from "@/lib/salesArchive";

const TH = "px-4 py-2.5 text-[10px] uppercase tracking-wider font-bold text-muted-foreground";
const ZERO_EUR: CurrencyTotals = { currency: "EUR", events: 0, tickets: 0, gross_cents: 0, net_cents: 0 };

const captionOf = (currency: string) => (currency === "GBP" ? "In pounds (GBP)" : "In euros (EUR)");
const ticketsText = (sold: number, capacity: number) =>
  `${sold.toLocaleString("en-GB")} / ${capacity > 0 ? capacity.toLocaleString("en-GB") : "—"}`;

/** The title link navigates by itself; the row around it must not navigate a second time. */
const stop = (e: MouseEvent) => e.stopPropagation();

const PAYOUT_CLASSES = {
  emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
  amber: "bg-amber-50 text-amber-700 border-amber-200",
  muted: "bg-muted text-muted-foreground border-border",
} as const;

const PayoutBadge = ({ status }: { status: string }) => {
  const { label, tone } = payoutLabel(status);
  return (
    <span className={`inline-flex px-2 py-0.5 border text-[10px] font-bold uppercase tracking-wide ${PAYOUT_CLASSES[tone]}`}>{label}</span>
  );
};

/** Tickets, gross and net of one currency; pounds and euros are never added together. */
const CurrencyFigures = ({ totals }: { totals: CurrencyTotals }) => (
  <>
    <StatFigure label="Tickets sold" value={totals.tickets} size="lg" />
    <StatFigure label="Gross sales" value={totals.gross_cents} money currency={totals.currency} size="lg" />
    <StatFigure label="Net to you" value={totals.net_cents} money currency={totals.currency} size="lg" tone="good" />
  </>
);

const StudioSales = () => {
  useThemeMode("studio");
  const navigate = useNavigate();
  const { user } = useAuth();
  const { organizer, loading: orgLoading } = useOrganizer();
  const organizerId = organizer?.id;

  const [archive, setArchive] = useState<ArchiveEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async (ownerId: string) => {
    setLoading(true);
    setFailed(false);
    try {
      const [eventsRes, summaryRes] = await Promise.all([
        supabase
          .from("events")
          .select("id, title, slug, date, ends_at, status, currency, payment_provider")
          .eq("organizer_id", ownerId),
        supabase.rpc("studio_event_sales_summary", { p_organizer_id: ownerId }),
      ]);
      if (eventsRes.error) throw eventsRes.error;
      if (summaryRes.error) throw summaryRes.error;
      const past = pastEventsNewestFirst((eventsRes.data ?? []) as ArchiveEventRow[]);
      // Which past events already have their financial statement, a hundred ids per request.
      const withStatement = new Set<string>();
      const ids = past.map((event) => event.id);
      for (let i = 0; i < ids.length; i += 100) {
        const { data, error } = await supabase.from("event_statements").select("event_id, version").in("event_id", ids.slice(i, i + 100));
        if (error) throw error;
        for (const row of data ?? []) withStatement.add(row.event_id);
      }
      setArchive(attachSales(past, (summaryRes.data ?? []) as SalesSummaryRow[], withStatement));
    } catch (err) {
      console.error("[StudioSales] load failed:", err);
      setFailed(true);
      toast.error("Your past events could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (organizerId) void load(organizerId);
  }, [organizerId, load]);

  const totals = useMemo(() => totalsByCurrency(archive), [archive]);
  const groups = totals.length > 0 ? totals : [ZERO_EUR];
  const multiCurrency = groups.length > 1;

  const markStatement = (eventId: string) =>
    setArchive((rows) => rows.map((row) => (row.event.id === eventId ? { ...row, hasStatement: true } : row)));

  const open = (eventId: string) => navigate(`/studio/sales/${eventId}`);

  if (!user || orgLoading) {
    return (
      <StudioLayout active="sales" organizer={null}>
        <div className="p-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      </StudioLayout>
    );
  }

  return (
    <StudioLayout active="sales" organizer={organizer ? { name: organizer.name, logo_url: organizer.logo_url } : null}>
      <SEOHead title="Sales · Ticket Studio" description="Every event that has ended, with what it sold." />
      <div className="p-4 md:p-6 max-w-6xl mx-auto">
        <div className="mb-5">
          <h1 className="text-xl md:text-2xl font-bold text-foreground">Sales</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Every event that has ended, with what it sold. Events move here on their own once they are over.
          </p>
        </div>

        {/* All time, per currency */}
        <section className="bg-card border border-border p-4 md:p-5 mb-5" aria-label="All-time totals">
          {multiCurrency ? (
            <div className="space-y-4">
              <StatFigure label="Events" value={archive.length} size="lg" />
              {groups.map((group) => (
                <div key={group.currency} className="pt-4 border-t border-border">
                  <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-2">{captionOf(group.currency)}</div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <StatFigure label="Events" value={group.events} size="lg" />
                    <CurrencyFigures totals={group} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatFigure label="Events" value={archive.length} size="lg" />
              <CurrencyFigures totals={groups[0]} />
            </div>
          )}
        </section>

        {/* The archive, newest first */}
        <section className="bg-card border border-border mb-6" aria-label="Past events">
          {loading ? (
            <div className="p-4 space-y-2" aria-busy="true" aria-label="Loading past events">
              {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-14 rounded-none" />)}
            </div>
          ) : failed ? (
            <p className="text-sm text-muted-foreground text-center py-10 px-4">
              Your past events could not be loaded.{" "}
              <button
                type="button"
                onClick={() => { if (organizerId) void load(organizerId); }}
                className="font-bold underline underline-offset-2 hover:text-primary"
              >
                Try again
              </button>
            </p>
          ) : archive.length === 0 ? (
            <div className="text-center py-12 px-4">
              <p className="text-sm text-muted-foreground">No past events yet. Your events will appear here once they end.</p>
              <Link
                to="/studio/events"
                className="inline-flex items-center justify-center min-h-[44px] px-4 mt-4 text-sm font-bold bg-card border border-border hover:bg-muted"
              >
                Events
              </Link>
            </div>
          ) : (
            <>
              {/* Desktop */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left">
                      <th scope="col" className={TH}>Event</th>
                      <th scope="col" className={TH}>Date</th>
                      <th scope="col" className={`${TH} text-right`}>Tickets</th>
                      <th scope="col" className={`${TH} text-right`}>Gross</th>
                      <th scope="col" className={`${TH} text-right`}>Net</th>
                      <th scope="col" className={TH}>Payout</th>
                      <th scope="col" className={`${TH} text-right`}>Export</th>
                    </tr>
                  </thead>
                  <tbody>
                    {archive.map(({ event, summary, hasStatement }) => (
                      <tr
                        key={event.id}
                        role="link"
                        onClick={() => open(event.id)}
                        className="border-b border-border last:border-0 hover:bg-muted/40 cursor-pointer"
                      >
                        <td className="px-4 py-3 align-top max-w-[300px]">
                          <Link to={`/studio/sales/${event.id}`} onClick={stop} className="block font-semibold truncate hover:text-primary">
                            {event.title || "Untitled event"}
                          </Link>
                          <div className="mt-1">
                            <EventStatusBadge status={event.status as EventStatus} date={event.date} size="sm" />
                          </div>
                        </td>
                        <td className="px-4 py-3 align-top text-muted-foreground whitespace-nowrap tabular-nums">
                          {event.date ? <>{fmtDate(event.date)} <span className="opacity-60">{fmtTime(event.date)}</span></> : "—"}
                        </td>
                        <td className="px-4 py-3 align-top text-right tabular-nums whitespace-nowrap">{ticketsText(summary.tickets_sold, summary.capacity)}</td>
                        <td className="px-4 py-3 align-top text-right tabular-nums whitespace-nowrap">{fmtMoney(summary.gross_cents, event.currency, 2)}</td>
                        <td className="px-4 py-3 align-top text-right font-bold tabular-nums whitespace-nowrap">{fmtMoney(summary.net_cents, event.currency, 2)}</td>
                        <td className="px-4 py-3 align-top"><PayoutBadge status={summary.payout_status} /></td>
                        <td className="px-4 py-3 align-top text-right">
                          <SalesExportMenu variant="menu" event={event} hasStatement={hasStatement} onStatementGenerated={() => markStatement(event.id)} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Phone */}
              <ul className="md:hidden divide-y divide-border">
                {archive.map(({ event, summary, hasStatement }) => (
                  <li key={event.id} role="link" onClick={() => open(event.id)} className="px-4 py-3 cursor-pointer active:bg-muted/40">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <Link to={`/studio/sales/${event.id}`} onClick={stop} className="block text-sm font-semibold truncate">
                          {event.title || "Untitled event"}
                        </Link>
                        <div className="text-[11px] text-muted-foreground tabular-nums mt-0.5">
                          {event.date ? `${fmtDate(event.date)} ${fmtTime(event.date)}` : "—"}
                        </div>
                      </div>
                      <EventStatusBadge status={event.status as EventStatus} date={event.date} size="sm" className="shrink-0" />
                    </div>
                    <dl className="grid grid-cols-3 gap-2 mt-2 text-xs">
                      <div>
                        <dt className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Tickets</dt>
                        <dd className="tabular-nums">{ticketsText(summary.tickets_sold, summary.capacity)}</dd>
                      </div>
                      <div>
                        <dt className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Gross</dt>
                        <dd className="tabular-nums">{fmtMoney(summary.gross_cents, event.currency, 2)}</dd>
                      </div>
                      <div>
                        <dt className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Net</dt>
                        <dd className="font-bold tabular-nums">{fmtMoney(summary.net_cents, event.currency, 2)}</dd>
                      </div>
                    </dl>
                    <div className="flex items-center justify-between gap-2 mt-2">
                      <PayoutBadge status={summary.payout_status} />
                      <SalesExportMenu variant="menu" event={event} hasStatement={hasStatement} onStatementGenerated={() => markStatement(event.id)} />
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        {/* Sales statements, per past event */}
        {organizer && <StudioDocuments organizer={organizer} />}
      </div>
    </StudioLayout>
  );
};

export default StudioSales;
