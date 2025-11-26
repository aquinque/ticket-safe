import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, MapPin, User, ShoppingCart, FileImage, ShieldCheck } from "lucide-react";
import { TicketListing } from "@/contexts/TicketListingsContext";

interface TicketListingCardProps {
  listing: TicketListing;
}

const TicketListingCard = ({ listing }: TicketListingCardProps) => {
  const navigate = useNavigate();
  const { event, sellingPrice, quantity, description, sellerName, files, verified } = listing;

  const formatDate = () => {
    const startDate = new Date(event.date);
    const endDate = event.endDate ? new Date(event.endDate) : null;

    const options: Intl.DateTimeFormatOptions = {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    };

    if (endDate) {
      return `${startDate.toLocaleDateString('en-US', options)} - ${endDate.toLocaleDateString('en-US', options)}`;
    }
    return startDate.toLocaleDateString('en-US', options);
  };

  const handleViewTickets = () => {
    navigate(`/event/${event.id}/tickets`);
  };

  return (
    <Card className="overflow-hidden hover:shadow-lg transition-all duration-300 group">
      <div className="relative h-48 overflow-hidden">
        <img
          src={event.image}
          alt={event.title}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
        <div className="absolute top-3 left-3 flex flex-col gap-2">
          <Badge variant="secondary" className="bg-background/90 backdrop-blur-sm">
            {event.category}
          </Badge>
          {verified && (
            <Badge variant="default" className="bg-green-600/90 backdrop-blur-sm flex items-center gap-1">
              <ShieldCheck className="w-3 h-3" />
              Verified
            </Badge>
          )}
        </div>
        <div className="absolute top-3 right-3">
          <Badge variant="default" className="bg-primary/90 backdrop-blur-sm">
            {quantity} ticket{quantity > 1 ? 's' : ''} available
          </Badge>
        </div>
      </div>

      <CardContent className="p-4">
        <h3 className="font-bold text-lg mb-2 line-clamp-1">{event.title}</h3>

        <div className="space-y-2 mb-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Calendar className="w-4 h-4" />
            <span>{formatDate()}</span>
          </div>

          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <MapPin className="w-4 h-4" />
            <span className="line-clamp-1">{event.location}</span>
          </div>

          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <User className="w-4 h-4" />
            <span className="line-clamp-1">Sold by {sellerName}</span>
          </div>

          {files.length > 0 && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <FileImage className="w-4 h-4" />
              <span>{files.length} photo{files.length > 1 ? 's' : ''} attached</span>
            </div>
          )}
        </div>

        {description && (
          <p className="text-sm text-muted-foreground mb-4 line-clamp-2">{description}</p>
        )}

        <div className="flex items-center justify-between pt-4 border-t">
          <div>
            <p className="text-xs text-muted-foreground">Price per ticket</p>
            <p className="text-2xl font-bold text-primary">€{sellingPrice.toFixed(2)}</p>
          </div>
          <Button
            variant="hero"
            size="sm"
            onClick={handleViewTickets}
          >
            <ShoppingCart className="w-4 h-4 mr-1" />
            View Tickets
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default TicketListingCard;
