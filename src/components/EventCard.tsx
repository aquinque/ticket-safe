import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, MapPin, ShieldCheck } from "lucide-react";
import { useI18n } from "@/contexts/I18nContext";
import { EventData } from "@/data/eventsData";

interface EventCardProps {
  event: EventData;
  onClick: () => void;
}

const EventCard = ({ event, onClick }: EventCardProps) => {
  const { t, language } = useI18n();
  
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const locale = language === 'fr' ? 'fr-FR' : 'en-US';
    return date.toLocaleDateString(locale, { 
      weekday: 'short', 
      day: 'numeric', 
      month: 'short',
      year: 'numeric'
    });
  };

  const formatDateRange = () => {
    if (event.endDate) {
      return `${formatDate(event.date)} - ${formatDate(event.endDate)}`;
    }
    return formatDate(event.date);
  };

  const formatTime = () => {
    if (event.endTime) {
      return `${event.time} - ${event.endTime}`;
    }
    return event.time;
  };

  const getTypeColor = (eventType: string) => {
    const type = eventType.toLowerCase();
    if (type.includes('party') || type.includes('halloween')) return 'bg-gradient-hero text-white border-transparent';
    if (type.includes('gala')) return 'bg-gradient-accent text-white border-transparent';
    if (type.includes('conference') || type.includes('panel')) return 'bg-primary/10 text-primary border-primary/20';
    if (type.includes('sustainability') || type.includes('swap')) return 'bg-green-500/10 text-green-600 border-green-500/20';
    if (type.includes('ceremony')) return 'bg-purple-500/10 text-purple-600 border-purple-500/20';
    if (type.includes('ski') || type.includes('sport') || type.includes('game')) return 'bg-blue-500/10 text-blue-600 border-blue-500/20';
    return 'bg-muted text-muted-foreground border-border';
  };

  return (
    <Card 
      className="group overflow-hidden bg-card border-0 hover:shadow-hover transition-all duration-300 hover:-translate-y-2 shadow-card cursor-pointer"
      onClick={onClick}
    >
      {/* Event Image */}
      <div className="relative h-52 bg-gradient-purple-blue overflow-hidden">
        <img 
          src={event.image} 
          alt={event.title}
          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
        />
        
        {/* Verified Badge */}
        <Badge 
          className="absolute top-4 left-4 bg-white/95 text-foreground backdrop-blur-md shadow-soft flex items-center gap-1"
        >
          <ShieldCheck className="w-3 h-3 text-primary" />
          {t('events.verifiedByTicketSafe')}
        </Badge>

        {/* Type Badge */}
        <Badge 
          className={`absolute top-4 right-4 ${getTypeColor(event.category)} backdrop-blur-md shadow-soft border`}
        >
          {event.category}
        </Badge>

        {/* Event Ended Badge */}
        {event.isPastEvent && (
          <Badge 
            variant="secondary"
            className="absolute bottom-4 left-4 bg-black/80 text-white backdrop-blur-md"
          >
            {t('events.eventEnded')}
          </Badge>
        )}

        {/* Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      </div>

      <CardHeader className="pb-3">
        <h3 className="font-semibold text-lg line-clamp-2 group-hover:text-primary transition-colors">
          {event.title}
        </h3>
        <p className="text-sm text-muted-foreground">
          {event.organizer}
        </p>
      </CardHeader>

      <CardContent className="space-y-3 pb-4">
        {/* Date & Time */}
        <div className="flex items-start gap-2 text-sm text-muted-foreground">
          <Calendar className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <div>
            <div>{formatDateRange()}</div>
            <div>{formatTime()}</div>
          </div>
        </div>

        {/* Location */}
        <div className="flex items-start gap-2 text-sm text-muted-foreground">
          <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span className="line-clamp-2">{event.location}</span>
        </div>
      </CardContent>

      <CardFooter className="pt-0">
        <Button 
          variant="outline-primary" 
          className="w-full group-hover:bg-gradient-hero group-hover:text-white group-hover:border-transparent shadow-soft group-hover:shadow-glow transition-all duration-300"
        >
          {t('events.buyOrResellTicket')}
        </Button>
      </CardFooter>
    </Card>
  );
};

export default EventCard;
