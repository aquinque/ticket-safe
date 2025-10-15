import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Filter, Calendar, MapPin } from "lucide-react";
import EventCard from "./EventCard";

// Mock data for demonstration
const mockEvents = [
  {
    id: "1",
    title: "Soirée de rentrée ECP 2024",
    date: "2024-10-15",
    time: "20:00",
    location: "Le Showcase, Paris",
    campus: "ECP Paris",
    type: "Soirée",
    price: 25,
    availableTickets: 12,
    totalTickets: 50,
  },
  {
    id: "2", 
    title: "Gala des Mines - Grande Soirée",
    date: "2024-11-08",
    time: "19:30",
    location: "Pavillon Dauphine, Paris",
    campus: "Mines ParisTech",
    type: "Gala",
    price: 45,
    availableTickets: 8,
    totalTickets: 30,
  },
  {
    id: "3",
    title: "Concert Live - Artiste Surprise",
    date: "2024-10-22",
    time: "21:00", 
    location: "Bataclan, Paris",
    campus: "ECP Paris",
    type: "Concert",
    price: 35,
    availableTickets: 5,
    totalTickets: 25,
  },
  {
    id: "4",
    title: "WEI 2024 - Weekend d'intégration",
    date: "2024-11-15",
    time: "14:00",
    location: "Château de Fontainebleau",
    campus: "ECP Paris",
    type: "WEI",
    price: 120,
    availableTickets: 3,
    totalTickets: 15,
  },
  {
    id: "5",
    title: "After Work Étudiants",
    date: "2024-10-18",
    time: "18:30",
    location: "Le Perchoir, Paris",
    campus: "HEC Paris",
    type: "Soirée",
    price: 20,
    availableTickets: 15,
    totalTickets: 40,
  },
  {
    id: "6",
    title: "Tournoi Gaming Inter-Écoles",
    date: "2024-11-02",
    time: "14:00",
    location: "Campus Numérique, Ivry",
    campus: "EPITECH",
    type: "Tournament",
    price: 15,
    availableTickets: 20,
    totalTickets: 100,
  }
];

const EventsSection = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCampus, setSelectedCampus] = useState("all-campus");
  const [selectedType, setSelectedType] = useState("all-types");
  const [sortBy, setSortBy] = useState("date");

  // ESCP official campuses only
  const campuses = ["Paris", "Berlin", "London", "Madrid", "Turin"];
  const eventTypes = [...new Set(mockEvents.map(event => event.type))];

  // Filter and sort events
  const filteredEvents = mockEvents
    .filter(event => {
      const matchesSearch = event.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           event.location.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCampus = selectedCampus === "all-campus" || event.campus === selectedCampus;
      const matchesType = selectedType === "all-types" || event.type === selectedType;
      return matchesSearch && matchesCampus && matchesType;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case "date":
          return new Date(a.date).getTime() - new Date(b.date).getTime();
        case "price":
          return a.price - b.price;
        case "availability":
          return b.availableTickets - a.availableTickets;
        default:
          return 0;
      }
    });

  return (
    <section className="py-16 bg-muted/30">
      <div className="container mx-auto px-4">
        {/* Header */}
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Available Events
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Discover all student events with tickets for resale.
            Filter by school, date or event type to find what you're looking for!
          </p>
        </div>

        {/* Filters */}
        <div className="bg-card rounded-xl p-6 shadow-card mb-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            {/* Search */}
            <div className="lg:col-span-2 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input
                placeholder="Search for an event..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Campus Filter */}
            <Select value={selectedCampus} onValueChange={setSelectedCampus}>
              <SelectTrigger>
                <MapPin className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Campus" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all-campus">All campuses</SelectItem>
                {campuses.map(campus => (
                  <SelectItem key={campus} value={campus}>{campus}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Type Filter */}
            <Select value={selectedType} onValueChange={setSelectedType}>
              <SelectTrigger>
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all-types">All types</SelectItem>
                {eventTypes.map(type => (
                  <SelectItem key={type} value={type}>{type}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Sort By */}
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger>
                <Calendar className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="date">Date</SelectItem>
                <SelectItem value="price">Price</SelectItem>
                <SelectItem value="availability">Availability</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Events Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {filteredEvents.map(event => (
            <EventCard key={event.id} {...event} />
          ))}
        </div>

        {/* Load More */}
        {filteredEvents.length > 0 && (
          <div className="text-center">
            <Button variant="outline" size="lg">
              Load More Events
            </Button>
          </div>
        )}

        {/* No Results */}
        {filteredEvents.length === 0 && (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
              <Search className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-xl font-semibold mb-2">No events found</h3>
            <p className="text-muted-foreground">
              Try adjusting your filters or come back later to see new events.
            </p>
          </div>
        )}
      </div>
    </section>
  );
};

export default EventsSection;