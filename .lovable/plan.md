

# Fix: Add backup step to "Reset + Regenerate" action

## Problem
The "Reset + Regenerate" button in the admin panel wipes the current song (`song_url = null`) without first creating a backup to `prev_song_url`. This means the "Restore Previous Version" button never appears, and the old song is permanently lost.

The "Regenerate New Song" and "Regenerate with Current Lyrics" actions correctly call `backupSongFile` before proceeding, but "Reset + Regenerate" (`reset_automation` with `clearAssets=true`) skips this step entirely.

Order 3BFF4B4A was likely affected by this gap — a revision was approved and regenerated, but no backup was created.

## Fix

**File: `supabase/functions/admin-orders/index.ts`**

In the `reset_automation` handler (around line 2717), when `clearAssets=true` and a `song_url` currently exists:
1. Call the existing `backupSongFile()` helper to snapshot the current song to the `-prev` storage slot
2. Save `prev_song_url`, `prev_automation_lyrics`, and `prev_cover_image_url` to the database before clearing the main fields
3. Log a `song_backup_created` activity entry

This is a ~15-line addition using the already-existing `backupSongFile` function — no new logic needed, just wiring it into the reset path.

## For order 3BFF4B4A specifically
Unfortunately the previous song file was already overwritten without a backup. If the old MP3 still exists in storage under a different name or version, we could recover it, but based on the data (`prev_song_url = NULL`), recovery is not possible for this specific order. Going forward, this fix will prevent the same situation from recurring.

