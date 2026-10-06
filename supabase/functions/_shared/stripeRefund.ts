/**
 * Refund of a payment taken on TicketSafe's platform account (destination
 * charge): the buyer paid ticket price + service fee to the platform, and the
 * ticket price was transferred to the organizer's connected account at
 * payment time. Stripe's processing fee was charged to the platform.
 *
 * The refund is issued on the platform, and the amount already transferred to
 * the organizer is pulled back in proportion (reverse_transfer). Whether the
 * service fee is given back is the caller's policy (refund_application_fee).
 * Stripe keeps its processing fee in every case.
 *
 * Also valid for the legacy platform charges from before Connect: those have
 * no transfer and no application fee, so neither option is sent.
 */
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

export interface PlatformRefundArgs {
  paymentIntentId: string;
  /** Omit to refund the whole payment. */
  amountCents?: number;
  /** Give the service fee back to the buyer as well. */
  refundApplicationFee: boolean;
  metadata: Record<string, string>;
  idempotencyKey?: string;
}

export async function refundPlatformPayment(stripe: Stripe, args: PlatformRefundArgs): Promise<Stripe.Refund> {
  const intent = await stripe.paymentIntents.retrieve(args.paymentIntentId, { expand: ["latest_charge"] });
  const charge = intent.latest_charge && typeof intent.latest_charge === "object" ? (intent.latest_charge as Stripe.Charge) : null;
  const hasTransfer = !!charge?.transfer;
  const hasApplicationFee = !!charge?.application_fee;

  return stripe.refunds.create(
    {
      payment_intent: args.paymentIntentId,
      ...(args.amountCents !== undefined ? { amount: args.amountCents } : {}),
      ...(hasTransfer ? { reverse_transfer: true } : {}),
      ...(hasApplicationFee ? { refund_application_fee: args.refundApplicationFee } : {}),
      metadata: args.metadata,
    },
    args.idempotencyKey ? { idempotencyKey: args.idempotencyKey } : undefined,
  );
}
