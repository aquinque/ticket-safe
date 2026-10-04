import { Text } from "@react-email/components";
import { Layout } from "../components/Layout";
import { Button } from "../components/Button";
import { TicketSummary } from "../components/TicketSummary";
import { emailTokens as T } from "../tokens";

interface Props {
  sellerName: string;
  eventName: string;
  eventWhen: string;
  netAmount: string;
  balanceUrl: string;
}

export default function TicketSold({
  sellerName = "Jordan",
  eventName = "ESCP Winter Gala 2026",
  eventWhen = "12 December 2026, 20:00",
  netAmount = "€38.00",
  balanceUrl = "https://ticket-safe.eu/settings/listings",
}: Props) {
  return (
    <Layout eyebrow="Resale" title="Your ticket sold" preheader={`${netAmount} added to your Ticket Safe balance.`}>
      <Text style={{ margin: "0 0 4px" }}>Hi {sellerName},</Text>
      <Text style={{ margin: "0 0 4px" }}>
        Good news — your ticket for <strong>{eventName}</strong> ({eventWhen}) has just been bought on Ticket Safe.
      </Text>
      <TicketSummary rows={[{ label: "Added to your balance", value: netAmount, valueColor: T.accent }]} />
      <Text style={{ margin: "0 0 24px", fontSize: 13, color: T.textMuted }}>
        This amount is available in your balance, ready to withdraw to your IBAN (a 5% Ticket Safe fee applies at withdrawal).
      </Text>
      <Button href={balanceUrl}>Open my balance</Button>
    </Layout>
  );
}
