import { Text } from "@react-email/components";
import { Layout } from "../components/Layout";
import { Button } from "../components/Button";
import { TicketSummary } from "../components/TicketSummary";

/**
 * NOT YET WIRED UP — there is no cron/scheduled function sending this in
 * production (confirmed during the audit: no "day before" reminder exists
 * anywhere in supabase/functions or supabase/migrations). Template is
 * ready; sending it needs a new pg_cron job + edge function querying
 * event_tickets for events starting in ~24h, which is new infrastructure
 * beyond this pass — see the final summary.
 */
interface Props {
  firstName: string;
  eventName: string;
  eventTime: string;
  eventLocation: string;
  ticketsUrl: string;
}

export default function EventReminder({
  firstName = "Alex",
  eventName = "ESCP Winter Gala 2026",
  eventTime = "Tomorrow, 20:00",
  eventLocation = "Pavillon Cambon, Paris",
  ticketsUrl = "https://ticket-safe.eu/my-tickets",
}: Props) {
  return (
    <Layout eyebrow="Reminder" title={`${eventName} is tomorrow`} preheader={`${eventName} — ${eventTime}. Your ticket is ready.`}>
      <Text style={{ margin: "0 0 4px" }}>Hi {firstName},</Text>
      <Text style={{ margin: "0 0 4px" }}>
        Quick reminder — <strong>{eventName}</strong> is coming up. Have your ticket ready to scan at the door.
      </Text>
      <TicketSummary rows={[{ label: "Event", value: eventName }, { label: "When", value: eventTime }, { label: "Where", value: eventLocation }]} />
      <Button href={ticketsUrl}>Open my ticket</Button>
    </Layout>
  );
}
