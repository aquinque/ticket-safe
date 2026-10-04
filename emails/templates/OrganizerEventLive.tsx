import { Text } from "@react-email/components";
import { Layout } from "../components/Layout";
import { Button } from "../components/Button";
import { TicketSummary } from "../components/TicketSummary";
import { emailTokens as T } from "../tokens";

interface Props {
  firstName: string;
  eventName: string;
  eventDate: string;
  eventLocation: string;
  publicUrl: string;
}

export default function OrganizerEventLive({
  firstName = "Jordan",
  eventName = "ESCP Winter Gala 2026",
  eventDate = "Friday, 12 December 2026, 20:00",
  eventLocation = "Pavillon Cambon, Paris",
  publicUrl = "https://ticket-safe.eu/e/escp-winter-gala-2026",
}: Props) {
  return (
    <Layout eyebrow="Studio · Event live" title="Your event is live" preheader={`${eventName} is now live — share your page to start selling.`}>
      <Text style={{ margin: "0 0 4px" }}>Hi {firstName},</Text>
      <Text style={{ margin: "0 0 4px" }}>
        <strong>{eventName}</strong> is now live on Ticket Safe. Share your page with your community to start selling.
      </Text>
      <TicketSummary
        rows={[
          { label: "Event", value: eventName },
          { label: "Date", value: eventDate },
          { label: "Location", value: eventLocation },
          { label: "Public page", value: publicUrl },
        ]}
      />
      <Button href={publicUrl}>Share my event</Button>
      <Text style={{ margin: "24px 0 0", fontSize: 13, color: T.textMuted }}>
        Sales appear in your dashboard in real time. Need help promoting it? Just reply to this email.
      </Text>
    </Layout>
  );
}
