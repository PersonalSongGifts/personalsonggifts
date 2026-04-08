

## Make Bonus Section More Prominent + Add Bonus Engagement Tracking

### Part 1: Redesign Bonus Section on Song Page

Currently the bonus track section is a small card with a tiny cover image strip, small text, and a compact player. It needs to feel like a "second song" rather than an afterthought.

**File: `src/pages/SongPlayer.tsx`** (lines 957–1124)

Redesign the bonus section to mirror the primary song's layout:

- **Large album art**: Replace the 48px-tall strip with a full `aspect-video` or large square image (matching the primary song's `aspect-square max-w-md` style but slightly smaller, e.g. `max-w-sm`)
- **Prominent heading**: Move the genre emoji + title below the image, larger font (`text-2xl md:text-3xl font-bold`), centered like the primary song info
- **Personalized copy**: Keep the existing genre-aware description but style it more prominently (larger text, not `text-sm`)
- **Full-size player**: Match the primary player layout — slider on top, play button centered below (same `w-16 h-16 rounded-full` sizing already in place), volume controls on desktop
- **Unlock CTA**: Make the button full-width and more prominent with a subtle background highlight
- **Visual separator**: Add a decorative divider or section header above the bonus section (e.g. "✨ We made something extra for you" as a centered label)

### Part 2: Add Bonus Play + Checkout Click Tracking

Currently there is NO tracking for bonus track plays or checkout clicks. We need two new columns on the `orders` table and tracking calls from the frontend.

**Database migration** — add 4 columns to `orders`:
```sql
ALTER TABLE orders ADD COLUMN IF NOT EXISTS bonus_play_count integer DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS bonus_first_played_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS bonus_checkout_clicked_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS bonus_checkout_click_count integer DEFAULT 0;
```

**File: `supabase/functions/track-song-engagement/index.ts`**

Extend the `TrackRequest` interface to support two new actions: `bonus_play` and `bonus_checkout_click`. For `bonus_play`: increment `bonus_play_count`, set `bonus_first_played_at` on first play. For `bonus_checkout_click`: increment `bonus_checkout_click_count`, set `bonus_checkout_clicked_at` on first click.

Add these to the existing `type === "order"` handler alongside the current `play`/`download`/`error` actions.

**File: `src/pages/SongPlayer.tsx`**

- In `toggleBonusPlay`: fire a `bonus_play` tracking call (fire-and-forget, same pattern as primary play tracking)
- In the unlock button's `onClick`: fire a `bonus_checkout_click` tracking call before initiating checkout

### Part 3: Admin Bonus Engagement Dashboard

**File: `src/components/admin/BonusTrackAnalytics.tsx`**

Add two new metrics to the existing analytics panel:
- **Previews Played**: count of orders where `bonus_play_count > 0` (with total play count sum)
- **Checkout Clicks**: count of orders where `bonus_checkout_click_count > 0`
- **Preview → Click Rate**: percentage of people who played the preview and then clicked to buy
- **Click → Purchase Rate**: percentage of people who clicked checkout and actually unlocked

These use the same `orders` array already passed as props — just filter on the new columns.

### Files Modified

| File | Change |
|------|--------|
| `src/pages/SongPlayer.tsx` | Redesign bonus section layout; add tracking calls |
| `supabase/functions/track-song-engagement/index.ts` | Add `bonus_play` and `bonus_checkout_click` actions |
| `src/components/admin/BonusTrackAnalytics.tsx` | Add engagement funnel metrics |
| SQL migration | Add 4 tracking columns to `orders` table |

