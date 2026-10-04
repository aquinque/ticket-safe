import { Text } from "@react-email/components";
import { Layout } from "../components/Layout";
import { Button } from "../components/Button";
import { TicketSummary } from "../components/TicketSummary";
import { emailTokens as T } from "../tokens";

interface Props {
  buyerName: string;
  eventName: string;
  eventDate: string;
  eventLocation: string;
  ticketType: string;
  totalPaid: string;
  orderNumber: string;
  ticketsUrl: string;
}

export default function TicketPurchasedResale({
  buyerName = "Sam",
  eventName = "ESCP Winter Gala 2026",
  eventDate = "Friday, 12 December 2026",
  eventLocation = "Pavillon Cambon, Paris",
  ticketType = "Standard",
  totalPaid = "€24.50",
  orderNumber = "TS-RESALE-9F3A2B1C",
  ticketsUrl = "https://ticket-safe.eu/my-tickets",
}: Props) {
  return (
    <Layout eyebrow="Resale" title="Your ticket is confirmed" preheader={`${eventName} — your resold ticket is attached.`}>
      <Text style={{ margin: "0 0 4px" }}>Hi {buyerName},</Text>
      <Text style={{ margin: "0 0 4px" }}>
        Your purchase of a ticket for <strong>{eventName}</strong> is confirmed. It's now in your name — the previous ticket has been invalidated.
      </Text>
      <TicketSummary
        rows={[
          { label: "Event", value: eventName },
          { label: "Date", value: eventDate },
          { label: "Location", value: eventLocation },
          { label: "Ticket type", value: ticketType },
          { label: "Total paid", value: totalPaid, valueColor: T.accent },
          { label: "Order number", value: orderNumber },
        ]}
      />
      <Button href={ticketsUrl}>View my tickets</Button>
      <Text style={{ margin: "24px 0 0", fontSize: 13, color: T.textMuted }}>
        The attached PDF holds your new QR code. Screenshots or the old ticket will no longer work at the door.
      </Text>
    </Layout>
  );
}
