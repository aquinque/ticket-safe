import { useEffect, useMemo, useState } from "react";
import { Zap } from "lucide-react";
import { useThemeMode } from "@/hooks/useThemeMode";
import { DashboardView, type Pace, type StudioEvent } from "./StudioDashboard";
import type { DaySales, RecentSale, TierSlice } from "@/components/studio/dashboard/LiveCharts";

/**
 * The Studio dashboard with sample numbers, to look at it without an organizer account:
 * one event, 100 tickets sold at €13. Development builds only (see App.tsx); nothing here
 * reads or writes the database.
 */

const PRICE = 1300;
const CAPACITY = 150;
const MIN = 60_000;
// Tickets sold per day over the last 14 days (82), on top of 18 sold before: 100.
const PER_DAY = [2, 3, 1, 4, 3, 5, 6, 4, 7, 9, 6, 11, 13, 8];
const BEFORE = 18;

function startingDays(): DaySales[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return PER_DAY.map((tickets, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - 13 + i);
    return { day: d.toISOString().slice(0, 10), tickets, cents: { EUR: tickets * PRICE } };
  });
}

function startingSales(): RecentSale[] {
  return [
    [2, 3], [1, 18], [4, 47], [1, 95], [2, 180], [3, 320], [1, 610], [2, 1500],
  ].map(([q, ago], i) => ({
    id: `demo-${i}`,
    event_title: "Winter Kick-off · Ayala 120",
    tier_name: "Regular",
    quantity: q,
    amount_cents: q * PRICE,
    currency: "EUR",
    created_at: new Date(Date.now() - ago * MIN).toISOString(),
  }));
}

const StudioDemo = () => {
  useThemeMode("studio");
  const [sold, setSold] = useState(BEFORE + PER_DAY.reduce((n, t) => n + t, 0));
  const [days, setDays] = useState<DaySales[]>(startingDays);
  const [recent, setRecent] = useState<RecentSale[]>(startingSales);
  const [lastUpdated, setLastUpdated] = useState(() => new Date());

  // The real dashboard re-reads every 30 seconds; so does this one, with nothing new.
  useEffect(() => {
    const id = setInterval(() => setLastUpdated(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const eventDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 9);
    d.setHours(23, 0, 0, 0);
    return d.toISOString();
  }, []);

  const event: StudioEvent = {
    id: "demo-event",
    title: "Winter Kick-off · Ayala 120",
    date: eventDate,
    ends_at: null,
    location: "Ayala 120, Madrid",
    status: "published",
    slug: "demo",
    banner_url: null,
    primary_color: "#3a5fe6",
    currency: "EUR",
    sold_count: sold,
    total_capacity: CAPACITY,
    revenue_cents: sold * PRICE,
    price_from_cents: PRICE,
  };
  const tiers: TierSlice[] = [{ name: "Regular", sold, total: CAPACITY, price_cents: PRICE }];
  const last7 = days.slice(7).reduce((n, d) => n + d.tickets, 0);
  const pace: Pace = { sold7: last7, lastSale: recent[0]?.created_at ?? null };

  // A sale as Realtime would bring it: 1 to 3 tickets, now.
  const simulateSale = () => {
    const q = Math.min(CAPACITY - sold, 1 + Math.floor(Math.random() * 3));
    if (q <= 0) return;
    setSold((n) => n + q);
    setDays((ds) => ds.map((d, i) => (i === ds.length - 1 ? { ...d, tickets: d.tickets + q, cents: { EUR: (d.cents.EUR ?? 0) + q * PRICE } } : d)));
    setRecent((rs) => [{ id: `demo-${Date.now()}`, event_title: event.title, tier_name: "Regular", quantity: q, amount_cents: q * PRICE, currency: "EUR", created_at: new Date().toISOString() }, ...rs]);
    setLastUpdated(new Date());
  };

  return (
    <DashboardView
      organizer={{ name: "Demo Society", logo_url: null }}
      events={[event]}
      loadingEvents={false}
      next={event}
      phase="upcoming"
      pace={pace}
      checkedIn={null}
      dailySales={days}
      heroDays={days}
      recent={recent}
      tiers={tiers}
      linkedEvents={new Set()}
      payments={{ exists: true, active: true }}
      earnings={null}
      pastCount={0}
      lastUpdated={lastUpdated}
      banner={
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border border-dashed border-primary/40 bg-primary/5 px-4 py-3 text-sm">
          <span>Demo: sample numbers on this computer only, nothing is saved.</span>
          <button
            type="button"
            onClick={simulateSale}
            className="inline-flex items-center gap-1.5 px-3 min-h-[36px] font-bold bg-primary text-primary-foreground hover:bg-primary-hover transition-colors"
          >
            <Zap className="w-4 h-4" /> Simulate a sale
          </button>
        </div>
      }
    />
  );
};

export default StudioDemo;
