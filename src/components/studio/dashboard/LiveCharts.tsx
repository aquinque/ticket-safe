import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Ticket } from "lucide-react";
import { fmtMoney, plural, relativeTime } from "@/lib/studioFormat";
import { CURRENCIES, type Currency } from "@/lib/money";

/**
 * The moving parts of the Studio dashboard: the sales curve in the hero, the 14-day sales chart,
 * the ticket-type ring, the live sales feed and the "updated 4s ago" clock. Presentational only:
 * the dashboard (or the local demo) hands them their numbers.
 */

export type CentsByCurrency = Partial<Record<Currency, number>>;
export interface DaySales { day: string; cents: CentsByCurrency; tickets: number }
export interface RecentSale { id: string; event_title: string; tier_name: string | null; quantity: number; amount_cents: number; currency: string; created_at: string }
export interface TierSlice { name: string; sold: number; total: number; price_cents: number }

const reduceMotion = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const dayLabel = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

/** Re-renders itself every second, so the dashboard around it doesn't. */
export function UpdatedAgo({ at }: { at: Date | null }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  if (!at) return null;
  const s = Math.max(0, Math.round((Date.now() - at.getTime()) / 1000));
  return (
    <span className="ts-mono tabular-nums">
      updated {s < 5 ? "just now" : s < 60 ? `${s}s ago` : `${Math.floor(s / 60)} min ago`}
    </span>
  );
}

/** Tickets sold so far, day by day, as one rising line: white, for the event's coloured hero. */
export function SalesCurve({ days, sold }: { days: DaySales[] | null; sold: number }) {
  const data = useMemo(() => {
    if (!days?.length) return [];
    const inWindow = days.reduce((n, d) => n + d.tickets, 0);
    // Everything sold before the window is where the line starts.
    let run = Math.max(0, sold - inWindow);
    return days.map((d) => ({ day: d.day, total: (run += d.tickets) }));
  }, [days, sold]);
  if (data.length < 2) return null;
  return (
    <div className="relative h-24 md:h-28 w-full" aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 10, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="ts-curve" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#fff" stopOpacity={0.45} />
              <stop offset="100%" stopColor="#fff" stopOpacity={0} />
            </linearGradient>
          </defs>
          <YAxis hide domain={[0, "dataMax"]} />
          <Area
            type="monotone"
            dataKey="total"
            stroke="#fff"
            strokeWidth={2.5}
            fill="url(#ts-curve)"
            isAnimationActive={!reduceMotion()}
            animationDuration={1400}
            dot={false}
            activeDot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
      {/* Now: the end of the line, pulsing. */}
      <span className="absolute right-[6px] top-[4px] flex h-3 w-3">
        <span className="absolute inset-0 rounded-full bg-white motion-safe:animate-ping opacity-60" />
        <span className="relative h-3 w-3 rounded-full bg-white ring-4 ring-white/25" />
      </span>
    </div>
  );
}

type Metric = "tickets" | "revenue";

