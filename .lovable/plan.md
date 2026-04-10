

## Fix: Bonus Track Stuck at "Generating" When Primary Fails

### What's Happening

Customer Riman has two orders (EEDF2E72, B09F3424) where:
- Primary song generation failed after 3 retries → `permanently_failed`
- Bonus track was fired in parallel and is stuck at `audio_generating` forever
- The admin UI shows "Bonus Generating..." with no resolution

The root cause: when the primary song is marked `permanently_failed` (in `automation-trigger` or the stuck-order recovery in `process-scheduled-deliveries`), **nobody resets the bonus columns**. The bonus callback may never arrive (if the primary API call failed before or during the bonus call), leaving it stuck.

### Fix

**1. Reset bonus on permanent failure** — In two locations where `permanently_failed` is set:

| File | Location |
|------|----------|
| `supabase/functions/automation-trigger/index.ts` | ~line 157, max retries block |
| `supabase/functions/process-scheduled-deliveries/index.ts` | ~lines 230 and 261, stuck recovery blocks |

When marking an order as `permanently_failed`, also set:
```
bonus_automation_status → "failed"
bonus_automation_last_error → "Primary song generation permanently failed"
```

This stops the admin UI from showing "Bonus Generating..." on dead orders.

**2. Also handle it in the callback failure path** — In `automation-suno-callback/index.ts`, when the primary callback reports a failure (error status from Suno), check if bonus is `audio_generating` and fail it too, since there's no point in a bonus without a primary song.

### Files Modified

| File | Change |
|------|--------|
| `supabase/functions/automation-trigger/index.ts` | Add bonus fail when primary hits permanent failure |
| `supabase/functions/process-scheduled-deliveries/index.ts` | Add bonus fail in stuck-order recovery |

No database migration needed. The "AI Generate" retry button already clears bonus columns (from our recent fix), so retrying these orders will work correctly after this fix.

