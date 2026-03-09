import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { BackButton } from "@/components/BackButton";
import { useAuth } from "@/hooks/useAuth";
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
  TrendingUp,
  CheckCircle2,
  Clock,
  XCircle,
  Euro,
  Plus,
} from "lucide-react";

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
  event: EventInfo | null;
}

type StatusFilter = "all" | "available" | "sold" | "reserved";
type SortOption = "newest" | "oldest" | "price_high" | "price_low" | "active_first";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  available: "Active",
  sold: "Sold",
  reserved: "Cancelled",
};

const StatusBadge = ({ status }: { status: string }) => {
  if (status === "available") {
    return (
      <Badge className="bg-green-500/15 text-green-600 border-green-200 hover:bg-green-500/15">
        <span className="w-1.5 h-1.5 rounded-full bg-green-500 mr-1.5 inline-block" />
        Active
      </Badge>
    );
  }
  if (status === "sold") {
    return (
      <Badge className="bg-blue-500/15 text-blue-600 border-blue-200 hover:bg-blue-500/15">
        <CheckCircle2 className="w-3 h-3 mr-1" />
        Sold
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-muted-foreground">
      <XCircle className="w-3 h-3 mr-1" />
      Cancelled
    </Badge>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

const MyListings = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [listings, setListings] = useState<RawListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortOption>("newest");

  // Edit price state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState("");
  const [editLoading, setEditLoading] = useState(false);

  // Cancel confirmation state
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [cancelLoading, setCancelLoading] = useState(false);

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth", { replace: true });
    }
  }, [user, authLoading, navigate]);

  // Fetch seller's listings — two separate queries to avoid events-table RLS issues
  const fetchListings = async () => {
    if (!user) return;
    setLoading(true);

    // 1. Fetch the seller's own tickets (simple query, no join)
    const { data: ticketRows, error: ticketsError } = await supabase
      .from("tickets")
      .select("id, event_id, selling_price, quantity, notes, status, created_at")
      .eq("seller_id", user.id)
      .order("created_at", { ascending: false });

    if (ticketsError) {
      console.error("Error fetching tickets:", ticketsError);
      toast({ title: "Error loading listings", description: ticketsError.message, variant: "destructive" });
      setLoading(false);
      return;
    }

    const rows = ticketRows ?? [];

    if (rows.length === 0) {
      setListings([]);
      setLoading(false);
      return;
    }

    // 2. Fetch event details for all unique event IDs
    const eventIds = [...new Set(rows.map((r) => r.event_id).filter(Boolean))];
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
      event_id: r.event_id,
      selling_price: r.selling_price,
      quantity: r.quantity ?? 1,
      notes: r.notes,
      status: r.status ?? "available",
      created_at: r.created_at,
      event: eventsMap[r.event_id] ?? null,
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
    const { error } = await supabase
      .from("tickets")
      .update({ selling_price: price })
      .eq("id", editingId)
      .eq("seller_id", user!.id);

    if (error) {
      toast({ title: "Failed to update price", variant: "destructive" });
    } else {
      setListings((prev) =>
        prev.map((l) => (l.id === editingId ? { ...l, selling_price: price } : l))
      );
      toast({ title: "Price updated", description: `New price: €${price.toFixed(2)}` });
      setEditingId(null);
    }
    setEditLoading(false);
  };

  // ── Delete listing ─────────────────────────────────────────────────────────
  const confirmCancel = async () => {
    if (!cancelId) return;
    setCancelLoading(true);
    const { error } = await supabase
      .from("tickets")
      .delete()
      .eq("id", cancelId)
      .eq("seller_id", user!.id);

    if (error) {
      toast({ title: "Failed to delete listing", variant: "destructive" });
    } else {
      setListings((prev) => prev.filter((l: RawListing) => l.id !== cancelId));
      toast({ title: "Listing deleted", description: "Your ticket has been removed." });
      setCancelId(null);
    }
    setCancelLoading(false);
  };

  // ── Loading / auth guard ───────────────────────────────────────────────────
  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="py-16 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
            <p className="text-muted-foreground">Loading your listings…</p>
          </div>
        </main>
      </div>
    );
  }

  if (!user) return null;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      <main className="flex-1 py-10">
        <div className="container mx-auto px-4 max-w-5xl">
          <div className="mb-6">
            <BackButton />
          </div>

          {/* Page title */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold">My Listings</h1>
              <p className="text-muted-foreground mt-1">Manage all your ticket listings</p>
            </div>
            <Button variant="hero" onClick={() => navigate("/marketplace/sell")} className="gap-2">
              <Plus className="w-4 h-4" />
              Sell a Ticket
            </Button>
          </div>

          {/* Stats strip */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <Card className="border-0 bg-green-500/8">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-green-500/15 flex items-center justify-center flex-shrink-0">
                  <Clock className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-green-600">{stats.active}</p>
                  <p className="text-xs text-muted-foreground">Active</p>
                </div>
              </CardContent>
            </Card>
            <Card className="border-0 bg-blue-500/8">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-500/15 flex items-center justify-center flex-shrink-0">
                  <CheckCircle2 className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-blue-600">{stats.sold}</p>
                  <p className="text-xs text-muted-foreground">Sold</p>
                </div>
              </CardContent>
            </Card>
            <Card className="border-0 bg-muted/50">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center flex-shrink-0">
                  <XCircle className="w-5 h-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.cancelled}</p>
                  <p className="text-xs text-muted-foreground">Cancelled</p>
                </div>
              </CardContent>
            </Card>
            <Card className="border-0 bg-primary/8">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center flex-shrink-0">
                  <TrendingUp className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-primary">€{stats.earnings.toFixed(0)}</p>
                  <p className="text-xs text-muted-foreground">Earnings</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Controls */}
          <div className="flex flex-col sm:flex-row gap-3 mb-6">
            {/* Status tabs */}
            <div className="flex gap-1 bg-muted/50 rounded-lg p-1 flex-wrap">
              {(["all", "available", "sold", "reserved"] as StatusFilter[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`px-3 py-1.5 text-sm rounded-md font-medium transition-all ${
                    statusFilter === s
                      ? "bg-background shadow text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {s === "all" ? "All" : STATUS_LABELS[s]}
                  <span className="ml-1.5 text-xs opacity-60">
                    {s === "all"
                      ? listings.length
                      : listings.filter((l) => l.status === s).length}
                  </span>
                </button>
              ))}
            </div>

            <div className="flex gap-2 ml-auto">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search listings…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 w-52"
                />
              </div>
              {/* Sort */}
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortOption)}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
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
            <div className="text-center py-20">
              <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                <Ticket className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="text-xl font-semibold mb-2">
                {listings.length === 0 ? "No listings yet" : "No results"}
              </h3>
              <p className="text-muted-foreground mb-6">
                {listings.length === 0
                  ? "You haven't listed any tickets yet. Start by selling a ticket!"
                  : "Try adjusting your filters or search."}
              </p>
              {listings.length === 0 && (
                <Button variant="hero" onClick={() => navigate("/marketplace/sell")} className="gap-2">
                  <Plus className="w-4 h-4" />
                  Sell a Ticket
                </Button>
              )}
            </div>
          )}

          {/* Listings */}
          <div className="space-y-3">
            {displayed.map((listing) => {
              const eventDate = listing.event?.date
                ? new Date(listing.event.date).toLocaleDateString("en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })
                : "—";
              const listedDate = new Date(listing.created_at).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              });
              const isActive = listing.status === "available";

              return (
                <Card
                  key={listing.id}
                  className={`overflow-hidden transition-all duration-200 ${
                    isActive ? "hover:shadow-md" : "opacity-70"
                  }`}
                >
                  <CardContent className="p-0">
                    <div className="flex flex-col sm:flex-row">
                      {/* Left color strip based on status */}
                      <div
                        className={`w-full sm:w-1.5 h-1.5 sm:h-auto flex-shrink-0 ${
                          listing.status === "available"
                            ? "bg-green-500"
                            : listing.status === "sold"
                            ? "bg-blue-500"
                            : "bg-muted-foreground/30"
                        }`}
                      />

                      {/* Main content */}
                      <div className="flex-1 p-5">
                        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                          {/* Event info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <StatusBadge status={listing.status} />
                              {listing.event?.category && (
                                <Badge variant="outline" className="text-xs">
                                  {listing.event.category}
                                </Badge>
                              )}
                              {listing.qr_verified && (
                                <Badge className="bg-green-600 text-white text-xs">Verified</Badge>
                              )}
                            </div>
                            <h3 className="font-semibold text-base leading-tight mb-2 line-clamp-1">
                              {listing.event?.title ?? "Unknown Event"}
                            </h3>
                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {eventDate}
                              </span>
                              {listing.event?.location && (
                                <span className="flex items-center gap-1">
                                  <MapPin className="w-3 h-3" />
                                  {listing.event.location}
                                </span>
                              )}
                              <span className="flex items-center gap-1">
                                <Ticket className="w-3 h-3" />
                                {listing.quantity} ticket{listing.quantity !== 1 ? "s" : ""}
                              </span>
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                Listed {listedDate}
                              </span>
                            </div>
                          </div>

                          {/* Price + actions */}
                          <div className="flex sm:flex-col items-center sm:items-end gap-3 sm:gap-2 flex-shrink-0">
                            <div className="text-right">
                              <p className="text-2xl font-bold text-primary">
                                €{(listing.selling_price ?? 0).toFixed(2)}
                              </p>
                              <p className="text-xs text-muted-foreground">per ticket</p>
                            </div>

                            {isActive && (
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="gap-1.5 text-xs h-8"
                                  onClick={() => openEdit(listing)}
                                >
                                  <PencilLine className="w-3.5 h-3.5" />
                                  Edit Price
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="gap-1.5 text-xs h-8 text-destructive border-destructive/30 hover:bg-destructive/5"
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
                          <p className="mt-3 text-xs text-muted-foreground bg-muted/30 rounded-md px-3 py-2 line-clamp-1">
                            "{listing.notes}"
                          </p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </main>

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
                You will receive ~€{(parseFloat(editPrice) * 0.95).toFixed(2)} after the 5% platform fee.
              </p>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditingId(null)} disabled={editLoading}>
              Cancel
            </Button>
            <Button onClick={savePrice} disabled={editLoading} className="gap-2">
              {editLoading ? (
                <span className="animate-spin border-2 border-white border-t-transparent rounded-full w-4 h-4" />
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
                <span className="animate-spin border-2 border-white border-t-transparent rounded-full w-4 h-4" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
              Yes, Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Footer />
    </div>
  );
};

export default MyListings;
