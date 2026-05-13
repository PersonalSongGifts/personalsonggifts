# Tip jar on the song page

Let listeners thank the team after hearing their song. Two entry points on `/song/:orderId`: a small heart icon near the share/download row, and a fuller "Leave a tip" card below the player. Both open the same flow.

## Copy

Headline: **"Loved your song?"**
Body: *"Leave a tip for the small team who crafted it and help us keep making songs like this."*
Buttons: **$5** · **$10** · **$20** · **Other amount**
CTA: **"Send a tip →"**
After return: **"Thank you — your tip means the world to us. 💛"**

Tone matches the brand (Hallmark/Etsy, navy + cream, no AI mentions). No guilt, no urgency, no "support the artist" language that conflicts with the "small team" framing.

## User flow

```text
Song page
  ├── Heart icon (header row)  ──┐
  └── "Leave a tip" card         ├──► Amount selector ($5/$10/$20/custom)
       (below player, above       │         │
        share section)            │         ▼
                                  │   Stripe Checkout (new tab)
                                  │         │
                                  ▼         ▼
                            Return → /song/:orderId?tip=success
                                  │
                                  ▼
                          Verify session, show thank-you toast,
                          mark tip as paid in DB
```

- Custom amount: min $1, max $500, integer dollars only.
- Checkout opens in a new tab (consistent with existing upsells like bonus/lyrics/download).
- On success return, a one-time `verify-tip` call records `paid_at` and shows a thank-you toast. Repeat visits don't re-show it.

## Placement details

1. **Heart icon** — small `Heart` (lucide) button in the existing action row next to Share/Download. Tooltip: "Leave a tip". Click opens the same dialog used by the card.
2. **Tip card** — sits between the player block and the share section. Cream surface, navy heading, three pill buttons + "Other". Single-line subcopy. ~120px tall on desktop, doesn't compete with the bonus-track or download upsells (which stay where they are).

Both render on every paid `/song/:orderId` view (delivered or ready). **Not** shown on `/preview/:token` lead pages.

## Technical section

### Database (new migration)

New table `song_tips`:
- `id uuid pk`
- `order_id uuid` (no FK — matches existing pattern)
- `amount_cents int not null`
- `currency text not null default 'usd'`
- `stripe_session_id text unique`
- `stripe_payment_intent_id text`
- `status text not null default 'pending'` — `pending` | `paid` | `failed`
- `customer_email text`
- `created_at timestamptz default now()`
- `paid_at timestamptz`

RLS: enabled, no public policies (service role only — same pattern as `orders`).

### Edge functions (two new)

Both POST-only (per project standard to bypass caching), CORS enabled, no JWT required.

1. **`create-tip-checkout`**
   - Body: `{ orderId: string, amountCents: number }`
   - Validates: order exists and is delivered/ready; `amountCents` between 100 and 50000.
   - Uses `price_data` (one-off, dynamic amount — tips are not a fixed SKU).
   - Inserts a `pending` `song_tips` row with the session id.
   - Returns `{ url }`.
   - `success_url`: `${origin}/song/{shortOrderId}?tip=success&session_id={CHECKOUT_SESSION_ID}`
   - `cancel_url`: `${origin}/song/{shortOrderId}?tip=cancelled`

2. **`verify-tip`**
   - Body: `{ sessionId: string }`
   - Retrieves session from Stripe; if `payment_status === 'paid'`, updates `song_tips` row to `paid`, stores `payment_intent`, `customer_email`, `paid_at`. Idempotent.
   - Returns `{ status, amountCents }`.

Both reuse `STRIPE_SECRET_KEY` already in secrets. No webhook needed (matches existing one-off upsell pattern for lyrics/download/bonus).

### Frontend

- **`src/components/song/TipJar.tsx`** — the card variant.
- **`src/components/song/TipDialog.tsx`** — shared dialog with amount pills + custom input + "Send a tip" button. Both the heart icon and the card open this.
- Edit `src/pages/SongPlayer.tsx`:
  - Import `Heart` from lucide-react, add icon button in the existing action row.
  - Render `<TipJar />` between player and share section.
  - On mount, if `?tip=success&session_id=...` is in the URL, call `verify-tip`, show thank-you toast (`sonner`), then strip the params via `setSearchParams`.
- Amplitude/Meta events (matches existing tracking conventions): `tip_view`, `tip_amount_selected`, `tip_checkout_started`, `tip_completed`. Hook into `useMetaPixel` / `amplitudeTrack` already in the codebase.

### Out of scope (can add later)

- Admin dashboard widget for tip totals (easy follow-up — query `song_tips` where `status='paid'`).
- Tipping on `/preview/:token` lead pages.
- Tip leaderboard or public thank-you wall.
- Recurring/subscription tipping.