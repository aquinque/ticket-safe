import { Text, Section } from "@react-email/components";
import { Layout } from "../components/Layout";
import { TicketSummary } from "../components/TicketSummary";
import { emailTokens as T } from "../tokens";

interface Props {
  eventName: string;
  refundAmount: string;
  reason: string | null;
}

export default function RefundIssued({
  eventName = "ESCP Winter Gala 2026",
  refundAmount = "€42.80",
  reason = "The venue cancelled the booking on short notice.",
}: Props) {
  return (
    <Layout eyebrow="Refund issued" title={`Your order for ${eventName} has been refunded`} preheader={`${refundAmount} refunded for ${eventName}.`}>
      <Text style={{ margin: "0 0 4px" }}>We've issued a refund for your purchase. Your tickets are no longer valid for entry.</Text>
      {reason && (
        <Section style={{ margin: "12px 0", background: T.bodyBg, borderLeft: `3px solid ${T.danger}`, padding: "14px 18px" }}>
          <Text style={{ margin: 0, fontSize: 13, color: T.textPrimary, lineHeight: "1.55" }}>Reason: {reason}</Text>
        </Section>
      )}
      <TicketSummary
        rows={[
          { label: "Refund amount", value: refundAmount, valueColor: T.accent },
          { label: "Where", value: "Back to the card used at checkout" },
          { label: "When", value: "3–10 business days, depending on your bank" },
        ]}
      />
      <Text style={{ margin: "24px 0 0", fontSize: 13, color: T.textMuted }}>
        Didn't expect this refund, or have questions? Just reply to this email.
      </Text>
    </Layout>
  );
}
