## Why some orders don't show "Restore Previous Version"

The button only renders when `order.prev_song_url` is set. That field gets populated **only** when the regeneration code path explicitly takes a snapshot of the current song before clearing it.

For order `5D2FA820` (Linda / Jorge) the activity log shows two auto-approved revisions handled by `submit-revision` (the customer-facing self-service flow). That code path clears `song_url`, `cover_image_url`, `automation_lyrics`, etc. for regeneration **but never copies them to the `prev_*` slots and never backs up the audio file to the `-prev.mp3` storage slot**. The admin-side `approve-revision` in `admin-orders` *does* call `backupSongFile`, which is why admin-approved revisions consistently show the Restore button while customer auto-approved ones don't.

A second contributor: if the very first revision happens before the initial generation finishes (current `song_url` is null), there's nothing to back up — that's expected and unfixable.

## Fix

### 1. Snapshot in `submit-revision` auto-approve (orders branch)

In `supabase/functions/submit-revision/index.ts`, in the `needsRegen` block around lines 416–446, before nulling `song_url`/`cover_image_url`/`automation_lyrics`:

- Call a `backupSongFile`-equivalent that copies the current `songs/<path>.mp3` to `songs/<path>-prev.mp3` and returns the public URL of that `-prev` file.
- On success, set on the same `autoOrderUpdate`:
  - `prev_song_url = <public URL of -prev file>` (or fallback to current URL if it's outside our bucket)
  - `prev_automation_lyrics = order.automation_lyrics`
  - `prev_cover_image_url = order.cover_image_url`
- If current `song_url` is null (revision before first generation), skip silently — nothing to back up.
- If the copy fails, log it but **do not block** the revision — proceed without snapshot (matches existing failure tolerance for customer-facing flows).

Implementation choice: extract a shared helper into `supabase/functions/_shared/song-backup.ts` and call it from both `admin-orders/approve-revision` and `submit-revision/auto-approve` so the two paths can't drift again.

### 2. Backfill (best effort, no risk to real songs)

Most overwritten originals are gone — Suno uploads usually reuse the same `songs/<order_id>.mp3` path, so the pre-revision audio bytes for already-revised orders are not recoverable from storage. We won't fabricate a snapshot.

What we *can* safely backfill:
- For orders with `revision_count >= 1`, `prev_song_url IS NULL`, `song_url IS NOT NULL`, and a `-prev.mp3` file that **already exists** in storage (e.g. earlier admin-side approvals where the row was later cleared), repoint `prev_song_url` to that existing `-prev.mp3` URL. This restores the button for those without touching any audio.
- For all other affected orders, leave them alone. The current song stays exactly as is.

Implementation: a one-shot SQL+storage script (or small admin function) that:
1. Selects candidate orders.
2. For each, checks `storage.objects` for `songs/<basename>-prev.mp3`.
3. If present, updates `prev_song_url` to the public URL.

No `song_url`, `automation_lyrics`, or `cover_image_url` columns are touched. No files are deleted, copied, or renamed. Original real songs are untouched.

### 3. Verify

After deploying:
- Submit a self-service revision on a test order with a generated song → confirm `prev_song_url` populates and Restore button appears in admin.
- Run the backfill in dry-run mode first (log candidates + which have `-prev.mp3` in storage) before applying updates.
- Spot-check 2–3 backfilled orders in admin UI.

## Files to change

- `supabase/functions/_shared/song-backup.ts` (new — extracted helper)
- `supabase/functions/admin-orders/index.ts` (use shared helper)
- `supabase/functions/submit-revision/index.ts` (call helper in auto-approve orders branch)
- One-shot backfill (edge function or script) — non-destructive
