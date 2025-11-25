import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Filter } from "lucide-react";
import EventCard from "./EventCard";
import { useI18n } from "@/contexts/I18nContext";
import { eventsList } from "@/data/eventsData";
import EventModal from "./EventModal";

const EventsSection = () => {
  const { t } = useI18n();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedFilter, setSelectedFilter] = useState("all");
  const [selectedEvent, setSelectedEvent] = useState<typeof eventsList[0] | null>(null);

  const filters = [
    { id: "all", label: t('events.filters.all') },
    { id: "parties", label: t('events.filters.parties') },
    { id: "galas", label: t('events.filters.galas') },
    { id: "conferences", label: t('events.filters.conferences') },
    { id: "sports", label: t('events.filters.sports') },
    { id: "sustainability", label: t('events.filters.sustainability') },
    { id: "other", label: t('events.filters.other') }
  ];

  const filteredEvents = eventsList
    .filter(event => {
      const matchesSearch = event.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           event.location.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           event.organizer.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesFilter = selectedFilter === "all" || event.filterCategory === selectedFilter;
      return matchesSearch && matchesFilter;
    })
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return (
    <>
      <section className="bg-gradient-subtle">
        <div className="container mx-auto px-4">
          {/* Header */}
          <div className="text-center mb-10">
            <h2 className="mb-3">
              {t('events.availableEvents')}
            </h2>
            <p className="text-lg max-w-2xl mx-auto text-balance">
              {t('events.discoverEvents')}
            </p>
          </div>

          {/* Filters Bar - Improved Design */}
          <div className="bg-card rounded-xl border border-border p-6 shadow-soft mb-10">
            {/* Search with Clear Button */}
            <div className="relative mb-6">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-muted-foreground w-5 h-5" />
              <Input
                placeholder={t('events.searchPlaceholder')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-12 pr-10 h-12 text-base"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm("")}
                  className="absolute right-4 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Clear search"
                >
                  ×
                </button>
              )}
            </div>

            {/* Category Filters - Better Layout */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Filter className="w-4 h-4" />
                <span>Filter by category:</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {filters.map(filter => (
                  <Button
                    key={filter.id}
                    variant={selectedFilter === filter.id ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelectedFilter(filter.id)}
                    className="rounded-full transition-all hover:scale-105"
                  >
                    {filter.label}
                    {selectedFilter === filter.id && filteredEvents.length > 0 && (
                      <span className="ml-1.5 px-1.5 py-0.5 bg-primary-foreground/20 rounded-full text-xs">
                        {filteredEvents.length}
                      </span>
                    )}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          {/* Events Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
            {filteredEvents.map(event => (
              <EventCard 
                key={event.id}
                event={event}
                onClick={() => setSelectedEvent(event)}
              />
            ))}
          </div>

          {/* No Results - Improved Empty State */}
          {filteredEvents.length === 0 && (
            <div className="text-center py-16">
              <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
                <Search className="w-10 h-10 text-primary" />
              </div>
              <h3 className="text-2xl font-semibold mb-3">{t('events.noEvents')}</h3>
              <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                {t('events.noEventsDescription')}
              </p>
              {searchTerm || selectedFilter !== 'all' ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    setSearchTerm("");
                    setSelectedFilter("all");
                  }}
                  className="gap-2"
                >
                  Clear filters
                </Button>
              ) : null}
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
