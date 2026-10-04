import { Text, Section } from "@react-email/components";
import { Layout } from "../components/Layout";
import { Button } from "../components/Button";
import { emailTokens as T } from "../tokens";

interface Props {
  recipientName: string;
  senderName: string;
  eventName: string;
  isOffer: boolean;
  offerPrice: string | null;
  messageUrl: string;
}

export default function NewMessage({
  recipientName = "Sam",
  senderName = "Jordan",
  eventName = "ESCP Winter Gala 2026",
  isOffer = true,
  offerPrice = "€20.00",
  messageUrl = "https://ticket-safe.eu/messages/conv_123",
}: Props) {
  return (
    <Layout
      eyebrow={isOffer ? "Price offer" : "Messages"}
      title={isOffer ? `New price offer: ${offerPrice}` : "You have a new message"}
      preheader={isOffer ? `${senderName} proposed ${offerPrice} for ${eventName}.` : `${senderName} sent you a message about ${eventName}.`}
    >
      <Text style={{ margin: "0 0 4px" }}>Hi {recipientName},</Text>
      {isOffer ? (
        <>
          <Text style={{ margin: "0 0 4px" }}>
            <strong>{senderName}</strong> proposed a new price for <strong>{eventName}</strong>.
          </Text>
          <Section style={{ margin: "18px 0", background: T.bodyBg, border: `1px solid ${T.border}`, padding: "16px 20px", textAlign: "center" }}>
            <Text style={{ margin: 0, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: T.textMuted }}>
              Proposed price
            </Text>
            <Text style={{ margin: "4px 0 0", fontFamily: T.fontHeading, fontSize: 26, fontWeight: 700, color: T.accent }}>{offerPrice}</Text>
          </Section>
        </>
      ) : (
        <Text style={{ margin: "0 0 4px" }}>
          <strong>{senderName}</strong> sent you a message about <strong>{eventName}</strong>.
        </Text>
      )}
      <Button href={messageUrl}>{isOffer ? "Accept or decline" : "View message"}</Button>
      <Text style={{ margin: "24px 0 0", fontSize: 12, color: T.textMuted }}>
        You're receiving this because you have an active conversation on Ticket Safe.
      </Text>
    </Layout>
  );
}
