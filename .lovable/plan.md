

## Auto-trigger regeneration on revision approval

### Problem
When an admin approves a revision in the CS Assistant, the order fields get updated but the status is set to `needs_review`, requiring a second manual step (clicking "Approve for Delivery" or "Regenerate") before anything happens. The user wants approving a revision to automatically kick off song regeneration.

### Solution
After the revision approval updates the order fields, if `needsRegeneration` is true, automatically perform the same regeneration steps that the "Regenerate New Song" action does:

1. Back up the current song to the `prev_*` slot
2. Clear all automation artifacts (status, task ID, lyrics, etc.)
3. Clear the song file fields (`song_url`, `song_title`, `cover_image_url`)
4. Set `delivery_status` to `"pending"` (not `"needs_review"`)
5. Set `earliest_generate_at` to 1 minute from now
6. Set `target_send_at` to 12 hours from now (auto-send default)
7. Reset `sent_at` to null and `unplayed_resend_sent_at` to null
8. Call `automation-trigger` with `{ orderId, forceRun: true }` to immediately start lyrics + audio generation

### What changes

**File: `supabase/functions/admin-orders/index.ts`** (the `review_revision` approve block, ~lines 2234-2257)

Replace the current logic that sets `status: "needs_review"` with the full regeneration flow:

- When `needsRegeneration` is true:
  - Call the existing `backupSongFile()` helper to save current song to prev slot
  - Merge the revision field updates with the regeneration clears (automation_status, automation_task_id, song_url, etc. all set to null)
  - Set `delivery_status: "pending"`, `earliest_generate_at`, `target_send_at`
  - Set `status` to the order's current status (keep it as-is, e.g. "completed") rather than "needs_review"
  - Fire `automation-trigger` with `forceRun: true`
  - Log activity as `revision_approved_regenerating`
- When `needsRegeneration` is false (e.g. only delivery_email changed):
  - Keep current behavior: just update the fields, no regeneration needed

### Result
Approving a revision becomes a single action. The admin clicks "Approve" and the song automatically starts regenerating with the updated inputs. No second step needed.
