/**
 * Marketplace Buy page
 *
 * Shows all available ticket listings from the database, grouped by event.
 * Data comes from TicketListingsContext which now fetches from Supabase
 * (status='available' only, via React Query with 30 s staleTime).
 *
 * Filters: free-text search on title/location + price range.
 * Pagination: client-side, 10 event-groups per page.
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { BackButton } from "@/components/BackButton";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  MapPin,
  Calendar,
  ChevronDown,
  ChevronUp,
  Ticket,
  ShieldCheck,
  Loader2,
  ChevronLeft,
  ChevronRight,
  GraduationCap,
} from "lucide-react";
import { SEOHead } from "@/components/SEOHead";
import { useTicketListings, TicketListing } from "@/contexts/TicketListingsContext";

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

const PAGE_SIZE = 10;

// ---------------------------------------------------------------------------
// Campus colour map (ESCP Phase 1 + extensible)
// ---------------------------------------------------------------------------

const CAMPUS_COLORS: Record<string, string> = {
  paris:  "bg-blue-100 text-blue-800 border-blue-200",
  london: "bg-rose-100 text-rose-800 border-rose-200",
  berlin: "bg-slate-100 text-slate-800 border-slate-200",
  madrid: "bg-orange-100 text-orange-800 border-orange-200",
  turin:  "bg-violet-100 text-violet-800 border-violet-200",
};

function campusColor(campus: string | null): string {
  if (!campus) return "";
  const key = campus.toLowerCase();
  for (const [k, v] of Object.entries(CAMPUS_COLORS)) {
    if (key.includes(k)) return v;
  }
  return "bg-secondary text-secondary-foreground border-border";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const Buy = () => {
  const navigate = useNavigate();
  const { listings, isLoading } = useTicketListings();

  const [searchQuery, setSearchQuery] = useState("");
  const [priceRange, setPriceRange] = useState("all");
  const [universityFilter, setUniversityFilter] = useState("all");
  const [campusFilter, setCampusFilter] = useState("all");
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);

  // ---------------------------------------------------------------------------
  // Group listings by event (key: event.id)
  // ---------------------------------------------------------------------------

  interface EventGroup {
    eventId: string;
    eventTitle: string;
    eventDate: string;
    eventLocation: string;
    eventCategory: string;
    eventUniversity: string;
    eventCampus: string | null;
    tickets: TicketListing[];
    minPrice: number;
    totalAvailable: number;
  }

  const eventGroups: EventGroup[] = Object.values(
    listings.reduce<Record<string, EventGroup>>((acc, listing) => {
      const eid = listing.event.id;
      if (!acc[eid]) {
        acc[eid] = {
          eventId: eid,
          eventTitle: listing.event.title,
          eventDate: listing.event.date,
          eventLocation: listing.event.location,
          eventCategory: listing.event.category,
          eventUniversity: listing.university,
          eventCampus: listing.campus,
          tickets: [],
          minPrice: Infinity,
          totalAvailable: 0,
        };
      }
      acc[eid].tickets.push(listing);
      acc[eid].totalAvailable += listing.quantity;
      if (listing.sellingPrice < acc[eid].minPrice) {
        acc[eid].minPrice = listing.sellingPrice;
      }
      return acc;
    }, {})
  ).sort((a, b) => new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime());

  // Unique universities and campuses for filter dropdowns
  const allUniversities = [
    ...new Set(eventGroups.map((g) => g.eventUniversity).filter(Boolean)),
  ].sort();

  const allCampuses = [
    ...new Set(
      eventGroups
        .filter(
          (g) => universityFilter === "all" || g.eventUniversity === universityFilter
        )
        .map((g) => g.eventCampus)
        .filter((c): c is string => c !== null && c !== "")
    ),
  ].sort();

  // ---------------------------------------------------------------------------
  // Filtering
  // ---------------------------------------------------------------------------

  const filtered = eventGroups.filter((g) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      !q ||
      g.eventTitle.toLowerCase().includes(q) ||
      g.eventLocation.toLowerCase().includes(q) ||
      g.eventUniversity.toLowerCase().includes(q);

    const mp = g.minPrice;
    const matchesPrice =
      priceRange === "all" ||
      (priceRange === "under20" && mp < 20) ||
      (priceRange === "20to50" && mp >= 20 && mp <= 50) ||
      (priceRange === "over50" && mp > 50);

    const matchesUniversity =
      universityFilter === "all" || g.eventUniversity === universityFilter;

    const matchesCampus =
      campusFilter === "all" || g.eventCampus === campusFilter;

    return matchesSearch && matchesPrice && matchesUniversity && matchesCampus;
  });

  // Reset to page 1 when filters change
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const handleFilterChange = (fn: () => void) => {
    fn();
    setPage(1);
  };

  // ---------------------------------------------------------------------------
  // Expand/collapse event groups
  // ---------------------------------------------------------------------------

  const toggleEvent = (eventId: string) => {
    setExpandedEvents((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) next.delete(eventId);
      else next.add(eventId);
      return next;
    });
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SEOHead
        titleKey="marketplace.buy.title"
        descriptionKey="marketplace.buy.description"
      />
      <Header />
      <main className="flex-1 py-12">
        <div className="container mx-auto px-4 max-w-6xl">
          <div className="mb-6">
            <BackButton />
          </div>

          {/* Header */}
          <div className="mb-8">
            <h1 className="text-4xl font-bold mb-2">Buy a Ticket</h1>
            <p className="text-lg text-muted-foreground">
              Browse verified tickets from fellow students
            </p>
          </div>

          {/* Filters */}
          <Card className="mb-8">
            <CardContent className="pt-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="relative sm:col-span-2 lg:col-span-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                  <Input
                    placeholder="Search events or venues…"
                    value={searchQuery}
                    onChange={(e) =>
                      handleFilterChange(() => setSearchQuery(e.target.value))
                    }
                    className="pl-10"
                  />
                </div>
                <Select
                  value={priceRange}
                  onValueChange={(v) => handleFilterChange(() => setPriceRange(v))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Price range" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All prices</SelectItem>
                    <SelectItem value="under20">Under €20</SelectItem>
                    <SelectItem value="20to50">€20 – €50</SelectItem>
                    <SelectItem value="over50">Over €50</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={universityFilter}
                  onValueChange={(v) =>
                    handleFilterChange(() => {
                      setUniversityFilter(v);
                      setCampusFilter("all");
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="University" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All universities</SelectItem>
                    {allUniversities.map((u) => (
                      <SelectItem key={u} value={u}>
                        {u}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={campusFilter}
                  onValueChange={(v) => handleFilterChange(() => setCampusFilter(v))}
                  disabled={allCampuses.length === 0}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Campus" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All campuses</SelectItem>
                    {allCampuses.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Loading state */}
          {isLoading && (
            <div className="flex flex-col items-center py-16 gap-4 text-muted-foreground">
              <Loader2 className="w-10 h-10 animate-spin" />
              <p>Loading available tickets…</p>
            </div>
          )}

          {/* Empty state */}
          {!isLoading && filtered.length === 0 && (
            <Card className="py-12">
              <CardContent className="text-center">
                <Ticket className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-xl font-semibold mb-2">No tickets available</h3>
                <p className="text-muted-foreground mb-4">
                  {listings.length === 0
                    ? "Be the first to list a ticket!"
                    : "Try adjusting your filters or check back later."}
                </p>
                <Button variant="hero" onClick={() => navigate("/marketplace/sell")}>
                  Sell Your Ticket
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Event groups */}
          {!isLoading && paginated.length > 0 && (
            <div className="space-y-4">
              {paginated.map((group) => (
                <Card key={group.eventId} className="overflow-hidden">
                  <div className="flex flex-col md:flex-row">
                    {/* Event colour block */}
                    <div className="md:w-48 h-32 md:h-auto bg-gradient-to-br from-primary/20 to-primary/5 flex-shrink-0" />

                    {/* Content */}
                    <div className="flex-1">
                      <CardHeader>
                        <div className="flex items-start justify-between gap-2 flex-wrap sm:flex-nowrap">
                          <div className="flex-1 min-w-0">
                            <CardTitle className="text-lg sm:text-2xl mb-2 break-words">
                              {group.eventTitle}
                            </CardTitle>
                            <CardDescription className="space-y-1">
                              <div className="flex items-center gap-2">
                                <Calendar className="w-4 h-4" />
                                <span>
                                  {new Date(group.eventDate).toLocaleDateString(
                                    "en-US",
                                    {
                                      weekday: "long",
                                      month: "long",
                                      day: "numeric",
                                      year: "numeric",
                                    }
                                  )}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <MapPin className="w-4 h-4" />
                                <span>{group.eventLocation}</span>
                              </div>
                              {group.eventUniversity && (
                                <div className="flex items-center gap-2">
                                  <GraduationCap className="w-4 h-4" />
                                  <span>{group.eventUniversity}</span>
                                </div>
                              )}
                            </CardDescription>
                          </div>
                          <div className="flex flex-col items-end gap-2 shrink-0">
                            <Badge variant="secondary" className="text-xs sm:text-base px-2 sm:px-3 py-1">
                              {group.eventCategory || "Event"}
                            </Badge>
                            {group.eventCampus && (
                              <Badge
                                variant="outline"
                                className={`text-xs px-2 py-0.5 ${campusColor(group.eventCampus)}`}
                              >
                                {group.eventCampus}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </CardHeader>

                      <CardContent>
                        <div className="flex items-center justify-between mb-4 gap-3">
                          <div>
                            <p className="text-sm text-muted-foreground">
                              {group.totalAvailable} ticket
                              {group.totalAvailable !== 1 ? "s" : ""} available from
                            </p>
                            <p className="text-xl sm:text-2xl font-bold text-primary">
                              €{group.minPrice.toFixed(2)}
                            </p>
                          </div>
                          <Button
                            variant="outline"
                            onClick={() => toggleEvent(group.eventId)}
                            className="gap-2"
                          >
                            View tickets
                            {expandedEvents.has(group.eventId) ? (
                              <ChevronUp className="w-4 h-4" />
                            ) : (
                              <ChevronDown className="w-4 h-4" />
                            )}
                          </Button>
                        </div>

                        {/* Expanded ticket rows */}
                        {expandedEvents.has(group.eventId) && (
                          <div className="space-y-3 pt-4 border-t">
                            {group.tickets.map((ticket) => (
                              <div
                                key={ticket.id}
                                className="flex items-center justify-between p-4 bg-muted/50 rounded-lg"
                              >
                                <div className="flex-1">
                                  <div className="flex items-center gap-3 mb-1">
                                    <span className="font-semibold text-lg">
                                      €{ticket.sellingPrice.toFixed(2)}
                                    </span>
                                    <Badge variant="outline">
                                      {ticket.quantity} available
                                    </Badge>
                                    {ticket.verified && (
                                      <Badge className="bg-green-100 text-green-800 border-green-200">
                                        <ShieldCheck className="w-3 h-3 mr-1" />
                                        Verified
                                      </Badge>
                                    )}
                                  </div>
                                  {ticket.description && (
                                    <p className="text-sm text-muted-foreground">
                                      {ticket.description}
                                    </p>
                                  )}
                                  <p className="text-xs text-muted-foreground mt-1">
                                    Sold by {ticket.sellerName}
                                  </p>
                                </div>
                                <Button
                                  variant="hero"
                                  onClick={() =>
                                    navigate(`/checkout?listing_id=${ticket.id}`)
                                  }
                                  className="ml-4"
                                >
                                  Buy
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}

          {/* Pagination */}
          {!isLoading && totalPages > 1 && (
            <div className="flex items-center justify-center gap-4 mt-8">
              <Button
                variant="outline"
                size="sm"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {safePage} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={safePage >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Buy;
