import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import HeaderNight from "@/components/HeaderNight";
import Footer from "@/components/Footer";
import { SEOHead } from "@/components/SEOHead";
import { useNearViewport } from "@/hooks/useNearViewport";
import { useOrganizer } from "@/hooks/useOrganizer";
import { useThemeMode } from "@/hooks/useThemeMode";
import { formatMoney, formatMoneyShort } from "@/lib/money";
import { fetchPublishedEvents, type PublishedEvent } from "@/lib/publishedEvents";
import { STUDIO_FEE_FIXED_CENTS, STUDIO_FEE_MIN_CENTS, STUDIO_FEE_PERCENT, STUDIO_FEE_RULE_LONG, studioFeeRuleLong } from "@/lib/studioFee";
import { mountOrganizersLanding } from "./organizersLandingMotion";
import "./organizersLanding.css";

/**
 * The organizers landing page: the pitch, the product shown working on example figures (a guest buys on a phone,
 * the dashboard updates), the life of one ticket as the page scrolls, the features, the events on sale right now
 * (real ones), the fees and the questions organizers ask.
 *
 * Styles live in organizersLanding.css, all scoped to `.org-landing`; the animations in organizersLandingMotion.ts.
 * The mock-ups are labelled as examples; everything said about the product and its price must stay true to it.
 */

/**
 * The buyer's service fee in euros, for the examples and the calculator of this page only. Same rule as the
 * database function every checkout uses (get_studio_commission_cents, see src/lib/studioFee.ts): nothing on a
 * free ticket, otherwise 4 % + €0.60, at least €0.70.
 */
const exampleFeeCents = (priceCents: number): number =>
  priceCents <= 0 ? 0 : Math.max(STUDIO_FEE_MIN_CENTS.EUR, STUDIO_FEE_FIXED_CENTS.EUR + Math.round((priceCents * STUDIO_FEE_PERCENT) / 100));

const EXAMPLE_PRICE_CENTS = 2500;
const EXAMPLE_FEE_CENTS = exampleFeeCents(EXAMPLE_PRICE_CENTS);

const Icon = ({ name }: { name: string }) => (
  <svg aria-hidden="true">
    <use href={`#ol-i-${name}`} />
  </svg>
);

/** The pictures of the four features: pinned beside the list on a wide screen, under each feature on a phone. */
const featureCards: ReactNode[] = [
  <div className="card" key="tiers">
    <div className="card-h"><span>Your Event · Tiers</span><span>642 sold</span></div>
    <div className="tier"><b>Early bird</b><span className="st-pill sold">Sold out</span><small>€18 · 200 / 200</small></div>
    <div className="tier"><b>Regular</b><span className="st-pill now">Selling now</span><small>€25 · 412 / 500 · closes 5 Dec, 23:59</small></div>
    <div className="tier"><b>Last release</b><span className="st-pill next">Opens next</span><small>€30 · opens when Regular sells out</small></div>
    <div className="pills"><span className="pill">Private link</span><span className="pill">One-shot codes</span><span className="pill">Promo codes</span></div>
  </div>,
  <div className="card" key="tables">
    <div className="card-h"><span>Your Event · Tables</span><span>13 / 18 booked</span></div>
    <div className="floor">
      {[1, 1, 0, 1, 2, 1, 1, 0, 1, 1, 1, 0, 1, 1, 2, 1, 0, 1].map((s, i) => (
        <span key={i} className={`tb${s === 1 ? " bk" : s === 2 ? " rs" : ""}`}>T{i + 1}</span>
      ))}
    </div>
    <div className="legend">
      <span><i style={{ background: "var(--accent)" }} />Booked</span>
      <span><i style={{ background: "var(--amber)" }} />Reserved</span>
      <span><i style={{ background: "var(--glass-3)" }} />Free</span>
    </div>
    <div className="gl-row"><div>Guest list · Partners<br /><span>Hugo M. +1</span></div><span className="in">Checked in</span></div>
  </div>,
  <div className="card" key="promoters">
    <div className="card-h"><span>Promoter · Inès</span><span>Your Event</span></div>
    <div className="link-box"><Icon name="link" /><code>ticket-safe.eu/e/your-event?ref=<em>INES</em></code></div>
    <div className="stats3">
      <div className="s3"><span className="p-label">Sales</span><b>64</b></div>
      <div className="s3"><span className="p-label">Visits</span><b>1,180</b></div>
      <div className="s3"><span className="p-label">Revenue</span><b>€1.6k</b></div>
    </div>
    <div className="spark">
      {[22, 35, 28, 52, 46, 70, 61, 88, 76, 100].map((h, i) => <i key={i} style={{ height: `${h}%` }} />)}
    </div>
  </div>,
  <div className="card" key="payouts">
    <div className="card-h"><span>Payouts</span><span>via Stripe</span></div>
    <div><span className="p-label">Available</span><div className="kpi" style={{ fontSize: 46 }}><span className="cur">€</span>12,940.00</div></div>
    <div className="po"><b>Cash out</b><span className="tag">Ready</span><small>To your bank account</small></div>
    <div className="po"><b>After the event</b><span className="tag" style={{ color: "var(--fg-2)", background: "var(--glass-2)" }}>Automatic</span><small>The rest is paid out as sales settle</small></div>
  </div>,
];

