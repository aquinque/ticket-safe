import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, MapPin, ShieldCheck, X } from "lucide-react";
import { useI18n } from "@/contexts/I18nContext";
import { EventData } from "@/data/eventsData";
import { useNavigate } from "react-router-dom";

interface EventModalProps {
  event: EventData;
  isOpen: boolean;
  onClose: () => void;
}

const EventModal = ({ event, isOpen, onClose }: EventModalProps) => {
  const { t, language } = useI18n();
  const navigate = useNavigate();

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const locale = language === 'fr' ? 'fr-FR' : 'en-US';
    return date.toLocaleDateString(locale, { 
      weekday: 'long', 
      day: 'numeric', 
      month: 'long',
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

  const handleBuyOrResell = () => {
    onClose();
    navigate('/sell');
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground z-10"
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </button>

        <DialogHeader>
          <DialogTitle className="sr-only">{event.title}</DialogTitle>
        </DialogHeader>

        {/* Event Image */}
        <div className="relative h-64 md:h-80 -mx-6 -mt-6 mb-6 overflow-hidden">
          <img 
            src={event.image} 
            alt={event.title}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
          
          {/* Verified Badge */}
          <Badge 
            className="absolute top-4 left-4 bg-white/95 text-foreground backdrop-blur-md shadow-soft flex items-center gap-1"
          >
            <ShieldCheck className="w-3 h-3 text-primary" />
            {t('events.verifiedByTicketSafe')}
          </Badge>

          {/* Type Badge */}
          <Badge 
            variant="secondary"
            className="absolute top-4 right-4 bg-white/95 text-foreground backdrop-blur-md shadow-soft"
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

          {/* Event Title Overlay */}
          <div className="absolute bottom-4 left-4 right-4">
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-2">
              {event.title}
            </h2>
            <p className="text-white/90 text-sm">
              {t('events.organizedBy')} {event.organizer}
            </p>
          </div>
        </div>

        {/* Event Details */}
        <div className="space-y-6">
          {/* Date & Time */}
          <div className="flex items-start gap-3">
            <Calendar className="w-5 h-5 text-primary mt-1 flex-shrink-0" />
            <div>
              <div className="font-semibold mb-1">{t('events.dateAndTime')}</div>
              <div className="text-muted-foreground">
                <div>{formatDateRange()}</div>
                <div>{formatTime()}</div>
              </div>
            </div>
          </div>

          {/* Location */}
          <div className="flex items-start gap-3">
            <MapPin className="w-5 h-5 text-primary mt-1 flex-shrink-0" />
            <div>
              <div className="font-semibold mb-1">{t('events.location')}</div>
              <div className="text-muted-foreground">{event.location}</div>
            </div>
          </div>

          {/* Description */}
          <div>
            <div className="font-semibold mb-2">{t('events.aboutEvent')}</div>
            <p className="text-muted-foreground leading-relaxed whitespace-pre-line">
              {event.description}
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3 pt-4">
            <Button 
              className="flex-1 bg-gradient-hero text-white shadow-glow hover:shadow-glow"
              size="lg"
              onClick={handleBuyOrResell}
            >
              {t('events.buyOrResellTicket')}
            </Button>
            <Button 
              variant="outline"
              size="lg"
              onClick={onClose}
            >
              {t('common.close')}
            </Button>
          </div>

          {/* Info Box */}
          <div className="bg-muted/50 rounded-lg p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <ShieldCheck className="w-4 h-4 text-primary" />
              <span className="font-medium">{t('events.safetyInfo')}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {t('events.safetyInfoDesc')}
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default EventModal;
