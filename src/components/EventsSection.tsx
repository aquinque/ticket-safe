import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Filter, RefreshCw } from "lucide-react";
import EventCard from "./EventCard";
import { useI18n } from "@/contexts/I18nContext";
import EventModal from "./EventModal";
import { useESCPEvents } from "@/hooks/useESCPEvents";
import { Skeleton } from "@/components/ui/skeleton";

const EventsSection = () => {
  const { t } = useI18n();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedFilter, setSelectedFilter] = useState("all");
  const [selectedEvent, setSelectedEvent] = useState<any>(null);

  // Fetch only events with available tickets
  const { events: escpEvents, loading, error } = useESCPEvents({ onlyWithTickets: true });

  const filters = [
    { id: "all", label: "All" },
    { id: "Parties", label: t('events.filters.parties') },
    { id: "Galas", label: t('events.filters.galas') },
    { id: "Conferences", label: t('events.filters.conferences') },
    { id: "Sports", label: t('events.filters.sports') },
    { id: "Sustainability", label: t('events.filters.sustainability') },
    { id: "Other", label: t('events.filters.other') }
  ];

  // Filter events based on search and category
  const filteredEvents = escpEvents
    .filter(event => {
      const matchesSearch = event.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           event.location.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           (event.organizer && event.organizer.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchesFilter = selectedFilter === "all" || event.category === selectedFilter;
      return matchesSearch && matchesFilter;
    });

  return (
    <>
      <section className="py-8 bg-muted/30">
        <div className="container mx-auto px-4">
          {/* Header */}
          <div className="text-center mb-8">
            <h2 className="text-3xl md:text-4xl font-bold mb-3">
              {t('events.availableEvents')}
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              {t('events.discoverEvents')}
            </p>
          </div>

          {/* Filters Bar */}
          <div className="bg-card rounded-xl p-4 shadow-card mb-6">
            {/* Search */}
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input
                placeholder={t('events.searchPlaceholder')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Category Filters */}
            <div className="flex flex-wrap gap-2">
              <Filter className="w-4 h-4 text-muted-foreground mt-2 mr-2" />
              {filters.map(filter => (
                <Button
                  key={filter.id}
                  variant={selectedFilter === filter.id ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedFilter(filter.id)}
                  className="rounded-full"
                >
                  {filter.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Loading State */}
          {loading && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="space-y-3">
                  <Skeleton className="h-48 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
              ))}
            </div>
          )}

          {/* Error State */}
          {error && !loading && (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Search className="w-8 h-8 text-destructive" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Error loading events</h3>
              <p className="text-muted-foreground">
                {error.message || 'Failed to load events. Please try again later.'}
              </p>
            </div>
          )}

          {/* Events Grid */}
          {!loading && !error && filteredEvents.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredEvents.map(event => (
                <EventCard
                  key={event.id}
                  event={{
                    ...event,
                    id: event.id,
                    title: event.title,
                    date: event.start_date,
                    location: event.location,
                    category: event.category,
                    organizer: event.organizer,
                    description: event.description,
                    price: event.min_price || 0,
                    availableTickets: event.available_tickets || 0,
                    totalTickets: event.available_tickets || 0,
                    imageUrl: '/placeholder.svg',
                    filterCategory: event.category.toLowerCase(),
                  }}
                  onClick={() => setSelectedEvent(event)}
                />
              ))}
            </div>
          )}

          {/* No Results */}
          {!loading && !error && filteredEvents.length === 0 && (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                <Search className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="text-xl font-semibold mb-2">{t('events.noEvents')}</h3>
              <p className="text-muted-foreground">
                No events with available tickets found. Check back later!
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Event Detail Modal */}
      {selectedEvent && (
        <EventModal
          event={selectedEvent}
          isOpen={!!selectedEvent}
          onClose={() => setSelectedEvent(null)}
        />
      )}
    </>
  );
};

export default EventsSection;
