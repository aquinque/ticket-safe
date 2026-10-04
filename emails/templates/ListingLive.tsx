import { Text } from "@react-email/components";
import { Layout } from "../components/Layout";
import { Button } from "../components/Button";

interface Props {
  sellerName: string;
  eventName: string;
  marketplaceUrl: string;
}

export default function ListingLive({
  sellerName = "Jordan",
  eventName = "ESCP Winter Gala 2026",
  marketplaceUrl = "https://ticket-safe.eu/marketplace/buy",
}: Props) {
  return (
    <Layout eyebrow="Resale · Listing approved" title="Your ticket is live" preheader={`Your ticket for ${eventName} is now live on the marketplace.`}>
      <Text style={{ margin: "0 0 4px" }}>Hi {sellerName},</Text>
      <Text style={{ margin: "0 0 4px" }}>
        Your ticket for <strong>{eventName}</strong> has been approved by our team and is now live on the marketplace. Buyers can find and purchase
        it right away.
      </Text>
      <Button href={marketplaceUrl}>View marketplace</Button>
    </Layout>
  );
}
