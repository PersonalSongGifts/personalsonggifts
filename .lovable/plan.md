
# Lyrics Unlock Upgrade ($4.99) — IMPLEMENTED

## Status: ✅ Complete

All steps implemented and edge functions deployed + tested.

## What was built

### Stripe Product
- Product: `prod_TwypT7izyacLdc` ("Lyrics Unlock"), Price: `price_1Sz4rQGax2m9otRwuiNX9sEc` ($4.99 one-time)

### Database
- Added to `orders`: `lyrics_unlocked_at`, `lyrics_unlock_session_id`, `lyrics_unlock_payment_intent_id`, `lyrics_price_cents`

### Edge Functions
- **get-song-page**: Returns `has_lyrics`, `lyrics_unlocked`, `lyrics_preview` (locked) or `lyrics` (unlocked). Cache-Control: no-store. Collision-safe prefix matching.
- **create-lyrics-checkout**: Creates Stripe session with `entitlement: "lyrics_unlock"` metadata. No delivery status check.
- **verify-lyrics-purchase**: Derives orderId from Stripe metadata (not client). Idempotent writes.
- **stripe-webhook**: Early return handler for `lyrics_unlock` entitlement before order creation.

### Frontend (SongPlayer.tsx)
- Locked: lyrics preview + gradient fade + "$4.99 Unlock" button
- Unlocked: full lyrics in Playfair Display + Copy button
- No lyrics: "Lyrics aren't available for this song yet."
- Stripe redirect: verifies purchase, re-fetches data, cleans URL

### Admin
- Warning badge when lyrics paid but content missing
- "Unlocked" badge on lyrics section when purchased

## Security
- Full lyrics never sent unless `lyrics_unlocked_at` is set
- verify-lyrics-purchase uses Stripe metadata as authoritative source
- All writes idempotent (only if `lyrics_unlocked_at IS NULL`)
- Cache-Control: no-store on all get-song-page responses

## Backfill
- 92 pre-Feb-2 orders without lyrics show "Lyrics aren't available" — deferred to separate task
