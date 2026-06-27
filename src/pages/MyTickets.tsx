import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import {
  Loader2,
  ArrowLeft,
  Ticket as TicketIcon,
  ShieldCheck,
  Download,
} from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { BackButton } from "@/components/BackButton";
import { SEOHead } from "@/components/SEOHead";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { downloadTicketPdf } from "@/lib/ticketPdf";
import { toast } from "sonner";
import { Mail } from "lucide-react";

interface OrderRow {
  id: string;
  event_id: string;
  buyer_id: string;
  quantity: number;
  total_cents: number;
  status: string;
  created_at: string;
  event: {
    title: string;
    date: string;
    location: string | null;
    slug: string | null;
    primary_color: string | null;
    banner_url: string | null;
    logo_url: string | null;
  } | null;
  tier: { name: string } | null;
}

interface TicketRow {
  id: string;
  qr_token: string;
  scanned_at: string | null;
  status: "valid" | "scanned" | "cancelled" | "refunded";
  holder_first_name: string | null;
  holder_last_name: string | null;
  holder_email: string | null;
  // External (imported) ticket fields. When source==='external' the buyer's
  // entry artifact is the club's own code/file, not the platform JWT QR.
  source?: "platform" | "external" | null;
  external_code?: string | null;
  external_file_url?: string | null;
  external_provider?: string | null;
}

