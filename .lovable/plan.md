

# Lyrics Unlock Upgrade ($4.99) -- Implementation Plan

## Overview

Add a $4.99 "Unlock Lyrics" upsell on every song delivery page. Works for all existing and future songs with lyrics. Full lyrics never sent to the browser until paid. Stripe webhook is canonical.

## Step-by-Step Changes

### 1. Create Stripe Product + Price

Create a "Lyrics Unlock" product at $4.99 USD (one-time) using the Stripe tool. The resulting price ID gets hardcoded in `create-lyrics-checkout`.

### 2. Database Migration

```sql
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS lyrics_unlocked_at timestamptz,
  ADD COLUMN IF NOT EXISTS lyrics_unlock_session_id text,
  ADD COLUMN IF NOT EXISTS lyrics_unlock_payment_intent_id text,
  ADD COLUMN IF NOT EXISTS lyrics_price_cents integer;
```

`lyrics_unlocked_at IS NOT NULL` is the single source of truth for unlock state.

### 3. Update `get-song-page` Edge Function

- Add `automation_lyrics`, `lyrics_unlocked_at` to the SELECT
- Server-side lyrics preview algorithm (only runs when locked + has lyrics):
  - Split by `\n`, filter empty lines
  - Take line 1 (full), line 2 (full), line 3 truncated to 42 chars with ellipsis
- Response contract:
  - `has_lyrics` (boolean)
  - `lyrics_unlocked` (boolean, derived from `lyrics_unlocked_at IS NOT NULL`)
  - If locked + has lyrics: return `lyrics_preview` only. Full lyrics NEVER sent.
  - If unlocked: return `lyrics` (full text)
  - If no lyrics: `has_lyrics: false`, no lyrics fields
- Add `Cache-Control: no-store` header
- Short ID prefix match hardened: 0 matches = 404, >1 matches = error "Ambiguous ID", exactly 1 = proceed

### 4. New Edge Function: `create-lyrics-checkout`

- Input: `{ orderId }`
- Resolves order (short ID prefix match, collision-safe: exactly 1 match required)
- Validates: order exists AND has `automation_lyrics` (no delivery status check per spec)
- If `lyrics_unlocked_at` already set: returns `{ alreadyUnlocked: true }`
- Creates Stripe Checkout session with `metadata: { orderId: <full UUID>, entitlement: "lyrics_unlock" }`
- `success_url`: `/song/{shortId}?lyrics_session_id={CHECKOUT_SESSION_ID}`
- Returns `{ url: <checkout URL> }`

### 5. New Edge Function: `verify-lyrics-purchase`

Hardened: does NOT trust client-provided orderId.

- Input: `{ sessionId }` (orderId optional, used only as sanity check)
- Retrieves Stripe session by sessionId
- Validates:
  - `payment_status === "paid"`
  - `metadata.entitlement === "lyrics_unlock"`
  - `metadata.orderId` exists (full UUID)
- Uses `metadata.orderId` as the authoritative order to unlock (ignores any client-passed orderId)
- Idempotently writes (only if `lyrics_unlocked_at IS NULL`):
  - `lyrics_unlocked_at = now()`
  - `lyrics_unlock_session_id = session.id`
  - `lyrics_unlock_payment_intent_id = session.payment_intent`
  - `lyrics_price_cents = session.amount_total`
- Returns `{ success: true }`

### 6. Update `stripe-webhook` Edge Function

Add early handler for lyrics unlock (before order-creation logic):

- On `checkout.session.completed`, check `metadata.entitlement === "lyrics_unlock"` first
- Same idempotent write as verify-lyrics-purchase
- Return early with success -- do not fall through to order creation

### 7. Update `SongPlayer.tsx` (Frontend)

Update the `SongData` interface and add lyrics UI between the action buttons and Reaction CTA:

**No lyrics** (`has_lyrics: false`):
- Show small muted message: "Lyrics aren't available for this song yet."

**Locked** (`has_lyrics: true`, `lyrics_unlocked: false`):
- Show `lyrics_preview` text in a styled container (Playfair Display font)
- Below: gradient fade overlay (no hidden text behind it)
- Below fade: "Unlock Full Lyrics -- $4.99" button
- Full lyrics never in DOM, network, or JS variables

**Unlocked** (`lyrics_unlocked: true`, lyrics present):
- Show full lyrics in a scrollable container with Playfair Display font
- Include a "Copy Lyrics" button

**Unlocked but lyrics missing** (admin cleared lyrics after purchase):
- Show "Your lyrics are being prepared" message

**After Stripe redirect:**
- Detect `lyrics_session_id` URL param on load
- Call `verify-lyrics-purchase` with `{ sessionId }` only
- On success, re-fetch song data to get full lyrics
- Clean URL param after processing

**Lyrics styling:**
- Font: Playfair Display (Google Fonts link in index.html), weight 400
- `font-size: 1.05rem`, `line-height: 1.65`, `white-space: pre-wrap`
- Gradient fade below preview; CTA below faded area

### 8. Update Admin Page

Add a warning badge in the order detail dialog when `lyrics_unlocked_at IS NOT NULL` but `automation_lyrics` is null/empty. This flags "Paid for lyrics but content missing" for support visibility.

### 9. Config Updates

Add to `supabase/config.toml`:

```text
[functions.create-lyrics-checkout]
verify_jwt = false

[functions.verify-lyrics-purchase]
verify_jwt = false
```

## Security

- Full lyrics never in API response until `lyrics_unlocked_at` is set (server-side gate)
- `verify-lyrics-purchase` derives target order from Stripe metadata, not client input
- Short ID prefix matching is collision-safe (exactly 1 match required)
- `Cache-Control: no-store` prevents cached response leaks
- All writes are idempotent (only update if `lyrics_unlocked_at IS NULL`)
- No lyrics in DOM, network, analytics, meta tags, or JS variables when locked

## Refund Policy

Lyrics stay unlocked after refund. No relocking logic.

## Backfill Decision

92 pre-Feb-2 orders without lyrics will show "Lyrics aren't available for this song yet." -- no upsell button. Batch backfill deferred to a separate task.

