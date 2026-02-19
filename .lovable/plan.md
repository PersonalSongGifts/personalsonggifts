

## Song Version Restore for Orders and Leads

### Problem Summary

When an admin clicks "Regenerate New Song" or "Regenerate with Current Lyrics", the current song file in storage is silently overwritten and the lyrics are erased with no way to go back. The waterlogged24@verizon.net situation is the perfect example — once regenerated, the previous audio is permanently gone.

### Solution: Single-Slot Backup System

Before any regeneration starts, automatically copy the current song file to a `-prev` slot in storage and snapshot the current lyrics to a backup database column. A "Restore Previous Version" button then appears in the admin panel, letting you swap back with one click.

---

### Potential Problems Analyzed

**1. Storage has no native copy/move operation**
Supabase Storage doesn't have a built-in copy API. To copy `orders/B2E0F292-full.mp3` to `orders/B2E0F292-prev.mp3`, the Edge Function must download the file bytes and re-upload them. For a ~5 MB MP3 this is a safe in-memory operation, but it adds ~2-3 seconds to the regenerate flow. This is acceptable because the backup happens before regeneration starts.

**2. What if the backup download fails?**
If the backup fails (network issue, storage issue), the regeneration should be blocked with an error. It's better to refuse to regenerate than to silently destroy the previous version. The handler will return a clear error: "Could not back up current song — regeneration blocked."

**3. Leads have two files (full + preview), orders have one**
For leads: back up both `leads/[ID]-full.mp3` and `leads/[ID]-preview.wav` to `leads/[ID]-prev-full.mp3` and `leads/[ID]-prev-preview.wav`. On restore, both are restored. The `prev_song_url` in the database will store the full song URL; the preview URL is reconstructed from the same pattern.

**4. What if there's no current song to back up?**
If `song_url` (orders) or `full_song_url` (leads) is null, skip the backup step entirely — no previous version to save, proceed with regeneration normally.

**5. File naming edge cases (AI-generated vs manual uploads use different paths)**
AI-generated songs for orders go to `orders/[SHORTID]-full.mp3`. Manual uploads go to `[SHORTID].mp3` (no `orders/` prefix). The backup handler needs to parse the actual storage path from the current URL, not hardcode the path pattern. It extracts the path from the public URL by stripping the bucket base URL.

**6. Only one previous version is stored (not full history)**
When a second regeneration happens, the existing `-prev` file is overwritten. This is intentional — we keep it simple and only guarantee "undo the last change." The admin UI will make this clear with a tooltip.

**7. Restore must also update the song player page**
When restoring an order, the `song_url` database field must be updated to point to the restored file URL (with a cache-busting `?v=timestamp` suffix). The customer's song player page reads from this field, so it will automatically show the restored version.

**8. What about the cover image?**
Cover art is stored separately and is not affected by regeneration (the regeneration handlers clear `cover_image_url` in the database, but the file stays in storage). On restore, the `cover_image_url` from before the regeneration is also restored from `prev_cover_image_url`.

---

### Files to Change

**1. Database Migration — add backup columns**

New columns on both `orders` and `leads` tables:
- `prev_song_url TEXT` — URL of the song before the last regeneration
- `prev_automation_lyrics TEXT` — lyrics text before the last regeneration  
- `prev_cover_image_url TEXT` — cover art URL before the last regeneration

**2. `supabase/functions/admin-orders/index.ts` — 3 additions**

*Addition A: Backup logic at the top of both `regenerate_song` and `regenerate_with_lyrics` handlers*

Before clearing anything, if a current song file exists:
```
1. Extract the storage path from the current song URL
2. Download the file bytes (fetch the public URL)
3. Re-upload to the -prev slot (upsert: true)
4. Save current song_url, automation_lyrics, cover_image_url into prev_* columns
5. Only then proceed with the existing clear-and-regenerate logic
```

*Addition B: New `restore_previous_version` action handler*

Steps:
1. Fetch the entity, verify `prev_song_url` is not null
2. Extract the `-prev` file path from the `prev_song_url`
3. Download the `-prev` file bytes  
4. Upload those bytes back to the main slot (the original path, upsert: true) with a new cache-busting suffix
5. Update the database: `song_url = new_public_url`, `automation_lyrics = prev_automation_lyrics`, `cover_image_url = prev_cover_image_url`
6. Clear the `prev_*` columns (so "Restore" disappears after use)
7. Log activity: `song_restored`

**3. `src/pages/Admin.tsx` — Orders UI**

- Add `prev_song_url` and `prev_automation_lyrics` to the `Order` interface
- Add `restoringPreviousVersion` state boolean
- Add a "Restore Previous Version" button in the Automation Controls section, conditionally rendered when `selectedOrder.prev_song_url` is set
- Button is styled in green/teal with a `RotateCcw` icon
- Clicking triggers a confirmation AlertDialog: "This will revert to the previous audio and lyrics. Your current version will be lost."
- On confirm, calls `restore_previous_version` action with `orderId`
- On success: updates `selectedOrder` state and calls `fetchOrders()`

**4. `src/components/admin/LeadsTable.tsx` — Leads UI**

- Add `prev_song_url` and `prev_automation_lyrics` to the `Lead` interface
- Add `restoringPreviousVersion` state boolean
- Add the same "Restore Previous Version" button in the Regenerate Song section, conditionally rendered when `selectedLead.prev_song_url` is set
- Same confirmation dialog pattern
- On success: updates `selectedLead` state and calls `onRefresh?.()`

---

### UI Placement

**In Orders (Admin.tsx):** The "Restore Previous Version" button appears inside the existing "Automation Controls" section, next to the Regenerate buttons. It only shows when `prev_song_url` is non-null.

**In Leads (LeadsTable.tsx):** The button appears inside the existing purple "Regenerate Song" card, next to the existing Regenerate buttons. Same conditional display.

---

### What the Button Looks Like

```
[ RotateCcw icon ]  Restore Previous Version
```
- Color: green/teal outline button
- Tooltip: "Revert to the version before the last regeneration. Your current song and lyrics will be replaced."
- After restore: button disappears (prev_song_url is cleared)
- If no backup exists (first-time regeneration): button doesn't show

---

### Activity Log Events

Two new events added to the activity log:
- `song_backup_created` — logged when a backup is made before regeneration
- `song_restored` — logged when admin clicks Restore Previous Version

---

### Summary of Files Changed

| File | Change |
|---|---|
| New migration | Add `prev_song_url`, `prev_automation_lyrics`, `prev_cover_image_url` to `orders` + `leads` |
| `admin-orders/index.ts` | Backup logic in both regen handlers + new `restore_previous_version` handler |
| `src/pages/Admin.tsx` | Interface update + Restore button + confirmation dialog |
| `src/components/admin/LeadsTable.tsx` | Interface update + Restore button + confirmation dialog |

