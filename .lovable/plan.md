

# TikTok Pixel + Events API Implementation

## Step 1: Store Secrets
Request your **TikTok Events API Access Token** via the secure secrets tool, stored as `TIKTOK_EVENTS_API_TOKEN`.

## Step 2: Add TikTok Pixel to index.html
Insert the exact TikTok pixel snippet you provided (Pixel ID: `D6F0ED3C77U0SFL8LB60`) into the `<head>` section, alongside your existing Meta Pixel and Google Analytics scripts.

## Step 3: Create `useTikTokPixel` Hook
New file: `src/hooks/useTikTokPixel.ts` -- mirrors your existing `useMetaPixel` pattern.

## Step 4: Add Browser-Side Funnel Events
Wire up TikTok tracking events in:
- **CreateSong.tsx** -- `ViewContent` when song creation starts
- **Checkout.tsx** -- `AddToCart` on page view, `InitiateCheckout` on payment button click
- **PaymentSuccess.tsx** -- `CompletePayment` on successful purchase

## Step 5: Create Server-Side Edge Function
New file: `supabase/functions/tiktok-track-event/index.ts` -- sends conversion events to TikTok's Events API with SHA-256 hashed customer data.

## Step 6: Update Stripe Webhook
Add a non-blocking call to `tiktok-track-event` in `stripe-webhook/index.ts` after successful order creation -- fires server-side `CompletePayment`.

## Step 7: Register Edge Function
Add `tiktok-track-event` entry to `supabase/config.toml`.

## Files Changed
- `index.html` (modified)
- `src/hooks/useTikTokPixel.ts` (new)
- `src/pages/CreateSong.tsx` (modified)
- `src/pages/Checkout.tsx` (modified)
- `src/pages/PaymentSuccess.tsx` (modified)
- `supabase/functions/tiktok-track-event/index.ts` (new)
- `supabase/functions/stripe-webhook/index.ts` (modified)
- `supabase/config.toml` (modified)

