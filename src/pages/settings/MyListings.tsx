import { useState, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import HeaderNight from "@/components/HeaderNight";
import { useThemeMode } from "@/hooks/useThemeMode";
import Footer from "@/components/Footer";
import { BackButton } from "@/components/BackButton";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/contexts/I18nContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Ticket,
  Tag,
  Calendar,
  MapPin,
  Search,
  ArrowUpDown,
  PencilLine,
  Trash2,
  Sparkles,
  TrendingUp,
  CheckCircle2,
  Clock,
  XCircle,
  Euro,
  Plus,
  Banknote,
  ArrowRight,
  Loader2,
  Download,
} from "lucide-react";
import { toast as sonnerToast } from "sonner";
import { generatePayoutReceiptPDF } from "@/lib/payoutReceiptPdf";
import { RESALE_BUYER_FEE_COPY, RESALE_SELLER_COMMISSION_COPY, calcBreakdown } from "@/lib/fees";
import { Chip, WalletOverview } from "@/components/wallet/WalletOverview";
import { authPathHere } from "@/lib/returnTo";
import { callRpc } from "@/lib/supabaseRpc";
import {
  cancelMyListing,
  fetchMyListings,
  listingErrorMessage,
  updateMyListingPrice,
  type MyListingRow,
} from "@/lib/sellerListings";

// ─── Types ───────────────────────────────────────────────────────────────────

interface EventInfo {
  id: string;
  title: string;
  date: string;
  location: string | null;
  category: string;
}

interface RawListing {
  id: string;
  event_id: string;
  selling_price: number | null;
  quantity: number;
  notes: string | null;
  status: string;
  created_at: string;
  boosted_until: string | null;
  event: EventInfo | null;
  qr_verified?: boolean;
}

type StatusFilter = "all" | "available" | "sold" | "reserved";
type SortOption = "newest" | "oldest" | "price_high" | "price_low" | "active_first";

// Featured-listing (boost) durations — prices must match the server
// (revolut-boost-checkout BOOST_PRICES_CENTS).
const BOOST_OPTIONS = [
  { days: 3, price: "€0.99" },
  { days: 7, price: "€1.99" },
  { days: 30, price: "€4.99" },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  available: "Active",
  sold: "Sold",
  reserved: "Cancelled",
};

const StatusBadge = ({ status }: { status: string }) => {
  if (status === "available") return <Chip tone="good">Active</Chip>;
  if (status === "sold") return <Chip tone="accent">Sold</Chip>;
  return <Chip>Cancelled</Chip>;
};

// ─── Main Component ───────────────────────────────────────────────────────────

