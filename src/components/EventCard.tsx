import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, MapPin, Users, Ticket } from "lucide-react";
import { Link } from "react-router-dom";

interface EventCardProps {
  id: string;
  title: string;
  date: string;
  time: string;
  location: string;
  campus: string;
  type: string;
  price: number;
  availableTickets: number;
  totalTickets: number;
  image?: string;
}

const EventCard = ({ 
  id, 
  title, 
  date, 
  time, 
  location, 
  campus, 
  type, 
  price, 
  availableTickets, 
  totalTickets,
  image 
}: EventCardProps) => {
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', { 
      weekday: 'short', 
      day: 'numeric', 
      month: 'short' 
    });
  };

  const getTypeColor = (eventType: string) => {
    switch (eventType.toLowerCase()) {
      case 'soirée': return 'bg-primary/10 text-primary border-primary/20';
      case 'gala': return 'bg-secondary/10 text-secondary border-secondary/20';
      case 'concert': return 'bg-accent/10 text-accent border-accent/20';
      case 'wei': return 'bg-gradient-accent text-white border-transparent';
      default: return 'bg-muted text-muted-foreground border-border';
    }
  };

  return (
    <Card className="group overflow-hidden bg-card border-0 hover:shadow-hover transition-all duration-300 hover:-translate-y-2 shadow-card">
      {/* Event Image */}
      <div className="relative h-52 bg-gradient-purple-blue overflow-hidden">
        {image ? (
          <img 
            src={image} 
            alt={title}
            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full bg-gradient-purple-blue flex items-center justify-center">
            <Ticket className="w-16 h-16 text-white/70" />
          </div>
        )}
        
        {/* Campus Badge */}
        <Badge 
          variant="secondary" 
          className="absolute top-4 left-4 bg-white/95 text-foreground backdrop-blur-md shadow-soft"
        >
          {campus}
        </Badge>

        {/* Type Badge */}
        <Badge 
          className={`absolute top-4 right-4 ${getTypeColor(type)} backdrop-blur-md shadow-soft border`}
        >
          {type}
        </Badge>

        {/* Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      </div>

      <CardHeader className="pb-3">
        <h3 className="font-semibold text-lg line-clamp-2 group-hover:text-primary transition-colors">
          {title}
        </h3>
      </CardHeader>

      <CardContent className="space-y-3 pb-4">
        {/* Date & Time */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Calendar className="w-4 h-4" />
          <span>{formatDate(date)} à {time}</span>
        </div>

        {/* Location */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <MapPin className="w-4 h-4" />
          <span className="line-clamp-1">{location}</span>
        </div>

        {/* Availability */}
        <div className="flex items-center gap-2 text-sm">
          <Users className="w-4 h-4 text-muted-foreground" />
          <span className="text-muted-foreground">
            {availableTickets} tickets available out of {totalTickets}
          </span>
        </div>

        {/* Price */}
        <div className="flex items-center justify-between pt-2">
          <span className="text-2xl font-bold text-primary">
            {price}€
          </span>
          <span className="text-sm text-muted-foreground">
            per ticket
          </span>
        </div>
      </CardContent>

      <CardFooter className="pt-0">
        <Button 
          variant="outline-primary" 
          className="w-full group-hover:bg-gradient-hero group-hover:text-white group-hover:border-transparent shadow-soft group-hover:shadow-glow transition-all duration-300"
          asChild
        >
          <Link to={`/events/${id}`}>
            View Tickets
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
};

export default EventCard;