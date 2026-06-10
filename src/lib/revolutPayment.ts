/**
 * Revolut payment client — DISABLED.
 *
 * Payments are processed through Stripe via Supabase edge functions
 * (`stripe-create-checkout`, `stripe-webhook`). The previous version of this
 * file made direct calls to the Revolut Merchant API using a bearer key read
 * from `VITE_REVOLUT_API_KEY` — which would have been bundled into the
 * browser, leaking the key to every visitor.
 *
 * The helpers below are kept only so that any lingering import compiles.
 * Each function throws if called. To re-enable Revolut, build a Supabase
 * edge function that holds the API key server-side and call that function
 * from the frontend instead.
 */

const DISABLED_MSG =
  'Revolut frontend integration is disabled. Use the Stripe edge functions for payments.';

export interface RevolutOrderRequest {
  amount: number;
  currency: string;
  description: string;
  customer_email?: string;
  merchant_order_ext_ref?: string;
  metadata?: Record<string, string>;
}

export interface RevolutOrderResponse {
  id: string;
  public_id: string;
  state: string;
  checkout_url: string;
  amount: number;
  currency: string;
}

export interface RevolutPayoutRequest {
  account_id: string;
  amount: number;
  currency: string;
  reference: string;
  receiver: { email: string; name: string };
}

export const createRevolutOrder = async (
  _params: RevolutOrderRequest,
): Promise<RevolutOrderResponse> => {
  throw new Error(DISABLED_MSG);
};

export const getRevolutOrderStatus = async (
  _orderId: string,
): Promise<RevolutOrderResponse> => {
  throw new Error(DISABLED_MSG);
};

export const createRevolutPayout = async (
  _params: RevolutPayoutRequest,
): Promise<unknown> => {
  throw new Error(DISABLED_MSG);
};

/**
 * Calculate platform fee and seller payout (resale).
 * - Buyer pays 6% on top of the listing price.
 * - Seller pays 5% deducted at withdrawal.
 */
export const calculatePaymentBreakdown = (ticketPrice: number, quantity: number) => {
  const subtotal = ticketPrice * quantity;
  const buyerFee = Math.round(subtotal * 100 * 0.06) / 100;
  const totalAmount = subtotal + buyerFee;
  const sellerCommission = Math.round(subtotal * 100 * 0.05) / 100;
  const sellerPayout = subtotal - sellerCommission;
  return { subtotal, buyerFee, totalAmount, sellerCommission, sellerPayout };
};

export const mockRevolutPayment = async (
  _amount: number,
  _description: string,
): Promise<{ success: boolean; orderId: string }> => {
  throw new Error(DISABLED_MSG);
};
