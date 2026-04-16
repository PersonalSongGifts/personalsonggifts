
## Plan: Auto-recover stuck `needs_review` orders + verify admin reset path

### What the user is asking
1. The "Reset + Regenerate" action they expected isn't visible in the admin UI for this order — only "Reset Automation" appears (per screenshot).
2. Going forward, orders that land in `needs_review` due to short-song issues should **auto-recover** without waiting for admin intervention.

### Investigation needed first
- Confirm what the "Reset Automation" button in the screenshot actually does today (does it call `reset_automation` with `clearAssets=true`, or just clear status?). I'll inspect `LeadFollowupPanel` / order detail dialog and `admin-orders` to see if the "Reset + Regenerate" path is wired into a button.
- Confirm the legacy error string `"May need lyrics extension and regeneration"` is gone from the current code so a new auto-recovery loop won't fight live logic.

### Plan

**Part A — Make admin reset do the right thing in one click**
- Audit the admin UI: if there's only a "Reset Automation" button and no "Reset + Regenerate", wire the existing button to call `reset_automation` with `clearAssets=true` AND immediately call `automation-trigger` after. Or rename/clarify so the admin has a single, obvious recovery button.
- This gives admins a working manual escape hatch (which today they don't have for this order).

**Part B — Auto-recover stuck orders (the real fix)**
- Add a watchdog branch to `process-scheduled-deliveries` (already a cron) that finds:
  - `automation_status = 'needs_review'`
  - AND `automation_last_error ILIKE '%lyrics extension%'` OR `short_retry_count < MAX_SHORT_RETRIES`
  - AND `dismissed_at IS NULL` AND `status != 'cancelled'`
  - AND `automation_started_at < now() - interval '1 hour'` (let real review cases breathe briefly)
- For each match: clear `automation_lyrics`, reset `automation_status='pending'`, reset `short_retry_count=0`, log activity `auto_recovered_from_needs_review`, then call `automation-trigger` with `forceRun=true`.
- Cap auto-recoveries at 1 per order via a new `auto_recovery_count` column (or reuse `automation_retry_count`) so we don't loop forever. After 1 auto-recovery attempt, leave it for human review.

**Part C — Backfill existing stuck orders**
- One-shot SQL migration: same criteria as the watchdog, applied once to clear the backlog (including order 5564954F).
- After backfill, the cron picks up anything new that lands here.

**Part D — Invariant guard**
- In `automation-suno-callback`, add an assert before writing `needs_review`: `short_retry_count >= MAX_SHORT_RETRIES`. If not, log a loud warning and force the retry path instead. Prevents the original bug shape from regressing.

### Files

| File | Change |
|---|---|
| `src/components/admin/*` (order detail dialog) | Wire "Reset + Regenerate" button if missing; or make existing reset button trigger full pipeline |
| `supabase/functions/process-scheduled-deliveries/index.ts` | Add `needs_review` auto-recovery watchdog branch |
| `supabase/functions/automation-suno-callback/index.ts` | Invariant guard before writing `needs_review` |
| `supabase/migrations/<new>.sql` | Add `auto_recovery_count` column; backfill stuck orders |
| (direct DB action) | Reset & re-trigger 5564954F as part of backfill |

### Memory updates
Extend `mem://features/automation/short-song-quality-retries` with the auto-recovery watchdog + invariant guard. Update `mem://features/admin/resend-vs-regenerate-workflow` if the admin button behavior changes.
