import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { SEOHead } from "@/components/SEOHead";
import { DaysChart } from "@/components/studio/PromoterLinksPanel";
import { useThemeMode } from "@/hooks/useThemeMode";
import { conversionRate, fetchPromoterReport, formatRate, type PromoterReport as Report } from "@/lib/promoterLinks";
import { fmtDate, relativeTime } from "@/lib/studioFormat";

const Figure = ({ label, value, hint }: { label: string; value: string; hint: string }) => (
  <div title={hint} className="min-w-0">
    <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground truncate">{label}</div>
    <div className="font-display text-3xl font-bold tabular-nums leading-tight mt-1">{value}</div>
  </div>
);

/**
 * /p/<token>: the private page a promoter opens to follow their own link. No account: the long random token in
 * the address is the key. It shows visits, checkouts and tickets sold for that one link, nothing about buyers or
 * money. Data: promoter_report() in supabase/migrations/20261029130000_promoter_report_pages.sql.
 */
const PromoterReport = () => {
  useThemeMode("studio");
  const { token = "" } = useParams();
  const [report, setReport] = useState<Report | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing" | "error">("loading");

  // Private page: keep it out of search results.
  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex,nofollow";
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetchPromoterReport(token);
        if (cancelled) return;
        setReport(r);
        setState(r ? "ready" : "missing");
      } catch (err) {
        console.error("[PromoterReport] load failed:", err);
        if (!cancelled) setState((s) => (s === "ready" ? s : "error"));
      }
    };
    load();
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [token]);

  return (
    <div className="theme-studio min-h-screen bg-background text-foreground">
      <SEOHead title="Your sales — Ticket Safe" description="Your promoter sales page." />
      <main className="max-w-xl mx-auto px-4 py-10">
        {state === "loading" && (
          <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        )}

        {state === "missing" && (
          <div className="text-center py-20">
            <h1 className="text-xl font-bold">This page doesn't exist</h1>
            <p className="text-sm text-muted-foreground mt-2">Check the address the organizer sent you, or ask them for a new one.</p>
          </div>
        )}

        {state === "error" && (
          <div className="text-center py-20">
            <h1 className="text-xl font-bold">Couldn't load your numbers</h1>
            <p className="text-sm text-muted-foreground mt-2">Please reload the page in a moment.</p>
          </div>
        )}

        {state === "ready" && report && (
          <>
            <p className="text-xs uppercase tracking-wider font-bold text-muted-foreground">Promoter sales</p>
            <h1 className="font-display text-2xl font-bold mt-1">{report.name}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {report.eventTitle}
              {report.eventDate && <> · {fmtDate(report.eventDate)}</>}
              {report.eventLocation && <> · {report.eventLocation}</>}
              {report.organizerName && <> · by {report.organizerName}</>}
            </p>

            {report.archived && (
              <p className="mt-4 text-sm px-3 py-2 border border-border bg-muted/40">
                This link has been closed by the organizer. The numbers below stop here.
              </p>
            )}

            <section className="mt-6 bg-card border border-border p-5">
              <div className="text-sm text-muted-foreground">Tickets sold through your link</div>
              <div className="font-display text-5xl font-bold tabular-nums mt-1">{report.tickets.toLocaleString("en-GB")}</div>
              <div className="text-xs text-muted-foreground mt-1">
                {report.lastSaleAt ? `Last sale ${relativeTime(report.lastSaleAt)}` : "No sale yet. Share your link!"}
              </div>

              <div className="mt-6 grid grid-cols-3 gap-4">
                <Figure label="Visits" value={report.visits.toLocaleString("en-GB")} hint="Times the event page was opened from your link." />
                <Figure label="Checkouts" value={report.checkouts.toLocaleString("en-GB")} hint="People who started buying from your link, paid or not." />
                <Figure label="Conversion" value={formatRate(conversionRate(report.visits, report.paidOrders))} hint="Paid orders per visit." />
              </div>

              <div className="mt-6">
                <div className="text-[11px] text-muted-foreground mb-1">Visits per day, last 14 days · darker bars: a sale</div>
                <DaysChart series={report.series} />
              </div>
            </section>

            {report.eventSlug && (
              <p className="mt-4 text-sm text-center">
                <Link to={`/e/${report.eventSlug}`} className="font-semibold text-primary hover:underline">View the event page</Link>
              </p>
            )}

            <p className="mt-6 text-[11px] leading-relaxed text-muted-foreground">
              This page is private: anyone with the address can see these numbers, so keep it to yourself. A sale counts for you when the
              buyer starts the checkout on a page opened from your link. The numbers refresh each time you come back to this page.
            </p>
          </>
        )}
      </main>
    </div>
  );
};

export default PromoterReport;
