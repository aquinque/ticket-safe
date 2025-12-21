# Revolut Payment Integration Guide

## Overview

This application uses **Revolut Merchant API** for secure payment processing when buying and selling tickets.

## Features

### For Buyers:
- Secure checkout with Revolut
- Multiple payment methods (cards, Revolut balance, Apple Pay, Google Pay)
- Instant payment confirmation
- 5% platform fee added to ticket price

### For Sellers:
- Automatic payout to Revolut account after successful sale
- Receive full ticket price (platform fee paid by buyer)
- Fast settlement (typically within 24 hours)

## Setup Instructions

### 1. Get Revolut API Credentials

1. Go to [Revolut Business](https://business.revolut.com)
2. Navigate to **Settings** → **Developer** → **API**
3. Create a new API key with these permissions:
   - `payments:read`
   - `payments:write`
   - `payouts:write`
4. Copy your API key

### 2. Configure Environment Variables

Create a `.env` file in the project root:

```bash
# Revolut Configuration
VITE_REVOLUT_API_KEY=your_api_key_here
VITE_REVOLUT_API_BASE=https://merchant.revolut.com/api/1.0

# For testing/sandbox:
# VITE_REVOLUT_API_BASE=https://sandbox-merchant.revolut.com/api/1.0
```

### 3. Test Mode

The application currently uses a **mock payment function** for development:
- Located in: `src/lib/revolutPayment.ts`
- Function: `mockRevolutPayment()`
- Simulates successful payment after 1.5 seconds

To enable **real Revolut payments**:
1. Add your API key to `.env`
2. Replace `mockRevolutPayment()` calls with `createRevolutOrder()`
3. Handle the redirect to Revolut checkout URL

## Payment Flow

### Buying Tickets

1. User selects tickets in marketplace
2. Clicks "Buy Ticket" → redirected to ticket detail page
3. Clicks "Proceed to Checkout"
4. Reviews order summary with price breakdown
5. Clicks "Pay with Revolut"
6. **Production**: Redirected to Revolut checkout
7. **Mock**: Simulated success after 1.5s
8. On success: Tickets transferred to buyer's account

### Selling Tickets

1. User lists ticket for sale in "Sell" page
2. Buyer completes purchase (see above)
3. Platform automatically initiates payout to seller's Revolut account
4. Seller receives notification of sale and payout

## Price Breakdown

For a €50 ticket:
- **Ticket Price**: €50.00 (goes to seller)
- **Platform Fee (5%)**: €2.50 (paid by buyer)
- **Total Buyer Pays**: €52.50
- **Seller Receives**: €50.00

## API Functions

### `createRevolutOrder()`
Creates a payment order for ticket purchase.

```typescript
const order = await createRevolutOrder({
  amount: totalAmount,
  currency: 'EUR',
  description: 'Ticket purchase: Event Name',
  customer_email: user.email,
  merchant_order_ext_ref: listingId,
});

// Redirect user to: order.checkout_url
```

### `getRevolutOrderStatus()`
Check payment status.

```typescript
const status = await getRevolutOrderStatus(orderId);
// status.state: 'PENDING' | 'COMPLETED' | 'FAILED'
```

### `createRevolutPayout()`
Send money to seller after successful sale.

```typescript
const payout = await createRevolutPayout({
  account_id: 'revolut_account_id',
  amount: ticketPrice,
  currency: 'EUR',
  reference: `Payout for listing ${listingId}`,
  receiver: {
    email: sellerEmail,
    name: sellerName,
  },
});
```

## Security

- All payments processed through Revolut's secure infrastructure
- API keys stored in environment variables (never committed to Git)
- HTTPS enforced for all API calls
- PCI DSS compliant

## Testing

### Sandbox Environment

Use Revolut's sandbox for testing:

```bash
VITE_REVOLUT_API_BASE=https://sandbox-merchant.revolut.com/api/1.0
VITE_REVOLUT_API_KEY=your_sandbox_api_key
```

### Test Cards (Sandbox)

Revolut provides test card numbers:
- **Success**: `4000 0000 0000 0077`
- **Decline**: `4000 0000 0000 0002`
- **3D Secure**: `4000 0000 0000 3220`

## Production Checklist

Before going live:

- [ ] Obtain production Revolut API key
- [ ] Update `.env` with production credentials
- [ ] Replace `mockRevolutPayment()` with real API calls
- [ ] Test complete payment flow
- [ ] Set up webhook for payment notifications
- [ ] Configure payout schedule
- [ ] Test payout to seller accounts
- [ ] Enable error logging and monitoring

## Webhook Setup (Optional)

Revolut can send webhooks for payment events:

1. In Revolut Business Dashboard: **Settings** → **Webhooks**
2. Add webhook URL: `https://ticket-safe.eu/api/revolut/webhook`
3. Subscribe to events:
   - `ORDER_COMPLETED`
   - `ORDER_AUTHORISED`
   - `PAYOUT_COMPLETED`

## Support

- Revolut API Docs: https://developer.revolut.com/docs/merchant-api
- Revolut Support: https://business.revolut.com/help
- Integration Issues: Contact Revolut Business Support

## Current Status

✅ Payment UI implemented
✅ Mock payment flow working
⏳ Real API integration pending (needs API key)
⏳ Webhook handlers pending
⏳ Payout automation pending

## Next Steps

1. **Obtain Revolut Business account** and API credentials
2. **Configure environment variables** with real API key
3. **Implement real API calls** replacing mock functions
4. **Test in sandbox** environment
5. **Set up webhooks** for payment notifications
6. **Deploy to production** when ready