const MyListings = () => {
  useThemeMode("night");
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { language } = useI18n();
  const dateLocale = language === "fr" ? "fr-FR" : "en-GB";

  const [listings, setListings] = useState<RawListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  // Default to showing ACTIVE listings first (sold/cancelled fall below).
  const [sort, setSort] = useState<SortOption>("active_first");

  // Resale-seller earnings (gross of 5% Ticket Safe withdrawal fee).
  const [earnings, setEarnings] = useState<{
    net_earned_cents: number;
    claimed_cents: number;
    available_cents: number;
    completed_sales: number;
  } | null>(null);
  const [payoutModalOpen, setPayoutModalOpen] = useState(false);
  // Bumped after a withdrawal request so the history and pending amount reload.
  const [walletReload, setWalletReload] = useState(0);

  // The header's Withdraw button lands here with ?withdraw=1: open the payout
  // form once the user is known, then drop the param so a refresh won't reopen it.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    if (!user || searchParams.get("withdraw") !== "1") return;
    setPayoutModalOpen(true);
    const next = new URLSearchParams(searchParams);
    next.delete("withdraw");
    setSearchParams(next, { replace: true });
  }, [user, searchParams, setSearchParams]);

  const loadEarnings = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("seller_earnings")
      .select("net_earned_cents, claimed_cents, available_cents, completed_sales")
      .eq("seller_id", user.id)
      .maybeSingle();
    setEarnings((data as { net_earned_cents: number; claimed_cents: number; available_cents: number; completed_sales: number } | null) ?? { net_earned_cents: 0, claimed_cents: 0, available_cents: 0, completed_sales: 0 });
  };

  useEffect(() => {
    if (user) loadEarnings();
  }, [user]);

  // Edit price state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState("");
  const [editLoading, setEditLoading] = useState(false);

  // Cancel confirmation state
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [cancelLoading, setCancelLoading] = useState(false);

  // Boost (featured listing) state
  const [boostListingId, setBoostListingId] = useState<string | null>(null);
  const [boostDays, setBoostDays] = useState(7);
  const [boostLoading, setBoostLoading] = useState(false);

  const handleBoost = async () => {
    if (!boostListingId) return;
    setBoostLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        toast({ title: "Please log in again.", variant: "destructive" });
        return;
      }
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/revolut-boost-checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ listingId: boostListingId, days: boostDays }),
      });
      const data = await res.json();
      if (!res.ok || !data.checkout_url) {
        toast({ title: data.error ?? "Could not start the boost checkout.", variant: "destructive" });
        return;
      }
      window.location.href = data.checkout_url;
    } catch {
      toast({ title: "Network error. Please try again.", variant: "destructive" });
    } finally {
      setBoostLoading(false);
    }
  };

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      navigate(authPathHere(), { replace: true });
    }
  }, [user, authLoading, navigate]);

  // Fetch seller's listings: my_listings() (own rows only, notes included; the tickets table itself no
  // longer exposes seller_id or notes to the browser), then the events in a second query.
  const fetchListings = async () => {
    if (!user) return;
    setLoading(true);

    let rows: MyListingRow[];
    try {
      rows = await fetchMyListings(callRpc);
    } catch (err) {
      console.error("Error fetching listings:", err);
      const raw = err instanceof Error ? err.message : null;
      toast({ title: "Error loading listings", description: listingErrorMessage(raw, "Please try again in a moment."), variant: "destructive" });
      setLoading(false);
      return;
    }

    if (rows.length === 0) {
      setListings([]);
      setLoading(false);
      return;
    }

    // 2. Fetch event details for all unique event IDs
    const eventIds = [...new Set(rows.map((r) => r.eventId))];
    const { data: eventRows } = await supabase
      .from("events")
      .select("id, title, date, location, category")
      .in("id", eventIds);

    const eventsMap: Record<string, EventInfo> = {};
    for (const ev of eventRows ?? []) {
      eventsMap[ev.id] = ev as EventInfo;
    }

    // 3. Merge
    const merged: RawListing[] = rows.map((r) => ({
      id: r.id,
      event_id: r.eventId,
      selling_price: r.sellingPrice,
      quantity: r.quantity,
      notes: r.notes,
      status: r.status,
      created_at: r.createdAt,
      boosted_until: r.boostedUntil,
      event: eventsMap[r.eventId] ?? null,
    }));

    setListings(merged);
    setLoading(false);
  };

  useEffect(() => {
    if (user) fetchListings();
  }, [user]);

  // ── Derived stats ──────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const active = listings.filter((l) => l.status === "available").length;
    const sold = listings.filter((l) => l.status === "sold").length;
    const cancelled = listings.filter((l) => l.status === "reserved").length;
    const earnings = listings
      .filter((l) => l.status === "sold")
      .reduce((sum, l) => sum + (l.selling_price ?? 0) * 0.95, 0); // 5% platform fee
    return { active, sold, cancelled, earnings };
  }, [listings]);

  // ── Filtered + sorted listings ─────────────────────────────────────────────
  const displayed = useMemo(() => {
    let list = [...listings];

    // Status filter
    if (statusFilter !== "all") {
      list = list.filter((l) => l.status === statusFilter);
    }

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (l) =>
          l.event?.title.toLowerCase().includes(q) ||
          l.event?.location?.toLowerCase().includes(q) ||
          l.event?.category.toLowerCase().includes(q)
      );
    }

    // Sort
    list.sort((a, b) => {
      if (sort === "newest") return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      if (sort === "oldest") return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      if (sort === "price_high") return (b.selling_price ?? 0) - (a.selling_price ?? 0);
      if (sort === "price_low") return (a.selling_price ?? 0) - (b.selling_price ?? 0);
      if (sort === "active_first") {
        const order = { available: 0, sold: 1, reserved: 2 };
        return (order[a.status as keyof typeof order] ?? 3) - (order[b.status as keyof typeof order] ?? 3);
      }
      return 0;
    });

    return list;
  }, [listings, statusFilter, search, sort]);

  // ── Edit price ─────────────────────────────────────────────────────────────
  const openEdit = (listing: RawListing) => {
    setEditingId(listing.id);
    setEditPrice((listing.selling_price ?? "").toString());
  };

  const savePrice = async () => {
    if (!editingId) return;
    const price = parseFloat(editPrice);
    if (!isFinite(price) || price <= 0 || price > 10_000) {
      toast({ title: "Invalid price", description: "Enter a valid price between €0.01 and €10,000.", variant: "destructive" });
      return;
    }
    setEditLoading(true);
    try {
      await updateMyListingPrice(callRpc, editingId, price);
      setListings((prev) =>
        prev.map((l) => (l.id === editingId ? { ...l, selling_price: price } : l))
      );
      toast({ title: "Price updated", description: `New price: €${price.toFixed(2)}` });
      setEditingId(null);
    } catch (err) {
      const raw = err instanceof Error ? err.message : null;
      toast({ title: "Failed to update price", description: listingErrorMessage(raw, "Please try again."), variant: "destructive" });
    }
    setEditLoading(false);
  };

  // ── Delete listing ─────────────────────────────────────────────────────────
  const confirmCancel = async () => {
    if (!cancelId) return;
    setCancelLoading(true);
    try {
      await cancelMyListing(callRpc, cancelId);
      setListings((prev) => prev.filter((l: RawListing) => l.id !== cancelId));
      toast({ title: "Listing deleted", description: "Your ticket has been removed." });
      setCancelId(null);
    } catch (err) {
      const raw = err instanceof Error ? err.message : null;
      toast({ title: "Failed to delete listing", description: listingErrorMessage(raw, "Please try again."), variant: "destructive" });
    }
    setCancelLoading(false);
  };

  // ── Loading / auth guard ───────────────────────────────────────────────────
  if (authLoading || loading) {
    return (
      <div className="theme-night min-h-screen bg-background">
        <HeaderNight />
        <main className="pt-20 pb-16 md:pt-24 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-[9999px] h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
            <p className="text-muted-foreground">Loading your listings…</p>
          </div>
        </main>
      </div>
    );
  }

  if (!user) return null;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="theme-night min-h-screen bg-background flex flex-col">
      <HeaderNight />
      <main className="flex-1 pt-20 pb-10 md:pt-24">
        <div className="container mx-auto px-4 max-w-5xl">
          <div className="mb-8">
            <BackButton />
          </div>

          <WalletOverview
            userId={user.id}
            earnings={earnings}
            reloadKey={walletReload}
            onWithdraw={() => setPayoutModalOpen(true)}
            onSell={() => navigate("/marketplace/sell")}
          />

          {/* ===== Listings: the tickets put up for resale ===== */}
          <section aria-labelledby="listings-heading" className="mt-12 md:mt-14">
          <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-200">Listings</div>
          <h2 id="listings-heading" className="mt-3 font-display text-[28px] font-bold tracking-[-0.02em] leading-tight">Your tickets for sale</h2>

          <dl className="mt-5 mb-6 grid grid-cols-2 md:grid-cols-4 border border-brand-200/25">
            {[
              ["Active", String(stats.active)],
              ["Sold", String(stats.sold)],
              ["Cancelled", String(stats.cancelled)],
              ["Sales value", `€${stats.earnings.toFixed(0)}`],
            ].map(([k, v], i) => (
              <div key={k} className={`p-4 ${i % 2 ? "border-l border-brand-200/25" : ""} ${i >= 2 ? "border-t md:border-t-0 border-brand-200/25" : ""} ${i === 2 ? "md:border-l" : ""}`}>
                <dt className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{k}</dt>
                <dd className="mt-1 font-display text-2xl font-bold tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>

          {/* Controls */}
          <div className="flex flex-col md:flex-row gap-3 mb-6">
            {/* Status tabs */}
            <div className="flex gap-2 overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0" role="tablist" aria-label="Filter listings">
              {(["all", "available", "sold", "reserved"] as StatusFilter[]).map((s) => (
                <button
                  key={s}
                  role="tab"
                  aria-selected={statusFilter === s}
                  onClick={() => setStatusFilter(s)}
                  className={`shrink-0 inline-flex items-center gap-1.5 h-11 md:h-9 px-4 rounded-full border text-[13px] font-semibold transition-colors ${
                    statusFilter === s
                      ? "border-brand-200/60 text-foreground bg-brand-200/10"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {s === "all" ? "All" : STATUS_LABELS[s]}
                  <span className="tabular-nums opacity-70">
                    {s === "all"
                      ? listings.length
                      : listings.filter((l) => l.status === s).length}
                  </span>
                </button>
              ))}
            </div>

            <div className="flex gap-2 md:ml-auto">
              {/* Search */}
              <div className="relative flex-1 md:flex-none">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search listings…"
                  aria-label="Search listings"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 h-11 md:h-10 w-full md:w-52"
                />
              </div>
              {/* Sort */}
              <select
                value={sort}
                aria-label="Sort listings"
                onChange={(e) => setSort(e.target.value as SortOption)}
                className="h-11 md:h-10 w-36 md:w-auto rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="price_high">Price: high → low</option>
                <option value="price_low">Price: low → high</option>
                <option value="active_first">Active first</option>
              </select>
            </div>
          </div>

          {/* Empty state */}
          {displayed.length === 0 && (
            <div className="border border-dashed border-border px-6 py-12 text-center">
              <p className="font-display text-lg font-bold">
                {listings.length === 0 ? "No listings yet" : "No results"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {listings.length === 0
                  ? "You haven't listed any tickets yet. Start by selling a ticket!"
                  : "Try adjusting your filters or search."}
              </p>
              {listings.length === 0 && (
                <Button variant="outline" onClick={() => navigate("/marketplace/sell")} className="mt-5 gap-2">
                  <Plus className="w-4 h-4" />
                  Sell a ticket
                </Button>
              )}
            </div>
          )}

          {/* Listings */}
          <ul className="space-y-3">
            {displayed.map((listing) => {
              const eventDate = listing.event?.date
                ? new Date(listing.event.date).toLocaleDateString(dateLocale, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })
                : "—";
              const listedDate = new Date(listing.created_at).toLocaleDateString(dateLocale, {
                month: "short",
                day: "numeric",
                year: "numeric",
              });
              const isActive = listing.status === "available";
              const boosted = !!listing.boosted_until && new Date(listing.boosted_until) > new Date();

              return (
                <li
                  key={listing.id}
                  className={`border border-brand-200/25 bg-background p-5 ${isActive ? "" : "opacity-75"}`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                    {/* Event info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <StatusBadge status={listing.status} />
                        {listing.event?.category && <Chip>{listing.event.category}</Chip>}
                        {listing.qr_verified && <Chip tone="good">Verified</Chip>}
                        {boosted && <Chip tone="accent">Featured</Chip>}
                      </div>
                      <h3 className="font-display text-lg font-bold tracking-[-0.01em] leading-tight mb-2 line-clamp-1">
                        {listing.event?.title ?? "Unknown Event"}
                      </h3>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5" />
                          {eventDate}
                        </span>
                        {listing.event?.location && (
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5" />
                            {listing.event.location}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Ticket className="w-3.5 h-3.5" />
                          {listing.quantity} ticket{listing.quantity !== 1 ? "s" : ""}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          Listed {listedDate}
                        </span>
                      </div>
                    </div>

                    {/* Price + actions */}
                    <div className="flex flex-col sm:items-end gap-3 flex-shrink-0">
                      <div className="sm:text-right">
                        <p className="font-display text-2xl font-bold tabular-nums">
                          €{(listing.selling_price ?? 0).toFixed(2)}
                        </p>
                        <p className="text-xs text-muted-foreground">per ticket</p>
                      </div>

                      {isActive && (
                        <div className="flex flex-wrap gap-2 sm:justify-end">
                          <Button size="sm" variant="outline" className="gap-1.5 text-[13px]" onClick={() => openEdit(listing)}>
                            <PencilLine className="w-3.5 h-3.5" />
                            Edit price
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5 text-[13px]"
                            onClick={() => {
                              setBoostListingId(listing.id);
                              setBoostDays(7);
                            }}
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                            {boosted ? "Boosted" : "Boost"}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="gap-1.5 text-[13px] text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => setCancelId(listing.id)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Cancel
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Notes preview */}
                  {listing.notes && (
                    <p className="mt-3 text-[13px] text-muted-foreground border-l border-brand-200/40 pl-3 line-clamp-1">
                      "{listing.notes}"
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
          </section>
        </div>
      </main>

      {/* Boost (featured listing) Dialog */}
      <Dialog open={!!boostListingId} onOpenChange={(open) => !open && setBoostListingId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-500" />
              Feature your listing
            </DialogTitle>
            <DialogDescription>
              Featured listings appear at the top of the marketplace with a "Featured" badge — more
              views, faster sale.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            {BOOST_OPTIONS.map((opt) => (
              <button
                key={opt.days}
                type="button"
                onClick={() => setBoostDays(opt.days)}
                className={`w-full flex items-center justify-between rounded-lg border p-3 text-sm transition-colors ${
                  boostDays === opt.days ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                }`}
              >
                <span className="font-medium">{opt.days} days featured</span>
                <span className="font-bold">{opt.price}</span>
              </button>
            ))}
          </div>
          <DialogFooter>
            <Button variant="hero" className="w-full" disabled={boostLoading} onClick={handleBoost}>
              {boostLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Boost now — pay with Revolut"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Price Dialog */}
      <Dialog open={!!editingId} onOpenChange={(open) => !open && setEditingId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Tag className="w-5 h-5 text-primary" />
              Edit Price
            </DialogTitle>
            <DialogDescription>
              Set a new price for your listing. Buyers will see the updated price immediately.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Label htmlFor="edit-price" className="text-sm font-medium mb-2 block">
              New Price (€)
            </Label>
            <div className="relative">
              <Euro className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="edit-price"
                type="number"
                min="0.01"
                max="10000"
                step="0.01"
                value={editPrice}
                onChange={(e) => setEditPrice(e.target.value)}
                className="pl-9"
                placeholder="0.00"
                onKeyDown={(e) => e.key === "Enter" && savePrice()}
              />
            </div>
            {editPrice && parseFloat(editPrice) > 0 && (
              <p className="text-xs text-muted-foreground mt-2">
                You'll receive €{calcBreakdown(parseFloat(editPrice), 1).sellerPayoutEuros.toFixed(2)} ({RESALE_SELLER_COMMISSION_COPY} commission). The buyer pays a {RESALE_BUYER_FEE_COPY} service fee on top.
              </p>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditingId(null)} disabled={editLoading}>
              Cancel
            </Button>
            <Button onClick={savePrice} disabled={editLoading} className="gap-2">
              {editLoading ? (
                <span className="animate-spin border-2 border-white border-t-transparent rounded-[9999px] w-4 h-4" />
              ) : (
                <CheckCircle2 className="w-4 h-4" />
              )}
              Save Price
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!cancelId} onOpenChange={(open) => !open && setCancelId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="w-5 h-5" />
              Delete Listing
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this listing? It will be permanently removed. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setCancelId(null)} disabled={cancelLoading}>
              Keep Listing
            </Button>
            <Button
              variant="destructive"
              onClick={confirmCancel}
              disabled={cancelLoading}
              className="gap-2"
            >
              {cancelLoading ? (
                <span className="animate-spin border-2 border-white border-t-transparent rounded-[9999px] w-4 h-4" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
              Yes, Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {payoutModalOpen && user && (
        <SellerPayoutModal
          userId={user.id}
          available={earnings?.available_cents ?? 0}
          claimed={earnings?.claimed_cents ?? 0}
          netEarned={earnings?.net_earned_cents ?? 0}
          onClose={() => setPayoutModalOpen(false)}
          onSubmitted={() => {
            setPayoutModalOpen(false);
            loadEarnings();
            setWalletReload((n) => n + 1);
            sonnerToast.success("Payout requested. SEPA transfer within 2-3 business days.");
          }}
        />
      )}

      <Footer />
    </div>
  );
};

interface SellerPayoutHistoryRow {
  id: string;
  amount_cents: number;
  gross_cents: number | null;
  fee_cents: number | null;
  status: "requested" | "processing" | "sent" | "failed" | "cancelled";
  iban_used: string;
  iban_holder_used: string;
  requested_at: string;
  sent_at: string | null;
}

// ────────────────────────────────────────────────────────────────────────────
// SellerPayoutModal — mirror of the Studio PayoutModal but wired to
// request-seller-payout. No KYC, just an IBAN + amount. The 5% Ticket Safe
// fee is computed live and subtracted from the gross at submit.
// ────────────────────────────────────────────────────────────────────────────
const SellerPayoutModal = ({
  userId,
  available,
  claimed,
  netEarned,
  onClose,
  onSubmitted,
}: {
  userId: string;
  available: number;
  claimed: number;
  netEarned: number;
  onClose: () => void;
  onSubmitted: () => void;
}) => {
  const [iban, setIban] = useState("");
  const [holder, setHolder] = useState("");
  const [amount, setAmount] = useState(((available || 0) / 100).toFixed(2));
  const [submitting, setSubmitting] = useState(false);
  const [history, setHistory] = useState<SellerPayoutHistoryRow[]>([]);
  const [loadedDefaults, setLoadedDefaults] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [{ data: profile }, { data: hist }] = await Promise.all([
        supabase.from("profiles").select("payout_iban, payout_iban_holder").eq("id", userId).maybeSingle(),
        supabase.from("seller_payouts").select("id, amount_cents, gross_cents, fee_cents, status, iban_used, iban_holder_used, requested_at, sent_at").eq("seller_id", userId).order("requested_at", { ascending: false }).limit(10),
      ]);
      if (profile?.payout_iban) setIban((profile.payout_iban as string).replace(/\s+/g, "").toUpperCase());
      if (profile?.payout_iban_holder) setHolder(profile.payout_iban_holder as string);
      setHistory((hist as SellerPayoutHistoryRow[]) ?? []);
      setLoadedDefaults(true);
    })();
  }, [userId]);

  const downloadReceipt = async (p: SellerPayoutHistoryRow) => {
    setDownloadingId(p.id);
    try {
      const grossCents = p.gross_cents ?? p.amount_cents;
      const feeCents = p.fee_cents ?? Math.max(grossCents - p.amount_cents, 0);
      await generatePayoutReceiptPDF({
        kind: "resale",
        payoutId: p.id,
        beneficiaryName: p.iban_holder_used,
        iban: p.iban_used,
        grossCents,
        feeCents,
        feePercent: 5,
        netCents: p.amount_cents,
        sentAt: p.sent_at,
        requestedAt: p.requested_at,
        status: p.status,
      });
    } finally {
      setDownloadingId(null);
    }
  };

  const cleanedIban = iban.replace(/\s+/g, "").toUpperCase();
  const ibanValid = /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(cleanedIban);
  const cents = Math.round(parseFloat(amount.replace(",", ".") || "0") * 100);
  const amountValid = Number.isFinite(cents) && cents >= 100 && cents <= available;
  const canSubmit = ibanValid && holder.trim().length >= 2 && amountValid && !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    const { data, error } = await supabase.functions.invoke("request-seller-payout", {
      body: { amount_cents: cents, iban: cleanedIban, iban_holder: holder.trim() },
    });
    setSubmitting(false);
    if (error || (data as { error?: string })?.error) {
      sonnerToast.error((data as { error?: string })?.error ?? error?.message ?? "Could not request the payout.");
      return;
    }
    onSubmitted();
  };

  const feeCents = amountValid && cents > 0 ? Math.round(cents * 0.05) : 0;
  const netCents = cents - feeCents;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end md:items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card w-full max-w-lg rounded-2xl shadow-2xl border border-border max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-5 border-b border-border flex items-start justify-between">
          <div>
            <h2 className="text-xl font-black">Get paid</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Resale earnings · SEPA · 2-3 business days · no KYC</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xl leading-none">×</button>
        </div>

        <div className="px-6 py-5 space-y-5">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-success/10 border border-success/30 p-3">
              <div className="text-[10px] uppercase tracking-wider font-bold text-success/80">Available</div>
              <div className="text-lg font-black text-success">€{(available / 100).toFixed(2)}</div>
            </div>
            <div className="rounded-xl bg-muted border border-border p-3">
              <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">In progress</div>
              <div className="text-lg font-black">€{(claimed / 100).toFixed(2)}</div>
            </div>
            <div className="rounded-xl bg-muted border border-border p-3">
              <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Total earned</div>
              <div className="text-lg font-black">€{(netEarned / 100).toFixed(2)}</div>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-muted/40 p-4 text-xs leading-relaxed text-muted-foreground">
            <div className="font-bold text-foreground mb-1.5 text-[11px] uppercase tracking-wider">Fee breakdown</div>
            Buyers pay a <strong className="text-foreground">service fee of {RESALE_BUYER_FEE_COPY}</strong> on top at checkout (already deducted upstream).
            Ticket Safe takes another <strong className="text-foreground">5%</strong> when you withdraw — net wired to your IBAN.
          </div>

          {!loadedDefaults ? (
            <div className="py-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
          ) : available <= 0 ? (
            <div className="rounded-xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
              Nothing to withdraw yet. Funds become available as your resale listings sell.
            </div>
          ) : (
            <>
              <div>
                <label className="text-xs font-bold text-muted-foreground mb-1 block">IBAN holder name</label>
                <input value={holder} onChange={(e) => setHolder(e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-sm" placeholder="Your full name" maxLength={120} />
              </div>
              <div>
                <label className="text-xs font-bold text-muted-foreground mb-1 block">IBAN</label>
                <input value={iban} onChange={(e) => setIban(e.target.value.toUpperCase())} className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-sm font-mono" placeholder="FR76 3000 4000 0312 3456 7890 143" maxLength={40} />
                {iban && !ibanValid && (<p className="text-xs text-amber-400 mt-1">IBAN format looks off — double-check the digits.</p>)}
              </div>
              <div>
                <label className="text-xs font-bold text-muted-foreground mb-1 block">Amount to withdraw (EUR)</label>
                <div className="flex items-center gap-2">
                  <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} step="0.01" min="1" max={(available / 100).toFixed(2)} className="flex-1 px-3 py-2.5 rounded-lg border border-border bg-background text-sm" />
                  <button type="button" onClick={() => setAmount(((available || 0) / 100).toFixed(2))} className="px-3 py-2.5 rounded-lg border border-border text-xs font-bold hover:bg-muted">Max</button>
                </div>
                {!amountValid && (<p className="text-xs text-amber-400 mt-1">Amount must be between €1.00 and €{(available / 100).toFixed(2)}.</p>)}
              </div>

              {amountValid && cents > 0 && (
                <div className="rounded-xl bg-primary/5 border border-primary/20 p-4 text-sm space-y-1.5">
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span>Gross withdrawal</span>
                    <span>€{(cents / 100).toFixed(2)}</span>
                  </div>
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span>Ticket Safe fee (5%)</span>
                    <span>−€{(feeCents / 100).toFixed(2)}</span>
                  </div>
                  <div className="flex items-center justify-between font-black text-foreground text-base border-t border-primary/20 pt-1.5 mt-1.5">
                    <span>You will receive</span>
                    <span className="text-primary">€{(netCents / 100).toFixed(2)}</span>
                  </div>
                </div>
              )}

              <button onClick={submit} disabled={!canSubmit} className="w-full inline-flex items-center justify-center gap-2 min-h-[44px] rounded-lg font-bold bg-primary text-primary-foreground hover:bg-primary-hover disabled:opacity-60">
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : (<><ArrowRight className="w-4 h-4" />Request €{(netCents / 100).toFixed(2)} net</>)}
              </button>
              <p className="text-[11px] text-muted-foreground text-center">
                Ticket Safe deducts 5% at withdrawal. Net wired to your IBAN within 2-3 business days. No KYC required.
              </p>
            </>
          )}

          {history.length > 0 && (
            <div className="pt-4 border-t border-border">
              <h3 className="text-xs uppercase tracking-wider font-bold text-muted-foreground mb-2">Recent payouts</h3>
              <div className="space-y-2">
                {history.map((p) => (
                  <div key={p.id} className="flex items-center justify-between text-sm gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold">€{(p.amount_cents / 100).toFixed(2)}</div>
                      <div className="text-[11px] text-muted-foreground truncate">{p.iban_used.slice(0, 4)} ··· {p.iban_used.slice(-4)} · {new Date(p.requested_at).toLocaleDateString("en-GB")}</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {p.status === "sent" && (
                        <button
                          type="button"
                          onClick={() => downloadReceipt(p)}
                          disabled={downloadingId === p.id}
                          title="Download payment receipt (PDF)"
                          className="p-1.5 rounded-lg border border-border text-muted-foreground hover:text-primary hover:border-primary/40 disabled:opacity-50"
                        >
                          {downloadingId === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                        </button>
                      )}
                      <SellerPayoutStatus status={p.status} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const SellerPayoutStatus = ({ status }: { status: string }) => {
  const map: Record<string, string> = {
    requested: "bg-amber-100 text-amber-700",
    processing: "bg-blue-100 text-blue-700",
    sent: "bg-emerald-100 text-emerald-700",
    failed: "bg-red-100 text-red-700",
    cancelled: "bg-muted text-muted-foreground",
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${map[status] ?? "bg-muted text-muted-foreground"}`}>
      {status}
    </span>
  );
};

export default MyListings;
