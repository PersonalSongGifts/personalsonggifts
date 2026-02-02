
# Stripe Webhook Implementation Plan

## Problem Summary
Currently, order creation depends on users staying on the `/payment-success` page long enough for the `process-payment` edge function to be called. If users close their browser prematurely, experience network issues, or use Stripe Link (which can bypass redirects), the order is never created despite successful payment.

## Solution: Server-to-Server Webhook
Implement a Stripe webhook handler that receives `checkout.session.completed` events directly from Stripe's servers. This ensures 100% reliable order fulfillment regardless of user behavior.

```text
┌─────────────┐      ┌──────────────┐      ┌─────────────┐
│   Browser   │──────│    Stripe    │──────│  Database   │
│   (User)    │      │   Servers    │      │  (Orders)   │
└─────────────┘      └──────────────┘      └─────────────┘
       │                    │                     │
       │  1. Pay at Stripe  │                     │
       │───────────────────>│                     │
       │                    │                     │
       │                    │  2. Webhook POST    │
       │                    │  (checkout.session  │
       │                    │   .completed)       │
       │                    │────────────────────>│
       │                    │                     │
       │  3. Redirect to    │  ✓ Order created    │
       │     success page   │  (already done!)    │
       │<───────────────────│                     │
       │                    │                     │
       │  (Even if user     │                     │
       │   closes browser,  │                     │
       │   order exists!)   │                     │
       └────────────────────┴─────────────────────┘
```

## Implementation Steps

### 1. Create `stripe-webhook` Edge Function
A new edge function that:
- Receives POST requests from Stripe
- Verifies the webhook signature using `STRIPE_WEBHOOK_SECRET`
- Handles `checkout.session.completed` events
- Creates orders using existing logic from `process-payment`
- Is idempotent (won't create duplicate orders)

### 2. Add Webhook Signing Secret
You'll need to add `STRIPE_WEBHOOK_SECRET` to your backend secrets. This secret is obtained from Stripe Dashboard when you configure the webhook endpoint.

### 3. Update `PaymentSuccess.tsx` 
Make the success page more resilient:
- Poll for the order to exist (webhook might complete before or after redirect)
- Show loading state while checking
- Gracefully handle the case where order already exists
- Keep existing analytics tracking

### 4. Configure Webhook in Stripe Dashboard
After deployment, you'll register the webhook URL in your Stripe Dashboard:
- Endpoint URL: `https://kjyhxodusvodkknmgmra.supabase.co/functions/v1/stripe-webhook`
- Events: `checkout.session.completed`

---

## Technical Details

### New Edge Function: `supabase/functions/stripe-webhook/index.ts`

**Key features:**
- Signature verification using `stripe.webhooks.constructEventAsync()` with Deno's SubtleCrypto
- Extracts metadata from checkout session (same fields already stored)
- Creates order in database (reusing existing logic)
- Sends confirmation email via `send-order-confirmation`
- Syncs to Zapier/Google Sheets
- Marks leads as converted
- Returns 200 to acknowledge receipt (Stripe will retry on failure)

**Idempotency:**
- Uses `notes: stripe_session:${sessionId}` to detect duplicate orders
- Safe to be called multiple times (Stripe may retry)

### Config Changes: `supabase/config.toml`

Add webhook function configuration:
```toml
[functions.stripe-webhook]
verify_jwt = false
```

### Updated Success Page Logic

```text
1. Load page with session_id
2. Check if order already exists (webhook may have completed)
3. If order exists → Show success immediately
4. If not → Wait briefly and check again (webhook in progress)
5. After ~5 seconds, if still no order → Show "processing" message
6. Track analytics events
```

---

## Required User Action

After I implement the code changes, you'll need to:

1. **Get the webhook signing secret** from Stripe:
   - Go to Stripe Dashboard → Developers → Webhooks
   - Add endpoint: `https://kjyhxodusvodkknmgmra.supabase.co/functions/v1/stripe-webhook`
   - Select event: `checkout.session.completed`
   - Copy the "Signing secret" (starts with `whsec_`)

2. **Add the secret** to your backend secrets as `STRIPE_WEBHOOK_SECRET`

---

## What This Fixes

| Before (Client-Side) | After (Webhook) |
|---------------------|-----------------|
| Order created only if user stays on success page | Order created by Stripe servers |
| Browser close = lost order | Browser close = order still created |
| Network issues = lost order | Network issues = Stripe retries |
| Stripe Link bypass = lost order | Works with all payment methods |

## Files to be Modified/Created

| File | Action |
|------|--------|
| `supabase/functions/stripe-webhook/index.ts` | Create new |
| `supabase/config.toml` | Add webhook config |
| `src/pages/PaymentSuccess.tsx` | Update to poll for order |

