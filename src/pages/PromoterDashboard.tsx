import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Check, Copy, ExternalLink, Loader2, Megaphone } from "lucide-react";
import { toast } from "sonner";
import Footer from "@/components/Footer";
import HeaderNight from "@/components/HeaderNight";
import { SEOHead } from "@/components/SEOHead";
import { Button } from "@/components/ui/button";
import { DaysChart } from "@/components/studio/PromoterLinksPanel";
import { useAuth } from "@/hooks/useAuth";
import { useThemeMode } from "@/hooks/useThemeMode";
import {
  claimPromoterLink,
  conversionRate,
  fetchMyPromoterLinks,
  forgetPromoterInvite,
  formatRate,
  pendingPromoterInvite,
  promoterLinkUrl,
  type MyPromoterLink,
} from "@/lib/promoterLinks";
import { fmtDate, plural, relativeTime } from "@/lib/studioFormat";

const Figure = ({ label, value }: { label: string; value: string }) => (
  <div className="min-w-0">
    <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground truncate">{label}</div>
    <div className="font-display text-2xl font-bold tabular-nums leading-tight mt-0.5">{value}</div>
  </div>
);

const LinkCard = ({ link }: { link: MyPromoterLink }) => {
  const [copied, setCopied] = useState(false);
  const url = promoterLinkUrl(link.eventSlug, link.code);
  const live = !link.archived && link.eventStatus === "published";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Your link is copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy the link.");
    }
  };

  return (
    <li className="rounded-2xl bg-card border border-border overflow-hidden">
      <div className="flex gap-4 p-4">
        {link.bannerUrl && <img src={link.bannerUrl} alt="" className="hidden sm:block w-28 aspect-[16/9] object-cover rounded-lg shrink-0" />}
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-lg font-bold truncate">{link.eventTitle}</h2>
          <p className="text-sm text-muted-foreground truncate">
            {link.eventDate && fmtDate(link.eventDate)}
            {link.eventLocation && <> · {link.eventLocation}</>}
            {link.organizerName && <> · {link.organizerName}</>}
          </p>
          {link.archived ? (
            <p className="text-xs text-muted-foreground mt-1">The organizer closed this link. Your numbers stay here.</p>
          ) : !live ? (
            <p className="text-xs text-muted-foreground mt-1">The event isn't on sale right now.</p>
          ) : null}
        </div>
      </div>

      {!link.archived && (
        <div className="mx-4 mb-4 flex items-center gap-2 rounded-lg border border-border bg-muted/30 pl-3 pr-1 py-1">
          <span className="flex-1 min-w-0 truncate text-xs font-mono" title={url}>{url.replace(/^https?:\/\//, "")}</span>
          <Button size="sm" onClick={copy} className="shrink-0">
            {copied ? <Check className="w-3.5 h-3.5 mr-1.5" /> : <Copy className="w-3.5 h-3.5 mr-1.5" />}
            {copied ? "Copied" : "Copy my link"}
          </Button>
          <Button size="sm" variant="outline" asChild className="shrink-0">
            <a href={url} target="_blank" rel="noopener noreferrer" aria-label="Open my link"><ExternalLink className="w-3.5 h-3.5" /></a>
          </Button>
        </div>
      )}

      <div className="px-4 pb-4 border-t border-border pt-4">
        <div className="grid grid-cols-4 gap-3">
          <Figure label="Tickets sold" value={link.tickets.toLocaleString("en-GB")} />
          <Figure label="Visits" value={link.visits.toLocaleString("en-GB")} />
          <Figure label="Checkouts" value={link.checkouts.toLocaleString("en-GB")} />
          <Figure label="Conversion" value={formatRate(conversionRate(link.visits, link.paidOrders))} />
        </div>
        <div className="mt-4 max-w-sm">
          <div className="flex items-baseline justify-between gap-3 text-[11px] text-muted-foreground mb-1">
            <span>Visits per day · darker bars: a sale</span>
            <span className="shrink-0">{link.lastSaleAt ? `Last sale ${relativeTime(link.lastSaleAt)}` : "No sale yet"}</span>
          </div>
          <DaysChart series={link.series} />
        </div>
      </div>
    </li>
  );
};

/**
 * /promoter: the promoter's personal space. Every link they accepted, with their own link to the ticket page and
 * what it brought: tickets sold, visits, checkouts. No buyer data and no revenue.
 * Data: my_promoter_links() in supabase/migrations/20261029140000_promoter_accounts.sql.
 */
const PromoterDashboard = () => {
  useThemeMode("night");
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [links, setLinks] = useState<MyPromoterLink[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth?next=/promoter", { replace: true });
  }, [authLoading, user, navigate]);

  const load = useCallback(async () => {
    try {
      // An invitation accepted before sign-up / e-mail confirmation finishes here.
      const pending = pendingPromoterInvite();
      if (pending) {
        try {
          const result = await claimPromoterLink(pending);
          if (result) forgetPromoterInvite();
        } catch {
          /* keep it for the next visit */
        }
      }
      setLinks(await fetchMyPromoterLinks());
      setFailed(false);
    } catch (err) {
      console.error("[PromoterDashboard] load failed:", err);
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  // Sales arrive while the promoter is elsewhere: refresh when they come back.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && user) load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [user, load]);

  const total = useMemo(() => (links ?? []).reduce((sum, l) => sum + l.tickets, 0), [links]);

  return (
    <div className="theme-night min-h-screen bg-background flex flex-col">
      <SEOHead title="My promoter space — Ticket Safe" description="Your promoter links and sales." />
      <HeaderNight />
      <main className="pt-24 pb-16 flex-1">
        <div className="container mx-auto px-4 max-w-3xl">
          <p className="text-xs uppercase tracking-wider font-bold text-primary flex items-center gap-1.5">
            <Megaphone className="w-3.5 h-3.5" />
            Promoter space
          </p>
          <h1 className="font-display text-3xl font-bold mt-1">My sales</h1>
          {links && links.length > 0 && (
            <p className="text-sm text-muted-foreground mt-1">
              {plural(total, "ticket")} sold through your links in total.
            </p>
          )}

          {(authLoading || (user && !links && !failed)) && (
            <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          )}

          {failed && !links && (
            <p className="mt-10 text-sm text-muted-foreground">
              Your promoter space couldn't be loaded.{" "}
              <button type="button" onClick={load} className="font-semibold text-primary hover:underline">Try again</button>
            </p>
          )}

          {links && links.length === 0 && (
            <div className="mt-8 rounded-2xl border border-dashed border-border p-8 text-center">
              <h2 className="font-bold">No promoter link yet</h2>
              <p className="text-sm text-muted-foreground mt-1">
                When an organizer invites you, open the invitation they send you and accept it: your link and your sales show up here.
              </p>
              <Button asChild variant="outline" className="mt-4"><Link to="/tickets">Browse events</Link></Button>
            </div>
          )}

          {links && links.length > 0 && (
            <ul className="mt-6 space-y-4">
              {links.map((l) => <LinkCard key={l.id} link={l} />)}
            </ul>
          )}

          <p className="mt-8 text-[11px] leading-relaxed text-muted-foreground">
            A visit is counted each time the event page opens from your link. A sale counts for you when the buyer starts the checkout on a
            page opened from it.
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default PromoterDashboard;
