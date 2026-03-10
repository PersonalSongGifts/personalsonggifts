

## Add PayPal as Alternative Payment Method

Since PayPal isn't available through the existing Stripe Checkout integration for US-based accounts, we'll integrate PayPal directly using their REST API + JavaScript SDK.

### How It Works

Customers will see a "Pay with PayPal" button alongside the existing Stripe checkout button. International customers can pay in their local currency via PayPal.

### What's Needed First

**PayPal API Credentials** — You'll need a PayPal Business account and two secrets:
1. **PAYPAL_CLIENT_ID** — Found in the PayPal Developer Dashboard under your app's credentials
2. **PAYPAL_SECRET_KEY** — Same location, the "Secret" value

Both have sandbox (test) and live (production) versions. We'll use live for production.

### Implementation Plan

**1. New Edge Function: `create-paypal-order`**
- Receives the same checkout input (tier, formData, promo code)
- Validates promo codes using the same logic as `create-checkout`
- Calls PayPal's REST API to create an order with the correct amount
- Returns the PayPal order ID to the client

**2. New Edge Function: `capture-paypal-payment`**
- Called after the customer approves payment in PayPal
- Captures the PayPal payment via REST API
- Creates the order in the database (same logic as `process-payment`)
- Sends confirmation email, syncs to Zapier, marks leads as converted
- Returns order details to redirect to the success page

**3. Update `src/pages/Checkout.tsx`**
- Load PayPal JS SDK via script tag using the client ID
- Add a "Pay with PayPal" button below the existing checkout button
- On PayPal approval, call `capture-paypal-payment` and redirect to success page

**4. Update `src/pages/PaymentSuccess.tsx`**
- Handle PayPal order IDs in addition to Stripe session IDs

### Security
- PayPal secret key stays server-side in edge functions only
- Client ID is safe to expose (it's a publishable key)
- All payment capture and order creation happens server-side

Shall I proceed? I'll first need you to provide the PayPal API credentials.

