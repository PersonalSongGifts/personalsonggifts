
# Fix Admin Dashboard: Readability, Revenue Today, and Song Play Tracking Bug

## Problems Found

1. **Stats cards still too small and truncated** -- titles like "Total R...", "Previe...", "Recov..." are cut off because the grid is too dense
2. **Revenue Today not visible** -- code exists but may not have deployed; needs to be prominently placed
3. **Songs Played showing 0 is a real bug** -- the song player page receives a short 8-character order ID from the URL (e.g., `027e8965`), but the tracking function tries to match it as a full UUID (`027e8965-042f-4817-bfc0-ba388d7f3c55`). The query `.eq("id", orderId)` returns nothing, so plays are never recorded. Lead tracking works fine because it uses preview tokens, not UUIDs.
4. **"Conversion Rate by Source" chart is unclear** -- needs a subtitle explaining what it measures

## Changes

### 1. Fix Stats Cards Layout (StatsCards.tsx)

- Reduce max columns from 5 to **4 per row** on large screens (`lg:grid-cols-4`) and **2 on medium** (`sm:grid-cols-2`)
- Increase card padding for breathing room
- Make section headers slightly more prominent
- Ensure "Revenue Today" card is the **first card** in the Revenue section so it's immediately visible with today's dollar amount and order count

### 2. Fix Song Play Tracking Bug (track-song-engagement edge function)

The root cause: emails link to `/song/027e8965` (first 8 chars of UUID). The SongPlayer page passes this short ID directly to the tracking function, which does:
```
.eq("id", orderId)  // fails -- "027e8965" != full UUID
```

**Fix:** Add short-ID resolution logic (same pattern already used in `get-song-page`):
- If orderId is 8 characters, query all orders and filter by UUID prefix match
- If orderId is a full UUID, use direct `.eq()` lookup
- This matches how `get-song-page` already handles it successfully

### 3. Clarify "Conversion Rate by Source" (SourceAnalytics.tsx)

- Add a subtitle under the chart title: "Percentage of leads from each source that resulted in a purchase"
- This makes it clear that 35% YouTube means 35% of YouTube leads became paying customers

## Technical Details

**Files to modify:**
- `src/components/admin/StatsCards.tsx` -- layout and card sizing
- `supabase/functions/track-song-engagement/index.ts` -- fix short ID resolution for order plays/downloads
- `src/components/admin/SourceAnalytics.tsx` -- add explanatory subtitle

**No database changes needed.** The tracking columns (`song_played_at`, `song_play_count`) already exist and work -- the data just was never being written due to the ID mismatch bug. Once fixed, new plays will start tracking immediately. Historical plays cannot be recovered.