const MyTickets = () => {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  const [order, setOrder] = useState<OrderRow | null>(null);
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [qrUrls, setQrUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  // Track which ticket is mid-PDF generation so the spinner shows on the
  // right button and we can't double-trigger the download.
  const [pdfPending, setPdfPending] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate(`/auth?next=${encodeURIComponent(`/my-tickets/${orderId ?? ""}`)}`);
    }
  }, [user, authLoading, navigate, orderId]);

  useEffect(() => {
    if (!orderId || !user) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      // Authorisation rule: the user must own at least ONE event_ticket in
      // this order. That covers both Studio primary buyers (they own all
      // tickets in their own order) AND Studio resale buyers (whose new
      // ticket lives under the SELLER's original order_id after transfer).
      const { data: tix } = await supabase
        .from("event_tickets")
        .select("id, qr_token, scanned_at, status, holder_first_name, holder_last_name, holder_email, event_id, tier_id, source, external_code, external_file_url, external_provider")
        .eq("order_id", orderId)
        .eq("buyer_id", user.id)
        .order("created_at", { ascending: true });
      if (!tix || tix.length === 0) {
        if (!cancelled) {
          setOrder(null);
          setLoading(false);
        }
        return;
      }

      const firstEventId = (tix[0] as { event_id: string }).event_id;
      const firstTierId = (tix[0] as { tier_id: string }).tier_id;
      const [{ data: ord }, { data: ev }, { data: tier }] = await Promise.all([
        supabase
          .from("event_orders")
          .select("id, event_id, buyer_id, quantity, total_cents, status, created_at")
          .eq("id", orderId)
          .maybeSingle(),
        supabase
          .from("events")
          .select("title, date, location, slug, primary_color, banner_url, logo_url")
          .eq("id", firstEventId)
          .maybeSingle(),
        supabase
          .from("event_tiers")
          .select("name")
          .eq("id", firstTierId)
          .maybeSingle(),
      ]);

      if (cancelled) return;

      setOrder({
        id: orderId,
        event_id: firstEventId,
        buyer_id: user.id,
        quantity: tix.length,
        total_cents: (ord as { total_cents?: number } | null)?.total_cents ?? 0,
        status: (ord as { status?: string } | null)?.status ?? "paid",
        created_at: (ord as { created_at?: string } | null)?.created_at ?? new Date().toISOString(),
        event: (ev as OrderRow["event"]) ?? null,
        tier: (tier as OrderRow["tier"]) ?? null,
      });
      setTickets(tix as TicketRow[]);

      // Fetch each ticket's QR SVG via the auth-gated edge function. The
      // resulting blob:// URL is the only thing we render.
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL ?? "").replace(/\/+$/, "");
      if (!token || !supabaseUrl) {
        setLoading(false);
        return;
      }
      const urls: Record<string, string> = {};
      for (const t of (tix ?? []) as TicketRow[]) {
        try {
          // External ticket with the club's own code → render THAT as the QR
          // (it's what scans at the venue). No platform JWT involved.
          if (t.source === "external" && t.external_code) {
            // qrcode exposes toDataURL on .default under dynamic import — guard
            // the same way src/lib/ticketPdf.ts does.
            const mod = await import("qrcode");
            const QRCode = (mod as { default?: { toDataURL: (s: string, o: Record<string, unknown>) => Promise<string> } }).default
              ?? (mod as unknown as { toDataURL: (s: string, o: Record<string, unknown>) => Promise<string> });
            urls[t.id] = await QRCode.toDataURL(t.external_code, { errorCorrectionLevel: "M", margin: 2, width: 512 });
            continue;
          }
          // External ticket delivered as a file → no inline QR; the card shows
          // an "Open original ticket" button (signed URL via edge function).
          if (t.source === "external" && t.external_file_url) {
            continue;
          }
          // Native / manual tickets → the platform's signed QR as before.
          const res = await fetch(
            `${supabaseUrl}/functions/v1/event-ticket-qr?ticket_id=${t.id}`,
            { headers: { Authorization: `Bearer ${token}` } },
          );
          if (res.ok) {
            const svg = await res.text();
            const blob = new Blob([svg], { type: "image/svg+xml" });
            urls[t.id] = URL.createObjectURL(blob);
          }
        } catch (e) {
          console.warn("[my-tickets] qr fetch failed for", t.id, e);
        }
      }
      if (!cancelled) {
        setQrUrls(urls);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      // Revoke blob URLs to free memory
      for (const k of Object.keys(qrUrls)) URL.revokeObjectURL(qrUrls[k]);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, user]);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Header />
        <main className="flex-1 flex items-center justify-center p-6">
          <div className="text-center max-w-md">
            <h1 className="text-2xl font-black mb-2">Order not found</h1>
            <p className="text-sm text-muted-foreground mb-5">
              This order does not exist or isn't yours.
            </p>
            <Link to="/settings/purchases" className="text-primary font-bold">
              Back to purchases
            </Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  // Brand identity is non-negotiable: always Ticket Safe blue, even if the
  // event was set up with a custom organiser colour. Matches the gradient
  // used in the Studio QR-ticket email so on-screen and printed tickets
  // look like the same product.
  const TS_GRADIENT = "linear-gradient(135deg, hsl(220 100% 30%), hsl(210 100% 45%))";

  const eventDate = order.event?.date
    ? new Date(order.event.date).toLocaleString("en-GB", {
        weekday: "short",
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SEOHead
        title={`Your tickets — ${order.event?.title ?? "Order"}`}
        description="Show this at the door. Each QR is single-use."
      />
      <Header />

      <main className="flex-1 py-6 md:py-10">
        <div className="container mx-auto px-4 max-w-xl">
          <div className="mb-4">
            <BackButton fallbackPath="/my-tickets" />
          </div>
          <div className="flex items-center justify-between mb-6 gap-3">
            <button
              onClick={() => navigate("/settings/purchases")}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to purchases
            </button>
            <ResendEmailButton orderId={order.id} />
          </div>

          {/* Compact intro — the title lives on each ticket card, so up here
              we only need a quiet summary line. */}
          <div className="text-center mb-6">
            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground mb-2">
              {order.quantity > 1 ? `Your ${order.quantity} tickets` : "Your ticket"}
            </div>
            <h1 className="text-2xl md:text-3xl font-bold leading-tight tracking-tight mb-1">
              {order.event?.title}
            </h1>
            <div className="text-sm text-muted-foreground">
              {eventDate}
              {order.event?.location && ` · ${order.event.location}`}
            </div>
          </div>

          {tickets.length === 0 ? (
            <div className="bg-card border border-border rounded-2xl p-6 text-center">
              <TicketIcon className="w-7 h-7 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                Your tickets will appear here once your payment is confirmed.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {tickets.map((t, i) => {
                const holderName =
                  [t.holder_first_name, t.holder_last_name]
                    .filter(Boolean)
                    .join(" ")
                    .trim();
                // External ticket display flags. hasExtFile => the original
                // club file is the entry artifact (shown as a button).
                const isExternal = t.source === "external";
                const hasExtFile = isExternal && !!t.external_file_url;
                const showPlatformPdf = !isExternal || (!t.external_code && !t.external_file_url);
                return (
                  <article
                    key={t.id}
                    className="relative bg-card border border-border rounded-2xl shadow-md overflow-hidden"
                  >
                    {/* ── TOP: brand-gradient header (mirrors the email) ── */}
                    <div
                      className="relative text-white px-5 md:px-6 pt-5 md:pt-6 pb-7"
                      style={{ background: TS_GRADIENT }}
                    >
                      {/* Soft radial highlight for depth — same trick as the
                          Studio preview ticket and the email header. */}
                      <div
                        className="absolute inset-0 opacity-25 pointer-events-none"
                        style={{
                          backgroundImage:
                            "radial-gradient(circle at 15% 20%, rgba(255,255,255,.35), transparent 45%), radial-gradient(circle at 85% 80%, rgba(255,255,255,.15), transparent 50%)",
                        }}
                      />
                      <div className="relative">
                        <div className="flex items-center justify-between mb-3">
                          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/85">
                            Ticket Safe
                          </div>
                          {tickets.length > 1 && (
                            <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/65">
                              #{i + 1} of {tickets.length}
                            </div>
                          )}
                        </div>
                        <div className="text-lg md:text-xl font-bold leading-tight mb-1.5 line-clamp-2">
                          {order.event?.title}
                        </div>
                        <div className="text-xs text-white/85">
                          {eventDate}
                          {order.event?.location && (
                            <>
                              <span className="mx-1.5 text-white/40">·</span>
                              {order.event.location}
                            </>
                          )}
                        </div>
                        {order.tier && (
                          <div
                            className="inline-block mt-3 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider"
                            style={{ background: "hsl(220 100% 18%)" }}
                          >
                            {order.tier.name}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* ── PERFORATION STRIP ──
                        Two card-coloured circles overlap the gradient/white
                        boundary, biting "notches" out of the gradient edge,
                        and a dashed line runs across the middle — the
                        physical-ticket cliché, done at component level so it
                        works on any card width. */}
                    <div className="relative">
                      <div
                        className="absolute -top-3 -left-3 w-6 h-6 rounded-full"
                        style={{ background: "hsl(var(--background))" }}
                      />
                      <div
                        className="absolute -top-3 -right-3 w-6 h-6 rounded-full"
                        style={{ background: "hsl(var(--background))" }}
                      />
                      <div className="border-t border-dashed border-border mx-4" />
                      <div className="h-2" />
                    </div>

                    {/* ── BOTTOM: holder + QR + actions ── */}
                    <div className="px-5 md:px-6 pt-2 pb-6">
                      {holderName && (
                        <div className="text-center mb-5">
                          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground mb-1">
                            Holder
                          </div>
                          <div className="text-lg md:text-xl font-bold tracking-tight">
                            {holderName}
                          </div>
                          {t.holder_email && (
                            <div className="text-xs text-muted-foreground break-all mt-0.5">
                              {t.holder_email}
                            </div>
                          )}
                        </div>
                      )}

                      {/* QR — centred, white frame, pixelated rendering.
                          For file-only external tickets there's no inline QR;
                          the original file button below is the entry artifact. */}
                      {!(hasExtFile && !qrUrls[t.id]) && (
                        <div className="flex flex-col items-center mb-5">
                          <div className="bg-white p-3 rounded-xl border border-border shadow-soft">
                            {qrUrls[t.id] ? (
                              <img
                                src={qrUrls[t.id]}
                                alt={`Ticket QR ${i + 1}`}
                                className="w-64 h-64 md:w-72 md:h-72 block"
                                style={{ imageRendering: "pixelated" }}
                              />
                            ) : (
                              <div className="w-64 h-64 md:w-72 md:h-72 flex items-center justify-center text-muted-foreground text-xs">
                                QR unavailable
                              </div>
                            )}
                          </div>
                          <div className="text-[11px] text-muted-foreground mt-2.5 inline-flex items-center gap-1.5">
                            <ShieldCheck className="w-3 h-3" />
                            {isExternal ? "Show this at the door" : "Single-use · checked at the door"}
                          </div>
                        </div>
                      )}

                      {/* Original partner/club ticket file — the real entry
                          artifact for file-based external imports. */}
                      {hasExtFile && (
                        <div className="mb-5">
                          <ExternalFileButton ticketId={t.id} />
                          {t.external_provider && (
                            <div className="text-[11px] text-muted-foreground mt-2 text-center">
                              Provided via {t.external_provider}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Status badges */}
                      {t.status === "scanned" && t.scanned_at && (
                        <div className="text-center mb-4">
                          <div className="text-xs font-bold text-amber-700 bg-amber-100 inline-flex items-center gap-1 px-2.5 py-1 rounded-full">
                            Used on {new Date(t.scanned_at).toLocaleString("en-GB")}
                          </div>
                        </div>
                      )}
                      {t.status === "refunded" && (
                        <div className="text-center mb-4">
                          <div className="text-xs font-bold text-red-700 bg-red-100 inline-flex items-center gap-1 px-2.5 py-1 rounded-full">
                            Refunded — no longer valid
                          </div>
                        </div>
                      )}
                      {t.status === "cancelled" && (
                        <div className="text-center mb-4">
                          <div className="text-xs font-bold text-red-700 bg-red-100 inline-flex items-center gap-1 px-2.5 py-1 rounded-full">
                            Cancelled
                          </div>
                        </div>
                      )}

                      {/* Download PDF — full-width brand-blue CTA. Hidden for
                          external tickets whose entry artifact is the club's
                          own code/file (the platform PDF isn't what scans). */}
                      {showPlatformPdf && qrUrls[t.id] && order?.event && (
                        <button
                          type="button"
                          disabled={pdfPending === t.id}
                          onClick={async () => {
                            if (!order?.event || !qrUrls[t.id]) return;
                            setPdfPending(t.id);
                            try {
                              // Compute per-ticket price from the order
                              // total. Falls back to "—" if either piece
                              // is missing.
                              const perTicketEuros =
                                order.total_cents > 0 && tickets.length > 0
                                  ? (order.total_cents / 100 / tickets.length)
                                  : null;
                              const pricePaid =
                                perTicketEuros != null
                                  ? `${perTicketEuros.toFixed(2)}€`
                                  : "—";
                              // Status mapping: ticket.status "valid"
                              // -> "Valid", scanned -> "Used", refunded/
                              // cancelled -> "Cancelled".
                              const statusMap: Record<string, "Valid" | "Used" | "Cancelled"> = {
                                valid: "Valid",
                                scanned: "Used",
                                refunded: "Cancelled",
                                cancelled: "Cancelled",
                              };
                              const status = statusMap[t.status] ?? "Valid";

                              await downloadTicketPdf({
                                eventTitle: order.event.title,
                                eventDate: order.event.date,
                                eventLocation: order.event.location,
                                eventLogoUrl: order.event.logo_url,
                                tierName: order.tier?.name ?? null,
                                holderName: holderName || "Guest",
                                holderEmail: t.holder_email,
                                ticketId: t.id,
                                orderId: order.id,
                                ticketIndex: i + 1,
                                ticketTotal: tickets.length,
                                qrSvgUrl: qrUrls[t.id],
                                pricePaid,
                                // Wires the new generator to use a real
                                // verify URL (the scanner will hit it and
                                // call validate-event-ticket). The QR
                                // payload here drives the rendered QR; the
                                // server-side qr_token JWT is unaffected.
                                qrToken: `https://ticket-safe.eu/verify/${t.id}`,
                                organizerName: "ESCP Students' Union",
                                status,
                              });
                              toast.success("Ticket downloaded.");
                            } catch (err) {
                              console.error("[my-tickets] pdf failed:", err);
                              toast.error("Could not generate the PDF. Try again.");
                            } finally {
                              setPdfPending(null);
                            }
                          }}
                          className="w-full inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-lg font-semibold text-white text-sm bg-primary hover:shadow-md disabled:opacity-60 transition-all"
                        >
                          {pdfPending === t.id ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              Preparing…
                            </>
                          ) : (
                            <>
                              <Download className="w-4 h-4" />
                              Download PDF ticket
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
};

// Opens the ORIGINAL partner/club ticket file for an imported ticket. The
// file lives in a private bucket, so we ask the external-ticket-file edge
// function for a short-lived signed URL (it verifies the caller owns the
// ticket) and open it in a new tab.
const ExternalFileButton = ({ ticketId }: { ticketId: string }) => {
  const [loading, setLoading] = useState(false);
  const handleClick = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("external-ticket-file", {
        body: { ticket_id: ticketId },
      });
      const url = (data as { url?: string } | null)?.url;
      if (error || !url) {
        toast.error((data as { error?: string })?.error ?? error?.message ?? "Could not open your ticket.");
        return;
      }
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Network error.");
    } finally {
      setLoading(false);
    }
  };
  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className="w-full inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-lg font-semibold text-white text-sm bg-primary hover:shadow-md disabled:opacity-60 transition-all"
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
      Open your entry ticket
    </button>
  );
};

// Re-send the order confirmation email (with each ticket QR card).
// Useful when the buyer can't find the original message in their inbox.
const ResendEmailButton = ({ orderId }: { orderId: string }) => {
  const [sending, setSending] = useState(false);
  const [sentAt, setSentAt] = useState<number | null>(null);
  const handleClick = async () => {
    if (sending) return;
    if (sentAt && Date.now() - sentAt < 60_000) {
      toast.info("Email already sent. Wait a minute before re-trying.");
      return;
    }
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("replay-order-email", {
        body: { order_id: orderId },
      });
      if (error || (data as { error?: string })?.error) {
        toast.error((data as { error?: string })?.error ?? error?.message ?? "Could not resend.");
        return;
      }
      setSentAt(Date.now());
      toast.success("Confirmation email re-sent to your inbox.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Network error.");
    } finally {
      setSending(false);
    }
  };
  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={sending}
      className="inline-flex items-center gap-1.5 px-3 min-h-[34px] rounded-lg text-xs font-bold bg-muted hover:bg-muted/80 border border-border disabled:opacity-60"
      title="Resend the original ticket email"
    >
      {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
      Resend email
    </button>
  );
};

export default MyTickets;
