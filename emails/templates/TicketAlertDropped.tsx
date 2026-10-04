import { Text } from "@react-email/components";
import { Layout } from "../components/Layout";
import { Button } from "../components/Button";
import { TicketSummary } from "../components/TicketSummary";
import { emailTokens as T } from "../tokens";

interface Props {
  firstName: string;
  eventName: string;
  fromPrice: string;
  eventUrl: string;
}

export default function TicketAlertDropped({
  firstName = "Alex",
  eventName = "ESCP Winter Gala 2026",
  fromPrice = "€18.00",
  eventUrl = "https://ticket-safe.eu/event/evt_123/tickets",
}: Props) {
  return (
    <Layout eyebrow="Ticket alert" title={`A ticket just dropped for ${eventName}`} preheader={`A verified student just listed a ticket for ${eventName}.`}>
      <Text style={{ margin: "0 0 4px" }}>Hi {firstName},</Text>
      <Text style={{ margin: "0 0 4px" }}>
        Good news — a verified student just listed a ticket for <strong>{eventName}</strong>, the event you asked us to watch. They go fast, so grab
        it while it's available.
      </Text>
      <TicketSummary rows={[{ label: "Event", value: eventName }, { label: "From", value: fromPrice, valueColor: T.accent }]} />
      <Button href={eventUrl}>See the ticket</Button>
      <Text style={{ margin: "24px 0 0", fontSize: 12, color: T.textMuted }}>
        You're receiving this because you asked to be notified about this event on Ticket Safe.
      </Text>
    </Layout>
  );
}
