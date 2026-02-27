

## Auto-Regenerate on Revision Approval + Auto-Approve Toggle

### What This Does

Three changes to make revision approval a single-click action that automatically regenerates and schedules the song:

1. **When an admin approves a revision with content changes**, the system automatically backs up the current song, clears automation artifacts, and kicks off regeneration -- no second "Approve for Delivery" or "Regenerate" step needed. The send time is automatically set to 12 hours from now (matching your standard delivery window).

2. **An "Auto-Approve" toggle** in the Pending Revisions card header lets admins enable automatic approval of low-risk revisions. When on, the `submit-revision` function checks if the revision is low-risk (no language/occasion change, fewer than 4 fields changed) and auto-approves + regenerates immediately. High-risk changes always go to the manual queue.

3. **Correct scheduled send time** is set automatically: `target_send_at` = 12 hours from now, `earliest_generate_at` = 1 minute from now.

---

### Technical Details

**File 1: `supabase/functions/admin-orders/index.ts`** (lines 2234-2257)

Replace the current `needsRegeneration` block that sets `status: "needs_review"` with the full regeneration flow:

- Fetch the full order record (need `song_url`, `automation_lyrics`, `cover_image_url` for backup)
- Call `backupSongFile()` to preserve current song in `prev_*` slot
- Merge revision field updates with regeneration clears:
  - Null out: `automation_status`, `automation_task_id`, `automation_lyrics`, `automation_started_at`, `automation_retry_count` (0), `automation_last_error`, `automation_raw_callback`, `automation_style_id`, `automation_audio_url_source`, `generated_at`, `inputs_hash`, `next_attempt_at`, `automation_manual_override_at`, `lyrics_language_qa`, `lyrics_raw_attempt_1`, `lyrics_raw_attempt_2`
  - Null out: `song_url`, `song_title`, `cover_image_url`
  - Set: `delivery_status: "pending"`, `sent_at: null`, `unplayed_resend_sent_at: null`
  - Set: `earliest_generate_at` = 1 min from now, `target_send_at` = 12 hours from now
  - Keep order `status` as-is (don't change to "needs_review")
- Fire `automation-trigger` with `{ orderId, forceRun: true }`
- Log activity as `revision_approved_regenerating`

When `needsRegeneration` is false (e.g. only `delivery_email` changed): keep current behavior, just update fields.

**File 2: `supabase/functions/admin-orders/index.ts`** -- new action `set_revision_auto_approve`

Add a handler that upserts the `revision_auto_approve_enabled` key in `admin_settings`.

Also modify `list_pending_revisions` to return the current auto-approve setting value.

**File 3: `supabase/functions/submit-revision/index.ts`**

After inserting the revision request, check `revision_auto_approve_enabled` from `admin_settings`. If enabled and revision is low-risk (no language change, no occasion change, fewer than 4 fields changed), automatically:
- Set revision status to "approved"
- Apply field updates to the order
- Trigger regeneration (same backup + clear + trigger flow)
- Log as `revision_auto_approved`

High-risk revisions always go to manual queue regardless of toggle.

**File 4: `src/components/admin/PendingRevisions.tsx`**

- Add a `Switch` toggle in the card header: "Auto-Approve"
- Fetch auto-approve setting from `list_pending_revisions` response
- When toggled, call `set_revision_auto_approve` action
- When ON, show small info text: "Low-risk revisions are approved automatically"

---

### Files Modified

| File | Changes |
|------|---------|
| `supabase/functions/admin-orders/index.ts` | Auto-regenerate on approve; new `set_revision_auto_approve` action; return setting in `list_pending_revisions` |
| `supabase/functions/submit-revision/index.ts` | Check auto-approve setting; auto-approve + regenerate low-risk revisions |
| `src/components/admin/PendingRevisions.tsx` | Add Switch toggle for auto-approve with persistence |

