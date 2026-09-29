import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Filter, Bell, BookOpen, Tag } from "lucide-react";
import EventCard, { EventCardSkeleton } from "./EventCard";
import { useI18n } from "@/contexts/I18nContext";
import { useESCPEvents } from "@/hooks/useESCPEvents";
import { toast } from "sonner";
import { matchesDateFilter, type DateFilterId } from "@/lib/dateFilters";

const DATE_FILTERS = [
  { id: "all-dates", label: "Any date" },
  { id: "tonight", label: "Tonight" },
  { id: "this-week", label: "This week" },
  { id: "this-month", label: "This month" },
];

const EventsSection = () => {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedFilter, setSelectedFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all-dates");

  const { events: escpEvents, loading, error } = useESCPEvents({ onlyWithTickets: true });

  const categoryFilters = [
    { id: "all", label: t('events.filters.all') },
    { id: "Parties", label: t('events.filters.parties') },
    { id: "Galas", label: t('events.filters.galas') },
    { id: "Conferences", label: t('events.filters.conferences') },
    { id: "Sports", label: t('events.filters.sports') },
    { id: "Sustainability", label: t('events.filters.sustainability') },
    { id: "Other", label: t('events.filters.other') },
  ];

  const filteredEvents = escpEvents.filter(event => {
    const matchesSearch =
      event.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      event.location.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (event.organizer && event.organizer.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesCategory = selectedFilter === "all" || event.category === selectedFilter;

    const matchesDate = matchesDateFilter(event.start_date, dateFilter as DateFilterId);

    return matchesSearch && matchesCategory && matchesDate;
  });

  const handleNotifyMe = () => {
    toast.success("Got it! We'll email you when tickets are listed for this category.", {
      description: "Coming soon — ticket alerts are in beta.",
    });
  };

  return (
    <section className="py-6 md:py-8 bg-muted/30">
      <div className="container mx-auto px-4 max-w-7xl">
        {/* Search & Filters Bar */}
        <div className="bg-card rounded-xl p-4 md:p-6 shadow-card mb-6 md:mb-8">
          <div className="relative mb-4 md:mb-5">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input
              placeholder="Search events..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 h-11 md:h-10 text-base md:text-sm"
              aria-label="Search events"
            />
          </div>

          {/* Category Filters */}
          <div className="mb-3">
            <div className="flex items-center gap-2 mb-2">
              <Filter className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
              <span className="text-sm font-medium text-muted-foreground">Category:</span>
            </div>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by category">
              {categoryFilters.map(filter => (
                <Button
                  key={filter.id}
                  variant={selectedFilter === filter.id ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedFilter(filter.id)}
                  className="rounded-full h-9 md:h-8 text-sm px-3 md:px-4"
                  aria-pressed={selectedFilter === filter.id}
                >
                  {filter.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Date Filters */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Search className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
              <span className="text-sm font-medium text-muted-foreground">When:</span>
            </div>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by date">
              {DATE_FILTERS.map(f => (
                <Button
                  key={f.id}
                  variant={dateFilter === f.id ? "default" : "outline"}
                  size="sm"
                  onClick={() => setDateFilter(f.id)}
                  className="rounded-full h-9 md:h-8 text-sm px-3 md:px-4"
                  aria-pressed={dateFilter === f.id}
                >
                  {f.label}
                </Button>
              ))}
            </div>
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <EventCardSkeleton key={i} />
            ))}
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <Search className="w-8 h-8 text-destructive" aria-hidden="true" />
            </div>
            <h3 className="text-xl font-semibold mb-2">Error loading events</h3>
            <p className="text-muted-foreground">
              {error.message || 'Failed to load events. Please try again later.'}
            </p>
          </div>
        )}

        {/* Events Grid — 2 cols mobile, 3-4 desktop (matches the poster-card
            aspect ratio; consistent with the /tickets grid in Phase 4). */}
        {!loading && !error && filteredEvents.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
            {filteredEvents.map(event => (
              <EventCard
                key={event.id}
                event={{
                  id: event.id,
                  title: event.title,
                  date: event.start_date,
                  time: "",
                  location: event.location,
                  category: event.category,
                  organizer: event.organizer,
                  description: event.description,
                  filterCategory: event.category.toLowerCase(),
                  // Raw url, not pre-resolved through getEventImage: a
                  // missing poster should render EventCard's generated
                  // brand-gradient fallback, not a generic stock photo.
                  image: event.image_url,
                  isPastEvent: false,
                  fromPriceCents: event.min_price != null ? Math.round(event.min_price * 100) : undefined,
                }}
                onClick={() => navigate(`/event/${event.id}/tickets`)}
              />
            ))}
          </div>
        )}

        {/* Actionable Empty State */}
        {!loading && !error && filteredEvents.length === 0 && (
          <div className="text-center py-12 max-w-lg mx-auto">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
              <Search className="w-8 h-8 text-muted-foreground" aria-hidden="true" />
            </div>
            <h3 className="text-xl font-semibold mb-2">{t('events.noEvents')}</h3>
            <p className="text-muted-foreground mb-6">{t('events.noEventsDescription')}</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button
                variant="hero"
                onClick={() => navigate("/marketplace?view=all")}
                className="gap-2"
                aria-label="Browse full event catalog"
              >
                <BookOpen className="w-4 h-4" />
                {t('events.noEventsCatalogCta')}
              </Button>
              <Button
                variant="outline"
                onClick={handleNotifyMe}
                className="gap-2"
                aria-label="Get notified when tickets are listed"
              >
                <Bell className="w-4 h-4" />
                {t('events.noEventsNotifyCta')}
              </Button>
              <Button
                variant="outline"
                onClick={() => navigate("/sell")}
                className="gap-2"
                aria-label="List your ticket for sale"
              >
                <Tag className="w-4 h-4" />
                {t('events.noEventsSellCta')}
              </Button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};

export default EventsSection;
