

# Stripe Payment Integration Plan

## Overview
This plan integrates Stripe Checkout into your existing checkout flow, allowing customers to pay for their custom songs securely. When a customer clicks "Complete Payment", they'll be redirected to Stripe's hosted checkout page, and after successful payment, they'll return to a confirmation page.

## Current Flow
1. Customer fills out song details on `/create`
2. Customer selects pricing tier on `/checkout` 
3. Currently: Order is created immediately (no actual payment)
4. Customer sees confirmation on `/confirmation`

## New Flow
1. Customer fills out song details on `/create`
2. Customer selects pricing tier on `/checkout`
3. Customer clicks "Complete Payment" → redirected to Stripe Checkout
4. After payment → redirected to `/payment-success`
5. Payment success page creates the order and shows confirmation

## Stripe Products Created
- **Standard Song**: $49 (price_1Sty7MGax2m9otRw5WBP7Wto)
- **Priority Song**: $79 (price_1Sty7hGax2m9otRwGKt6AAbP)

## Implementation Steps

### 1. Create Stripe Checkout Edge Function
Create `supabase/functions/create-checkout/index.ts` that:
- Receives the selected tier and form data from the frontend
- Creates a Stripe Checkout Session with the correct price
- Stores the form data in session metadata so we can retrieve it after payment
- Returns the checkout URL for redirect

### 2. Update Checkout Page
Modify `src/pages/Checkout.tsx` to:
- Call the new `create-checkout` function instead of creating the order directly
- Redirect to Stripe Checkout URL on button click
- Remove direct order creation (this happens after payment succeeds)

### 3. Create Payment Success Page
Create `src/pages/PaymentSuccess.tsx` that:
- Retrieves the Stripe session ID from URL parameters
- Calls the existing `create-order` edge function to save the order
- Shows the confirmation to the customer
- Handles the case where the session ID is missing or invalid

### 4. Add Route for Payment Success
Update `src/App.tsx` to add the `/payment-success` route

### 5. Modify Order Service
Update `src/lib/orderService.ts` to support being called from the payment success page with data retrieved from Stripe

---

## Technical Details

### Edge Function: create-checkout
```
Location: supabase/functions/create-checkout/index.ts

Input: { pricingTier, formData }
Output: { url: string }

The function will:
1. Map tier to price ID (standard → price_1Sty7MGax2m9otRw5WBP7Wto, priority → price_1Sty7hGax2m9otRwGKt6AAbP)
2. Create Stripe Checkout Session with:
   - mode: "payment"
   - line_items with the correct price
   - success_url: /payment-success?session_id={CHECKOUT_SESSION_ID}
   - cancel_url: /checkout
   - metadata containing all the form data (for order creation after payment)
3. Return the session URL
```

### Payment Success Page
```
Location: src/pages/PaymentSuccess.tsx

Behavior:
1. On mount, get session_id from URL params
2. Call create-order edge function with the session data
3. Display confirmation (reuses current Confirmation page design)
4. Handle errors gracefully
```

### Updated Checkout Flow
```
1. User clicks "Complete Payment"
2. Frontend calls create-checkout edge function
3. Frontend redirects to returned Stripe URL
4. User completes payment on Stripe
5. Stripe redirects to /payment-success?session_id=...
6. PaymentSuccess page calls create-order to save the order
7. User sees confirmation
```

