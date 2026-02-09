
# Fix Stuck Orders + Add Comprehensive Stuck Detection and Auto-Recovery

## Immediate Data Fixes

Two items are currently stuck in `lyrics_generating` with no song and no error:

1. **Order `1ebb67f9`** (Billy to Wendy) -- stuck 5.7 hours, paid $49.99, delivery expected Feb 11
2. **Lead `5c6bf4fc`** (Justin to Fabiola) -- stuck 3 days

Both need `automation_status` reset to `null` and `automation_started_at` cleared so the cron can re-pick them for generation.

## Root Cause

The entire recovery system (cron + alerts + UI) only watches for `audio_generating` stuck jobs. Items stuck in `lyrics_generating`, `pending`, or `queued` are completely invisible. This is a systemic blind spot.

## Plan

### 1. Database fix for the 2 stuck items

Reset both to a clean state so the automation cron picks them up on the next run:

```sql
UPDATE orders SET automation_status = NULL, automation_started_at = NULL, automation_retry_count = 0
WHERE id = '1ebb67f9-78b0-4b05-9fd6-412afd49342d';

UPDATE leads SET automation_status = NULL, automation_started_at = NULL, automation_retry_count = 0
WHERE id = '5c6bf4fc-c969-4b49-a733-f7ec45137768';
```

### 2. Backend: Expand cron recovery to ALL active statuses (`process-scheduled-deliveries`)

Currently the stuck recovery section (line 34-87) only handles `audio_generating`. Add a new recovery block that catches **any** item stuck in `lyrics_generating`, `pending`, or `queued` for more than 15 minutes with no `automation_task_id` (meaning lyrics never started or silently failed):

- Reset `automation_status` to `null` so the cron re-queues them
- Increment `automation_retry_count`
- Log the recovery
- Respect `MAX_AUTO_RETRIES` -- mark as `permanently_failed` if exceeded

### 3. Backend: Expand alerts to cover ALL stuck statuses (`admin-orders`)

Update the `get_alerts_summary` handler (line 1737) to:

- Add a new alert category: `stuckLyricsOrders` and `stuckLyricsLeads` for items stuck in `lyrics_generating` > 15 min
- Also detect `pending`/`queued` items stuck > 15 min as `stuckPendingOrders`/`stuckPendingLeads`
- Simplify by merging all stuck categories into a single `stuckOrders`/`stuckLeads` count that checks ALL active statuses, not just `audio_generating`

### 4. Frontend: Expand `isJobStuck` detection and add auto-fix button (`AutomationDashboard.tsx`)

- Update `isJobStuck` (line 404) to detect stuck jobs in ANY active status (`lyrics_generating`, `pending`, `queued`) not just `audio_generating`
- Use a 15-minute threshold for lyrics/pending (vs 5 min for audio)
- Add "Auto-Fix All Stuck" button in the alert banner that calls a new `unstick_all` admin action
- The alert banner already exists (line 538) -- enhance the line items to show stuck lyrics/pending counts

### 5. Backend: Add `unstick_all` admin action (`admin-orders`)

New action that:
- Finds all orders/leads in any active status for > 15 minutes
- Resets them to `automation_status = null` for automatic re-pickup
- Returns count of items fixed
- Respects `MAX_AUTO_RETRIES` to avoid infinite loops

## Technical Details

### Files modified:
- `supabase/functions/process-scheduled-deliveries/index.ts` -- add lyrics/pending stuck recovery
- `supabase/functions/admin-orders/index.ts` -- expand alerts + add `unstick_all` action
- `src/components/admin/AutomationDashboard.tsx` -- expand `isJobStuck`, add fix button

### Safety guardrails:
- All resets increment `automation_retry_count` to prevent infinite retry loops
- Items exceeding `MAX_AUTO_RETRIES` (3) get marked `permanently_failed`
- `automation_manual_override_at` is respected (won't reset manually managed items)
- Logging includes entity ID and previous status for audit trail
