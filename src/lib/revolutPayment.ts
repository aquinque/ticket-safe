import axios from 'axios';

// Revolut API configuration
const REVOLUT_API_BASE = import.meta.env.VITE_REVOLUT_API_BASE || 'https://merchant.revolut.com/api/1.0';
const REVOLUT_API_KEY = import.meta.env.VITE_REVOLUT_API_KEY || '';

interface RevolutOrderRequest {
  amount: number;
  currency: string;
  description: string;
  customer_email?: string;
  merchant_order_ext_ref?: string;
  metadata?: Record<string, string>;
}

interface RevolutOrderResponse {
  id: string;
  public_id: string;
  state: string;
  checkout_url: string;
  amount: number;
  currency: string;
}

interface RevolutPayoutRequest {
  account_id: string;
  amount: number;
  currency: string;
  reference: string;
  receiver: {
    email: string;
    name: string;
  };
}

/**
 * Create a Revolut payment order for buying tickets
 */
export const createRevolutOrder = async (
  params: RevolutOrderRequest
): Promise<RevolutOrderResponse> => {
  try {
    const response = await axios.post<RevolutOrderResponse>(
      `${REVOLUT_API_BASE}/orders`,
      params,
      {
        headers: {
          'Authorization': `Bearer ${REVOLUT_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );
    return response.data;
  } catch (error) {
    console.error('Error creating Revolut order:', error);
    throw new Error('Failed to create payment order');
  }
};

/**
 * Get order status from Revolut
 */
export const getRevolutOrderStatus = async (orderId: string): Promise<RevolutOrderResponse> => {
  try {
    const response = await axios.get<RevolutOrderResponse>(
      `${REVOLUT_API_BASE}/orders/${orderId}`,
      {
        headers: {
          'Authorization': `Bearer ${REVOLUT_API_KEY}`,
        },
      }
    );
    return response.data;
  } catch (error) {
    console.error('Error getting Revolut order status:', error);
    throw new Error('Failed to get order status');
  }
};

/**
 * Create a payout for seller when ticket is sold
 */
export const createRevolutPayout = async (
  params: RevolutPayoutRequest
): Promise<any> => {
  try {
    const response = await axios.post(
      `${REVOLUT_API_BASE}/payouts`,
      params,
      {
        headers: {
          'Authorization': `Bearer ${REVOLUT_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );
    return response.data;
  } catch (error) {
    console.error('Error creating Revolut payout:', error);
    throw new Error('Failed to create payout');
  }
};

/**
 * Calculate platform fee and seller payout
 */
export const calculatePaymentBreakdown = (ticketPrice: number, quantity: number) => {
  const subtotal = ticketPrice * quantity;
  const platformFee = subtotal * 0.05; // 5% platform fee
  const totalAmount = subtotal + platformFee;
  const sellerPayout = subtotal; // Seller gets full ticket price, buyer pays platform fee

  return {
    subtotal,
    platformFee,
    totalAmount,
    sellerPayout,
  };
};

/**
 * Mock function for development - simulates Revolut payment
 * Remove this when using real Revolut API
 */
export const mockRevolutPayment = async (
  amount: number,
  description: string
): Promise<{ success: boolean; orderId: string }> => {
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 1500));

  return {
    success: true,
    orderId: `mock_order_${Date.now()}`,
  };
};