const features: { icon: string; kicker: string; title: string; text: string }[] = [
  {
    icon: "ticket",
    kicker: "Ticket tiers",
    title: "Tiers that open and close on their own",
    text: "Set quotas, prices and sale windows. Early bird sells out, Regular opens. Private links and one-shot codes for the people you choose.",
  },
  {
    icon: "users",
    kicker: "Tables & guest lists",
    title: "Tables and guest lists, next to your tickets",
    text: "Sell tables alongside your tickets when your event needs them. Guest lists with check-in by name sit right next to your paid tickets.",
  },
  {
    icon: "link",
    kicker: "Promoters",
    title: "A link for every promoter",
    text: "Each promoter gets their own tracked link and a space to follow their sales. No more counting by hand.",
  },
  {
    icon: "bank",
    kicker: "Payouts",
    title: "Paid through Stripe, no SIREN needed",
    text: "Connect once with your ID and bank details. Students get paid as individuals. Cash out from the dashboard.",
  },
];

const faq: { q: string; a: string }[] = [
  { q: "Who pays the service fee?", a: `The buyer, at checkout: ${STUDIO_FEE_RULE_LONG}. Free tickets carry no fee. You receive the full ticket price.` },
  { q: "How do I get paid?", a: "Through Stripe. You connect once with your ID and bank details. You can cash out from the dashboard, and the rest is paid out after the event as sales settle." },
  { q: "Do I need a company or a SIREN?", a: "No. Students and individuals can get paid as individuals." },
  { q: "Do buyers need an account?", a: "No. They pay and get their QR ticket by email straight away." },
  { q: "How does resale work?", a: "A guest lists their ticket on TicketSafe. When someone buys it, the old QR stops working and the buyer gets a new ticket in their own name." },
];