/** The last 14 days as bars, tickets or revenue; this week solid, the week before faded. */
export function SalesChart({ days, currency }: { days: DaySales[] | null; currency: Currency }) {
  const [metric, setMetric] = useState<Metric>("tickets");
  if (!days) return <div className="h-48 bg-muted animate-pulse" />;
  const data = days.map((d, i) => ({ ...d, label: dayLabel(d.day), value: metric === "tickets" ? d.tickets : (d.cents[currency] ?? 0) / 100, thisWeek: i >= 7 }));
  const empty = data.every((d) => d.value === 0);
  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-[11px] text-muted-foreground">Last 14 days</span>
        <div role="tablist" aria-label="Show" className="inline-flex p-0.5 bg-muted text-xs font-semibold">
          {(["tickets", "revenue"] as Metric[]).map((m) => (
            <button
              key={m}
              role="tab"
              aria-selected={metric === m}
              onClick={() => setMetric(m)}
              className={`px-2.5 py-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${metric === m ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              {m === "tickets" ? "Tickets" : "Revenue"}
            </button>
          ))}
        </div>
      </div>
      <div className="relative h-44" role="img" aria-label={`${metric === "tickets" ? "Tickets sold" : "Revenue"} per day over the last 14 days`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 6, right: 0, bottom: 0, left: -18 }} barCategoryGap="22%">
            <XAxis dataKey="label" tickLine={false} axisLine={false} interval={6} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
            <YAxis tickLine={false} axisLine={false} allowDecimals={false} width={42} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
            <Tooltip
              cursor={{ fill: "hsl(var(--muted))" }}
              content={({ active, payload }) => {
                const p = payload?.[0]?.payload as (typeof data)[number] | undefined;
                if (!active || !p) return null;
                return (
                  <div className="bg-foreground text-background px-3 py-2 text-xs shadow-lg">
                    <div className="font-semibold">{new Date(p.day).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}</div>
                    <div className="tabular-nums mt-0.5">{plural(p.tickets, "ticket")}{CURRENCIES.filter((c) => p.cents[c]).map((c) => ` · ${fmtMoney(p.cents[c]!, c)}`).join("")}</div>
                  </div>
                );
              }}
            />
            <Bar dataKey="value" radius={[3, 3, 0, 0]} isAnimationActive={!reduceMotion()} animationDuration={700}>
              {data.map((d) => <Cell key={d.day} fill={d.thisWeek ? "hsl(var(--primary))" : "hsl(var(--primary) / 0.28)"} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        {empty && <p className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">No sales in the last 14 days</p>}
      </div>
    </div>
  );
}

const RING = ["hsl(var(--primary))", "#7c93f0", "#aec6ff", "#22c55e", "#f59e0b", "#94a3b8"];

/** How the next event's tickets split across its ticket types, sold against what's left. */
export function TierRing({ tiers, currency }: { tiers: TierSlice[] | null; currency: string }) {
  if (!tiers) return <div className="h-40 bg-muted animate-pulse" />;
  if (!tiers.length) return <p className="text-sm text-muted-foreground">No ticket types yet.</p>;
  const sold = tiers.reduce((n, t) => n + t.sold, 0);
  const total = tiers.reduce((n, t) => n + t.total, 0);
  const left = Math.max(0, total - sold);
  const slices = [...tiers.map((t, i) => ({ name: t.name, value: t.sold, color: RING[i % RING.length] })), { name: "Left", value: left, color: "hsl(var(--muted))" }].filter((s) => s.value > 0);
  return (
    <div className="flex items-center gap-5">
      <div className="relative w-32 h-32 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={slices.length ? slices : [{ name: "Left", value: 1, color: "hsl(var(--muted))" }]} dataKey="value" innerRadius="72%" outerRadius="100%" startAngle={90} endAngle={-270} stroke="none" isAnimationActive={!reduceMotion()} animationDuration={900}>
              {(slices.length ? slices : [{ color: "hsl(var(--muted))" }]).map((s, i) => <Cell key={i} fill={s.color} />)}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-2xl font-bold tabular-nums leading-none">{total ? Math.round((sold / total) * 100) : 0}%</span>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">sold</span>
        </div>
      </div>
      <ul className="flex-1 min-w-0 space-y-2">
        {tiers.map((t, i) => (
          <li key={t.name} className="text-sm">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 shrink-0" style={{ background: RING[i % RING.length] }} />
              <span className="flex-1 min-w-0 truncate font-medium">{t.name}</span>
              <span className="tabular-nums text-muted-foreground text-xs">{t.sold}/{t.total}</span>
            </div>
            <div className="text-[11px] text-muted-foreground pl-[18px] tabular-nums">{fmtMoney(t.price_cents, currency, t.price_cents % 100 ? 2 : 0)} each · {fmtMoney(t.sold * t.price_cents, currency)}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The latest paid orders, newest first; a sale arriving while the page is open slides in on top. */
export function LiveFeed({ sales }: { sales: RecentSale[] | null }) {
  const [, tick] = useState(0);
  // Keeps "2 min ago" true.
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);
  if (!sales) return <div className="h-48 bg-muted animate-pulse" />;
  if (!sales.length) return <p className="text-sm text-muted-foreground">No sales yet. They show up here the second they happen.</p>;
  return (
    <ul className="-mx-1 divide-y divide-border">
      {sales.slice(0, 6).map((s) => {
        const fresh = Date.now() - new Date(s.created_at).getTime() < 60_000;
        return (
          <li key={s.id} className="ts-feed-in flex items-center gap-3 px-1 py-2.5">
            <span className={`w-8 h-8 shrink-0 flex items-center justify-center ${fresh ? "bg-emerald-500 text-white" : "bg-primary/10 text-primary"} transition-colors duration-700`}>
              <Ticket className="w-4 h-4" strokeWidth={1.75} />
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">
                {plural(s.quantity, "ticket")}{s.tier_name ? ` · ${s.tier_name}` : ""}
              </div>
              <div className="text-[11px] text-muted-foreground truncate">{s.event_title}</div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-sm font-bold tabular-nums">{fmtMoney(s.amount_cents, s.currency)}</div>
              <div className="ts-mono text-[10px] text-muted-foreground">{relativeTime(s.created_at)}</div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export const liveChartStyles = `
  .ts-mono { font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace; }
  .ts-feed-in { animation: ts-feed-in 500ms cubic-bezier(.2,.7,.2,1) both; }
  @keyframes ts-feed-in { from { opacity: 0; transform: translateY(-8px); background: hsl(142 71% 45% / .12); } to { opacity: 1; transform: none; background: transparent; } }
  @media (prefers-reduced-motion: reduce) { .ts-feed-in { animation: none; } }
`;
