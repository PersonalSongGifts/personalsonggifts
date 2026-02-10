

# Add Lyrics Unlock Stats to Admin Dashboard

## Approach

Since the admin dashboard already fetches all orders (with `lyrics_unlocked_at` and `lyrics_price_cents` columns included), we can compute lyrics unlock metrics entirely client-side in the existing `StatsCards` component. No backend changes required.

## Changes

### 1. Update `StatsCards.tsx` -- Add Lyrics Unlock section

Add the Order interface fields:
- `lyrics_unlocked_at?: string | null`
- `lyrics_price_cents?: number | null`

Add a new stats section called **"Lyrics Unlocks"** with these cards:

| Card | Value | Description |
|------|-------|-------------|
| Total Unlocks | count where `lyrics_unlocked_at` is set | "All time" |
| Unlock Revenue | sum of `lyrics_price_cents / 100` as dollars | "Paid: X, Free: Y" |
| Paid Unlocks | count where unlocked AND `lyrics_price_cents > 0` | "At $4.99 each" |
| Free Unlocks | count where unlocked AND `lyrics_price_cents` is 0 or null | "Admin/comp unlocks" |

Uses the existing card grid layout and icon styling (BookOpen or similar icon from lucide-react).

### 2. Update `Admin.tsx` Order interface

Add `lyrics_unlocked_at` and `lyrics_price_cents` to the Order interface so TypeScript is happy (the data is already being returned from the backend).

No edge function changes, no database changes, no new endpoints needed.

