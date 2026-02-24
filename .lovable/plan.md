

# TikTok Pixel + Events API Integration

## Overview
Add TikTok tracking across your full conversion funnel -- browser-side pixel for real-time tracking plus a server-side Events API for reliable attribution (catches ad-blocker users).

## What You'll Need to Provide
- **TikTok Pixel ID** (e.g., `CXXXXXXXXXXXX`)
- **TikTok Events API Access Token** (from TikTok Ads Manager > Events > Manage > Settings)

## What Gets Built

### 1. Browser-Side: TikTok Pixel Script
Add the TikTok base pixel script to `index.html` (same pattern as your existing Meta Pixel and Google Analytics scripts). This fires a `PageView` on every page load.

### 2. Browser-Side: `useTikTokPixel` Hook
A new hook (`src/hooks/useTikTokPixel.ts`) matching the pattern of your existing `useMetaPixel` hook. Provides a `trackEvent()` function that calls `ttq.track()`.

### 3. Browser-Side: Funnel Event Tracking
Add TikTok event calls alongside existing Meta/GA calls in:

| Page | Event | TikTok Event Name |
|------|-------|--------------------|
| `/create` (start) | Song creation started | `ViewContent` |
| `/checkout` (view) | Checkout page viewed | `AddToCart` |
| `/checkout` (pay button) | Payment initiated | `InitiateCheckout` |
| `/payment-success` | Purchase confirmed | `CompletePayment` |

Files modified: `CreateSong.tsx`, `Checkout.tsx`, `PaymentSuccess.tsx`

### 4. Server-Side: TikTok Events API Edge Function
A new backend function (`supabase/functions/tiktok-track-event/index.ts`) that sends conversion events directly to TikTok's Events API (`https://business-api.tiktok.com/open_api/v1.2/pixel/track/`). This ensures conversions are tracked even when users have ad blockers.

Called from:
- The `stripe-webhook` function on successful payment (most reliable purchase signal)
- Optionally from the payment success page as a backup

### 5. Secrets Setup
Two secrets will be stored securely:
- `TIKTOK_PIXEL_ID`
- `TIKTOK_EVENTS_API_TOKEN`

## Technical Details

### TikTok Pixel Script (index.html)
Standard TikTok pixel snippet added to `<head>`, using the Pixel ID. Follows the exact same pattern as Meta Pixel already in place.

### useTikTokPixel Hook
```typescript
// Mirrors useMetaPixel pattern
declare global {
  interface Window {
    ttq: { track: (...args: unknown[]) => void; ... };
  }
}
export const useTikTokPixel = () => {
  const trackEvent = (eventName: string, params?: Record<string, unknown>) => {
    if (window.ttq) window.ttq.track(eventName, params);
  };
  return { trackEvent };
};
```

### Server-Side Events API
The edge function hashes email/phone using SHA-256 (required by TikTok) and posts to TikTok's API with event data including value, currency, and content info.

### Stripe Webhook Integration
After order creation in `stripe-webhook/index.ts`, fire a server-side `CompletePayment` event with the order value and customer email (hashed).

## Files Changed
- `index.html` -- add TikTok pixel script
- `src/hooks/useTikTokPixel.ts` -- new hook (similar to useMetaPixel)
- `src/pages/CreateSong.tsx` -- add ViewContent event
- `src/pages/Checkout.tsx` -- add AddToCart + InitiateCheckout events
- `src/pages/PaymentSuccess.tsx` -- add CompletePayment event
- `supabase/functions/tiktok-track-event/index.ts` -- new server-side Events API function
- `supabase/functions/stripe-webhook/index.ts` -- call tiktok-track-event on purchase
- `supabase/config.toml` -- register new edge function

## Steps
1. Store your TikTok Pixel ID and Events API Access Token as secrets
2. Add pixel script to index.html
3. Create the useTikTokPixel hook
4. Wire up browser-side events across the funnel pages
5. Create the server-side Events API edge function
6. Add server-side tracking call in the Stripe webhook
7. Deploy edge functions

