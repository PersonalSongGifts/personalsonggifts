

## Plan: Stop hard-deleting songs, add restore + multi-version history

### Problem
CS clicked "delete song" on order A5ACDCDF during a chargeback. The mp3 was hard-deleted from storage. Customer dropped the chargeback but we can't restore the original — we never kept a copy.

Current backup pattern (`prev_song_url`) is single-slot and only populated by regenerations, not by manual deletes. CS deletion bypasses it entirely.

### Fix (two parts)

**Part 1 — Restore this customer now**
Click **"Regenerate with Current Lyrics"** on order A5ACDCDF. Same lyrics, fresh song, link works again in ~5 min. Only viable option since the original mp3 is gone.

**Part 2 — Never lose a song again**

**A. Replace hard-delete with soft-disable**
- Find the existing CS/admin "delete song" UI and the backend action it calls.
- Replace with **"Disable song access"**: clears `song_url` but keeps the storage object intact. Customer's `/song/{id}` page shows "temporarily unavailable" instead of generic Not Found.
- Add **"Restore song access"** button that puts `song_url` back.

**B. Multi-version history table** (new)
New table `song_versions`:
- `id`, `order_id`, `song_url`, `automation_lyrics`, `cover_image_url`, `song_title`, `created_at`, `replaced_at`, `reason` (regeneration / revision / manual_disable / cs_action)

Every time a song changes (regenerate, revision, disable, manual edit), snapshot the prior version into `song_versions` BEFORE overwriting. Storage objects in the `songs` bucket are never deleted by app code — only soft-replaced in the DB.

**C. Admin "Song History" panel** on the order detail dialog
- Lists all prior versions for the order with timestamps + reason
- Each row has a **"Restore this version"** button that copies that version's `song_url` / lyrics / cover back into the live order columns
- Existing single-slot `prev_song_url` keeps working for the one-click "undo last regen" case; new table is the durable archive

**D. Storage protection**
- Audit codepaths that call `supabase.storage.from('songs').remove(...)` and remove or gate them behind a "permanent purge" admin-only action with explicit confirmation
- Default: no app code deletes from the `songs` bucket, ever

### Files to touch
- New migration: `song_versions` table + RLS (no public access, service role only)
- New edge function or extend `admin-orders`: `disable_song`, `restore_song`, `restore_version`, snapshot helper
- Hook snapshot helper into: regeneration flow, revision flow, manual lyrics edits, the new disable action
- Admin UI: replace delete button with disable/restore pair, add Song History panel in order detail dialog
- Audit + remove storage `.remove()` calls from the `songs` bucket

### What I need from you
1. Confirm: regenerate A5ACDCDF with current lyrics now to get the customer working again? (yes/no)
2. Confirm: build Parts A–D above as one batch? (yes/no)