/** The events on sale right now, fetched when the block comes near the screen. Nothing is shown when there are none. */
const EventsOnSale = () => {
  const ref = useRef<HTMLDivElement>(null);
  const near = useNearViewport(ref, "150% 0px");
  const [events, setEvents] = useState<PublishedEvent[]>([]);
  useEffect(() => {
    if (!near) return;
    let cancelled = false;
    fetchPublishedEvents()
      .then((rows) => {
        if (!cancelled) setEvents(rows.slice(0, 5));
      })
      .catch((err) => console.error("[organizers] events:", err));
    return () => {
      cancelled = true;
    };
  }, [near]);

  return (
    <div ref={ref}>
      {events.length > 0 && (
        <section className="gutter">
          <div className="wrap">
            <div className="sec-head">
              <span className="eyebrow">On TicketSafe</span>
              <h2>Events already selling.</h2>
              <p className="lede">From parties to sports, culture and beyond: organizers use TicketSafe to create events and manage tickets easily.</p>
            </div>
            <div className="nights">
              {events.map((e) => {
                const d = new Date(e.date);
                const valid = !Number.isNaN(d.getTime());
                return (
                  <Link className="night" to={`/e/${e.slug}`} key={e.id}>
                    <div className="n-date">
                      <small>{valid ? d.toLocaleDateString("en-GB", { month: "short" }).toUpperCase() : ""}</small>
                      <b>{valid ? d.toLocaleDateString("en-GB", { day: "2-digit" }) : ""}</b>
                    </div>
                    {e.bannerUrl ? <img className="n-img" src={e.bannerUrl} alt="" loading="lazy" /> : <span className="n-img" />}
                    <div className="n-main">
                      <small>{e.organizer}</small>
                      <b>{e.title}</b>
                      <span>
                        {valid ? d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }) : ""}
                        {e.venue ? ` · ${e.venue}` : ""}
                      </span>
                    </div>
                    <span className="n-go">
                      {e.tiersCount > 0 ? (e.priceFrom > 0 ? `From ${formatMoneyShort(e.priceFrom * 100, e.currency)}` : "Free") : "See the event"}
                      <Icon name="arrow" />
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>
      )}
    </div>
  );
};

/** What the buyer pays and what the organizer receives, for a ticket price chosen on the slider. */
const FeeCalculator = () => {
  const [price, setPrice] = useState(EXAMPLE_PRICE_CENTS / 100);
  const priceCents = price * 100;
  const fee = exampleFeeCents(priceCents);
  return (
    <div className="fee-card calc rv">
      <label htmlFor="ol-price">Your ticket price</label>
      <div className="calc-in">
        <input type="range" id="ol-price" min={0} max={80} step={1} value={price} onChange={(e) => setPrice(Number(e.target.value))} aria-describedby="ol-fee-fine" />
        <span className="calc-price">{price === 0 ? "Free" : `€${price}`}</span>
      </div>
      <div>
        <div className="kv"><span>Ticket price</span><b>{formatMoney(priceCents, "EUR")}</b></div>
        <div className="kv"><span>Service fee, paid by the buyer</span><b>{formatMoney(fee, "EUR")}</b></div>
        <div className="kv tot"><span>Buyer pays</span><b>{formatMoney(priceCents + fee, "EUR")}</b></div>
        <div className="kv you"><span>You receive</span><b>{formatMoney(priceCents, "EUR")}</b></div>
      </div>
      <p className="fine" id="ol-fee-fine">Service fee: {studioFeeRuleLong("EUR")}. Nothing on a free ticket.</p>
    </div>
  );
};

const Organizers = () => {
  useThemeMode("night");
  const { organizer } = useOrganizer();

  // The main button follows where the visitor stands: not an organizer yet, approved, or waiting for an answer.
  const cta = !organizer
    ? { to: "/organizers/apply", label: "Request access" }
    : organizer.status === "approved"
      ? { to: "/studio", label: "Open Studio" }
      : { to: "/studio", label: "Application status" };

  const rootRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!rootRef.current) return;
    return mountOrganizersLanding(rootRef.current, { feeEuros: EXAMPLE_FEE_CENTS / 100 });
  }, []);

  return (
    <div className="theme-night min-h-screen flex flex-col bg-background">
      <SEOHead
        title="TicketSafe Studio — Sell out your event. Keep every euro."
        description="Ticketing for every kind of event: ticket tiers, secure QR tickets, door scanning, safe resale and a live dashboard. 0% organizer fee."
        url={`${window.location.origin}/`}
      />

      <HeaderNight />

      <main className="org-landing flex-1" ref={rootRef} lang="en">
        <svg className="sprite" aria-hidden="true">
          <defs>
            <symbol id="ol-i-check" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></symbol>
            <symbol id="ol-i-ticket" viewBox="0 0 24 24"><path d="M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /><path d="M14 6v12" stroke="currentColor" strokeWidth="1.8" strokeDasharray="2 2.5" /></symbol>
            <symbol id="ol-i-qr" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3.5" y="3.5" width="6" height="6" /><rect x="14.5" y="3.5" width="6" height="6" /><rect x="3.5" y="14.5" width="6" height="6" /></g><path d="M14.5 14.5h2.5v2.5h-2.5zM18 18h2.5v2.5H18zM18 14.5h2.5M14.5 18v2.5" stroke="currentColor" strokeWidth="1.8" /></symbol>
            <symbol id="ol-i-users" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.6-3.5 3.3-5.5 6.5-5.5s5.9 2 6.5 5.5" /><path d="M16 4.8a3.5 3.5 0 0 1 0 6.4M18.5 14.8c1.6.8 2.7 2.6 3 5.2" /></g></symbol>
            <symbol id="ol-i-link" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1" /><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1" /></g></symbol>
            <symbol id="ol-i-swap" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 8h14l-3.5-3.5M20 16H6l3.5 3.5" /></g></symbol>
            <symbol id="ol-i-bank" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"><path d="M3 9.5L12 4l9 5.5H3z" /><path d="M5 10v7M9.5 10v7M14.5 10v7M19 10v7M3 20h18" /></g></symbol>
            <symbol id="ol-i-plus" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></symbol>
            <symbol id="ol-i-arrow" viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></symbol>
            <symbol id="ol-i-home" viewBox="0 0 24 24"><path d="M4 10.5L12 4l8 6.5V20h-5v-6H9v6H4z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /></symbol>
            <symbol id="ol-i-cal" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3.5" y="5" width="17" height="15" /><path d="M3.5 10h17M8 3v4M16 3v4" strokeLinecap="round" /></g></symbol>
            <symbol id="ol-i-chart" viewBox="0 0 24 24"><path d="M4 19V5M4 19h16M8 15l4-4 3 3 5-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></symbol>
            <symbol id="ol-i-x" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></symbol>
          </defs>
        </svg>

        {/* hero: the pitch, then the product working */}
        <section className="gutter" data-ol="hero">
          <div className="wrap hero">
            <div className="h-top">
              <div className="h-copy" data-ol="hCopy">
                <span className="eyebrow fadein" style={{ "--i": 0 } as React.CSSProperties}>Ticketing for every kind of event</span>
                <h1 className="h1">
                  <span className="ln"><span style={{ "--i": 0 } as React.CSSProperties}>Sell out your event.</span></span>
                  <span className="ln acc"><span style={{ "--i": 1 } as React.CSSProperties}>Keep every euro.</span></span>
                </h1>
              </div>
              <div className="h-side">
                <p className="h-sub fadein" style={{ "--i": 1 } as React.CSSProperties}>Create events and manage tickets easily. Parties, sports, culture and beyond. You pay 0%.</p>
                <div className="h-ctas fadein" style={{ "--i": 2 } as React.CSSProperties}>
                  <Link className="btn btn-main btn-lg" to={cta.to}>{cta.label} <Icon name="arrow" /></Link>
                  <a className="btn btn-glass btn-lg" href="#ticket">How it works</a>
                </div>
                <ul className="h-facts fadein" style={{ "--i": 3 } as React.CSSProperties}>
                  <li><Icon name="check" />0% organizer fee</li>
                  <li><Icon name="check" />No account needed to buy</li>
                  <li><Icon name="check" />Paid through Stripe</li>
                </ul>
              </div>
            </div>

            <div className="stage" aria-hidden="true">
              <div className="tilt" data-ol="tilt">
                <div className="scale-box" data-w="1200" data-h="700">
                  <div className="scaled">
                    <div className="shot" data-ol="stage">
                      <span className="example-tag">Example data</span>
                      <div className="dash">
                        <aside className="side">
                          <div className="brand"><img className="mark" src="/favicon.svg" alt="" />Studio</div>
                          <div className="nav-i on"><Icon name="home" />Dashboard</div>
                          <div className="nav-i"><Icon name="cal" />Events</div>
                          <div className="nav-i"><Icon name="users" />Attendees</div>
                          <div className="nav-i"><Icon name="chart" />Sales</div>
                          <div className="nav-i"><Icon name="qr" />Scanner</div>
                          <div className="nav-i"><Icon name="link" />Promoters</div>
                          <div className="nav-i"><Icon name="bank" />Payouts</div>
                          <div className="grow" />
                          <div className="newev">+ New event</div>
                        </aside>
                        <div className="dmain">
                          <div className="ev-head">
                            <div className="ev-cover" />
                            <div><h4>Your Event</h4><p>Sat 6 Dec · Paris · Your association</p></div>
                            <span className="live"><i />On sale</span>
                          </div>
                          <div className="panel chart">
                            <div className="bigrow">
                              <div><div className="p-label">Ticket revenue</div><div className="kpi" data-ol="revK"><span className="cur">€</span><span className="flash" data-ol="rev">16,100</span></div></div>
                              <div><div className="p-label">Tickets sold</div><div className="kpi sm" data-ol="soldK"><span className="flash" data-ol="sold">642</span></div></div>
                              <div><div className="p-label">Scanned in</div><div className="kpi sm" style={{ color: "var(--fg-3)" }}>0 <small style={{ fontSize: 14 }}>/ 800</small></div></div>
                            </div>
                            <svg viewBox="0 0 800 250" preserveAspectRatio="none">
                              <defs>
                                <linearGradient id="ol-lg" x1="0" x2="1"><stop offset="0" stopColor="#3a5fe6" /><stop offset="1" stopColor="#aec6ff" /></linearGradient>
                                <linearGradient id="ol-ag" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#3a5fe6" stopOpacity=".35" /><stop offset="1" stopColor="#3a5fe6" stopOpacity="0" /></linearGradient>
                              </defs>
                              <line className="gl" x1="0" x2="800" y1="40" y2="40" /><line className="gl" x1="0" x2="800" y1="120" y2="120" /><line className="gl" x1="0" x2="800" y1="200" y2="200" />
                              <text x="0" y="34">€20k</text><text x="0" y="114">€10k</text><text x="0" y="194">€0</text>
                              <path className="ar" d="M40,198 L120,192 L200,184 L280,170 L360,160 L440,138 L520,120 L600,96 L680,74 L760,54 L760,200 L40,200Z" />
                              <path className="ln" d="M40,198 L120,192 L200,184 L280,170 L360,160 L440,138 L520,120 L600,96 L680,74 L760,54" />
                              <text x="40" y="232">3 Nov</text><text x="280" y="232">10 Nov</text><text x="520" y="232">17 Nov</text><text x="720" y="232">Today</text>
                            </svg>
                          </div>
                          <div style={{ display: "grid", gap: 18, gridTemplateRows: "1fr auto", minHeight: 0 }}>
                            <div className="panel feed">
                              <div className="feed-h"><b>Live sales</b><span>as it happens</span></div>
                              <div data-ol="feed" />
                            </div>
                            <div className="panel">
                              <div className="p-label" style={{ marginBottom: 10 }}>Tiers</div>
                              <div className="tiers-mini">
                                <div className="tm"><div className="tm-top"><b>Early bird</b><span>200 / 200</span></div><div className="bar"><i data-w="100%" /></div></div>
                                <div className="tm"><div className="tm-top"><b>Regular</b><span>412 / 500</span></div><div className="bar"><i data-w="82%" /></div></div>
                                <div className="tm"><div className="tm-top"><b>Last release</b><span>30 / 100</span></div><div className="bar"><i data-w="30%" /></div></div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="phone-wrap" data-ol="phoneWrap">
                <div className="scale-box" data-w="300" data-h="612">
                  <div className="scaled">
                    <div className="phone" data-ol="phone">
                      <div className="ph-screen" data-ol="phScreen">
                        <div className="ph-island" />
                        <div className="ph-bar"><span>21:04</span><span>5G</span></div>
                        <div className="ph-cover"><span className="ph-org">Your association presents</span><b>Your<br />Event</b><span className="ph-date">Sat 6 Dec · 14:00 · Paris</span></div>
                        <div className="ph-tiers">
                          <div className="ph-tier off"><div><b>Early bird</b><small>€18</small></div><span className="ph-badge">Sold out</span></div>
                          <div className="ph-tier on">
                            <div><b>Regular</b><small>€25 + {formatMoney(EXAMPLE_FEE_CENTS, "EUR")} fee</small></div>
                            <div className="qty"><button type="button" tabIndex={-1}>−</button><span data-ol="qN">0</span><button type="button" tabIndex={-1} data-ol="qPlus">+</button></div>
                          </div>
                          <div className="ph-tier off"><div><b>Last release</b><small>€30</small></div><span className="ph-badge nx">Opens next</span></div>
                        </div>
                        <div className="ph-foot">
                          <div className="ph-total"><span>Total</span><b data-ol="qTot">€0.00</b></div>
                          <button type="button" className="ph-pay" tabIndex={-1} data-ol="qPay"><span className="lbl" data-ol="qPayL">Choose tickets</span><i className="spin" /></button>
                        </div>
                        <div className="ph-done">
                          <div className="ok-ic"><Icon name="check" /></div>
                          <b>You're in.</b>
                          <p><span data-ol="dN">2 tickets</span> sent to your inbox</p>
                          <canvas data-ol="phQr" width={25} height={25} />
                          <small>Show this at the door</small>
                        </div>
                        <span className="tap" data-ol="tap" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* the ticket, step by step as the page scrolls */}
        <section className="pin pin-ticket" id="ticket" data-ol="ticketPin" style={{ marginTop: 96 }}>
          <div className="pin-in gutter">
            <div className="wrap tkt">
              <div className="steps-txt">
                <div className="prog" data-ol="prog" aria-hidden="true"><i /><i /><i /><i /></div>
                <div className="st-wrap">
                  <div className="st on"><span className="kick">The ticket</span><h2>Every ticket has a name on it.</h2><p>A QR ticket in the guest's name, in their inbox the moment they pay. No account needed to buy.</p></div>
                  <div className="st"><span className="kick">Resale</span><h2>Plans change. Resale stays safe.</h2><p>Guests resell on TicketSafe. The old QR stops working and the buyer gets a new ticket in their own name.</p></div>
                  <div className="st"><span className="kick">The door</span><h2>One scan. One entry.</h2><p>Your staff scan from any phone with a named link you can revoke after the event.</p></div>
                  <div className="st"><span className="kick">After the scan</span><h2>A screenshot gets nobody in.</h2><p>Once it's scanned, it's done. That's why it's called TicketSafe.</p></div>
                </div>
              </div>
              <div className="tk-stage" aria-hidden="true">
                <div className="toast" data-ol="toast"><Icon name="swap" /><span><s>Camille R.</s> → <b>Sarah K.</b> · €25 · old QR cancelled</span></div>
                <div className="tk-back" />
                <div className="tk" data-ol="tk">
                  <div className="tk-top">
                    <div className="tk-photo"><span className="tk-tag">Ticket 1 of 2</span></div>
                    <div className="tk-body">
                      <div className="tk-ev">Your Event</div>
                      <div className="tk-meta">
                        <div><small>Date</small><b>6 Dec</b></div>
                        <div><small>Doors</small><b>14:00</b></div>
                        <div><small>Tier</small><b>Regular</b></div>
                        <div><small>Price</small><b>€25</b></div>
                      </div>
                      <div><small>Name on ticket</small><span className="nm"><b className="n1">Camille R.</b><b className="n2">Sarah K.</b></span></div>
                    </div>
                    <div className="tk-perf" />
                  </div>
                  <div className="tk-stub">
                    <div className="tk-qr"><canvas data-ol="tkQr" width={25} height={25} /><span className="beam" /></div>
                    <div className="tk-code"><small>Ticket code</small><b data-ol="tkCode">TS-7F3K-29QD</b><span className="state" data-ol="tkState">Valid · scans once</span></div>
                    <div className="tk-stamp">Admitted<small>23:12</small></div>
                  </div>
                </div>
                <div className="fake" data-ol="fake"><div className="shotqr" /><p><svg width="14" height="14" style={{ color: "#fb7185" }}><use href="#ol-i-x" /></svg><span>Screenshot · <b>Already used</b></span></p></div>
              </div>
            </div>
          </div>
        </section>

        {/* features */}
        <section className="gutter" id="features">
          <div className="wrap">
            <div className="sec-head">
              <span className="eyebrow">Built in</span>
              <h2>Everything else your event needs.</h2>
              <p className="lede rv">No spreadsheets, no WhatsApp guest list, no counting promoter sales by hand.</p>
            </div>
            <div className="feat">
              <div className="feat-list">
                {features.map((f, i) => (
                  <div className={`fi${i === 0 ? " on" : ""}`} key={f.kicker}>
                    <span className="kicker"><Icon name={f.icon} />{f.kicker}</span>
                    <h3>{f.title}</h3>
                    <p>{f.text}</p>
                    <div className="fv-slot" aria-hidden="true">{featureCards[i]}</div>
                  </div>
                ))}
              </div>
              <div className="feat-stage" aria-hidden="true">
                {featureCards.map((card, i) => (
                  <div className={`fv${i === 0 ? " on" : ""}`} key={i}>{card}</div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <EventsOnSale />

        {/* fees */}
        <div className="light gutter" id="fees">
          <div className="wrap">
            <div className="sec-head">
              <span className="eyebrow">Fees</span>
              <h2>You keep the whole ticket price.</h2>
              <p className="lede rv">The buyer pays a small service fee at checkout. You pay nothing: no setup, no monthly fee, no commission.</p>
            </div>
            <div className="fees">
              <div className="fee-card rv">
                <div className="p-label">From the organizer</div>
                <div className="fee-zero">0%</div>
                <ul>
                  <li><Icon name="check" />No setup or monthly fee</li>
                  <li><Icon name="check" />Card fees covered by TicketSafe</li>
                  <li><Icon name="check" />Free events are free: no service fee at all</li>
                </ul>
              </div>
              <FeeCalculator />
            </div>
            <div className="vs rv">
              <div className="vs-row"><span className="old">Bank transfers and a Google Sheet</span><Icon name="arrow" /><span className="new">Card checkout, live dashboard</span></div>
              <div className="vs-row"><span className="old">Guest list in a WhatsApp group</span><Icon name="arrow" /><span className="new">Guest list with check-in by name</span></div>
              <div className="vs-row"><span className="old">Screenshots of tickets resold twice</span><Icon name="arrow" /><span className="new">Resale that re-issues the QR</span></div>
              <div className="vs-row"><span className="old">Counting promoter sales by hand</span><Icon name="arrow" /><span className="new">One tracked link per promoter</span></div>
              <div className="vs-row"><span className="old">A platform taking a cut of your price</span><Icon name="arrow" /><span className="new">0% from the organizer</span></div>
            </div>
          </div>
        </div>

        {/* last call to action */}
        <section className="gutter" id="start">
          <div className="wrap final-band" data-ol="band">
            <canvas data-ol="finCv" aria-hidden="true" />
            <div className="final">
              <span className="eyebrow">Get started</span>
              <h2>Your next event starts here.</h2>
              <p className="lede rv">Set up in minutes. We review applications within 24 hours.</p>
              <div className="f-steps">
                <div className="f-step"><span className="n">01</span><h3>Apply</h3><p>Tell us about your organization and your events.</p></div>
                <div className="f-step"><span className="n">02</span><h3>Connect Stripe</h3><p>ID and bank details, once. No SIREN needed for students.</p></div>
                <div className="f-step"><span className="n">03</span><h3>Publish</h3><p>Branded event page with your colours, logo and URL.</p></div>
              </div>
              <div className="f-ctas">
                <Link className="btn btn-main btn-lg" to={cta.to}>{cta.label} <Icon name="arrow" /></Link>
                <a className="btn btn-glass btn-lg" href="#faq">Read the FAQ</a>
              </div>
            </div>
          </div>
        </section>

        <section className="gutter" id="faq">
          <div className="wrap">
            <div className="sec-head" style={{ paddingTop: 96 }}>
              <span className="eyebrow">FAQ</span>
              <h2>Questions organizers ask.</h2>
            </div>
            <div className="faq">
              {faq.map((item) => (
                <details key={item.q}>
                  <summary>{item.q}<Icon name="plus" /></summary>
                  <p>{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default Organizers;
