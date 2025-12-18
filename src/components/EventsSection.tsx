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
  const [selectedFilter, setSelectedFilter] = useState("galas");
  const [selectedEvent, setSelectedEvent] = useState<typeof eventsList[0] | null>(null);

  const filters = [
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
      const matchesFilter = event.filterCategory === selectedFilter;
      return matchesSearch && matchesFilter;
    })
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

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

          {/* Events Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredEvents.map(event => (
              <EventCard 
                key={event.id}
                event={event}
                onClick={() => setSelectedEvent(event)}
              />
            ))}
          </div>

          {/* No Results */}
          {filteredEvents.length === 0 && (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                <Search className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="text-xl font-semibold mb-2">{t('events.noEvents')}</h3>
              <p className="text-muted-foreground">
                {t('events.noEventsDescription')}
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
