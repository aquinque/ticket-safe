import { Text } from "@react-email/components";
import { Layout } from "../components/Layout";
import { Button } from "../components/Button";
import { TicketSummary } from "../components/TicketSummary";
import { emailTokens as T } from "../tokens";

interface Props {
  firstName: string;
  eventName: string;
  eventDate: string;
  eventTime: string;
  eventLocation: string;
  ticketType: string;
  quantity: number;
  subtotal: string;
  serviceFee: string;
  totalPaid: string;
  orderNumber: string;
  orderUrl: string;
  ticketCount: number;
}

export default function PurchaseConfirmation({
  firstName = "Alex",
  eventName = "ESCP Winter Gala 2026",
  eventDate = "Friday, 12 December 2026",
  eventTime = "20:00",
  eventLocation = "Pavillon Cambon, Paris",
  ticketType = "Early Bird",
  quantity = 2,
  subtotal = "€40.00",
  serviceFee = "€2.80",
  totalPaid = "€42.80",
  orderNumber = "TS-A1B2C3D4",
  orderUrl = "https://ticket-safe.eu/my-tickets/ord_123",
  ticketCount = 2,
}: Props) {
  return (
    <Layout
      eyebrow="Order confirmation"
      title="Your ticket is confirmed"
      preheader={`${eventName} — ${eventDate}. Your ticket is attached.`}
    >
      <Text style={{ margin: "0 0 4px" }}>Hi {firstName},</Text>
      <Text style={{ margin: "0 0 4px" }}>
        Your order for <strong>{eventName}</strong> is confirmed. {ticketCount > 1 ? `Your ${ticketCount} tickets are` : "Your ticket is"} attached,
        ready to show at the door.
      </Text>
      <TicketSummary
        rows={[
          { label: "Event", value: eventName },
          { label: "Date", value: eventDate },
          { label: "Time", value: eventTime },
          { label: "Location", value: eventLocation },
          { label: "Ticket type", value: ticketType },
          { label: "Quantity", value: String(quantity) },
          { label: "Subtotal", value: subtotal },
          { label: "Service fee", value: serviceFee },
          { label: "Total paid", value: totalPaid, valueColor: T.accent },
          { label: "Order number", value: orderNumber },
        ]}
      />
      <Button href={orderUrl}>View my tickets</Button>
      <Text style={{ margin: "24px 0 0", fontSize: 13, color: T.textMuted }}>
        The attached PDF holds the QR code to show at the door. One ticket = one entry — it's nominative, keep it safe, and it can only be resold
        through Ticket Safe.
      </Text>
    </Layout>
  );
}
