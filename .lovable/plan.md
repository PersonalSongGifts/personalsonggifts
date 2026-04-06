

## Download Upsell — $49 for Download + Usage Rights

### How it works
Customers can still **stream** their song for free on the song page. But to **download** it, they pay $49. This mirrors the existing lyrics unlock flow. Existing customers (orders created before the cutoff) keep free downloads.

### Architecture (mirrors lyrics unlock)

```text
Song Page (SongPlayer.tsx)
  └─ Download button clicked
       ├─ If download_unlocked → download as today
       └─ If locked → call create-download-checkout
             └─ Stripe Checkout ($49, mode: payment)
                   └─ success_url → /song/:id?download_session_id={CHECKOUT_SESSION_ID}
                         └─ verify-download-purchase (validates payment, sets download_unlocked_at)
                               └─ Re-fetch song data → download button now works
```

### Database migration
Add columns to `orders` table:
- `download_unlocked_at` (timestamptz, nullable) — when download was purchased
- `download_unlock_session_id` (text, nullable) — Stripe session ID for idempotency
- `download_unlock_payment_intent_id` (text, nullable) — for dispute reference
- `download_price_cents` (integer, nullable) — amount paid

Backfill: set `download_unlocked_at = now()` for all existing orders created before the deploy date, so they keep free downloads.

### Stripe
Create a new Stripe Product ("Song Download + Usage Rights") with a Price of $49.00 (one-time). Hardcode the `price_id` in the edge function, same pattern as lyrics.

### Edge functions

**`create-download-checkout`** (new)
- Accepts `{ orderId }`, resolves short ID or UUID
- Validates order exists and has a `song_url`
- If `download_unlocked_at` is already set → returns `{ alreadyUnlocked: true }`
- Creates Stripe Checkout session with metadata `{ orderId, entitlement: "download_unlock" }`
- Fixed $49 price (no promo awareness), no `allow_promotion_codes`
- Returns `{ url }` for redirect

**`verify-download-purchase`** (new)
- Accepts `{ sessionId }`, retrieves from Stripe
- Validates `payment_status === "paid"` and `metadata.entitlement === "download_unlock"`
- Derives `orderId` from metadata (never from client)
- Idempotent update: sets `download_unlocked_at`, `download_unlock_session_id`, `download_unlock_payment_intent_id`, `download_price_cents`
- Only updates where `download_unlocked_at IS NULL`

**`get-song-page`** (modify)
- Add `download_unlocked_at` to select fields
- Return `download_unlocked: !!order.download_unlocked_at` in response
- Continue returning `song_url` (needed for streaming)

**`stripe-webhook`** (no change needed — entitlement handled by verify function)

### Frontend changes

**`src/pages/SongPlayer.tsx`**
- Add `download_unlocked` to `SongData` interface
- **Download button behavior**:
  - If `download_unlocked` → current download behavior (fetch blob, trigger download)
  - If not unlocked → call `create-download-checkout`, redirect to Stripe
- Update button label: locked state shows "Download Song — $49.00 USD" with a Lock icon; unlocked shows "Download" with Download icon
- Handle `download_session_id` URL param on return from Stripe (same pattern as `lyrics_session_id`)
- Remove the "Download Song Instead" fallback in the audio error section when download is locked (or replace with a message)

### Grandfathering
A one-time backfill migration sets `download_unlocked_at = now()` for all existing orders, so every current customer keeps free downloads. Only new orders after deploy will require payment.

### Files changed
| File | Change |
|------|--------|
| Migration SQL | Add 4 columns + backfill existing orders |
| `supabase/functions/create-download-checkout/index.ts` | New — Stripe checkout for download |
| `supabase/functions/verify-download-purchase/index.ts` | New — verify + unlock |
| `supabase/functions/get-song-page/index.ts` | Return `download_unlocked` flag |
| `src/pages/SongPlayer.tsx` | Gated download button + Stripe redirect flow |

