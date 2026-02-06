

# Fix: Auto-Retry Failed Leads + Unblock 52 Stuck Leads

## Immediate Problem

52 leads are stuck with `automation_status = 'failed'` because they hit a 402 "Not enough credits" error. Credits have been replenished, but the cron never retries failed leads -- it only picks up leads where `automation_status IS NULL`.

## Part 1: Unblock the 52 Stuck Leads (Database Update)

Reset all 52 failed leads back to `automation_status = NULL` so the cron picks them up automatically:

```sql
UPDATE leads
SET automation_status = NULL,
    automation_last_error = NULL,
    automation_started_at = NULL,
    automation_task_id = NULL
WHERE automation_status = 'failed'
  AND automation_last_error LIKE '%402%';
```

This only resets leads that failed due to the credits issue (402 errors), not any that failed for other reasons.

The cron runs every minute and processes up to 9 at a time, so all 52 will be processed within roughly 6 minutes.

## Part 2: Add Auto-Retry Logic to the Cron

In `supabase/functions/process-scheduled-deliveries/index.ts`, add a new section (after the generation queue) that automatically resets `failed` leads for retry, with safeguards:

- Only retry leads that have been in `failed` for at least **10 minutes** (backoff)
- Only retry leads with **3 or fewer** previous retry attempts (prevents infinite loops)
- Reset up to **5 per run** to avoid overwhelming the pipeline
- Reset `automation_status` to `NULL`, clear error fields, and increment `automation_retry_count`
- The existing generation queue will then pick them up naturally on the next cron cycle

```text
+------------------+     +-------------------+     +------------------+
| Lead fails       | --> | Stays in 'failed' | --> | Cron auto-resets  |
| (402 / timeout)  |     | for 10 min        |     | after backoff     |
+------------------+     +-------------------+     +------------------+
                                                          |
                                                          v
                                                   +------------------+
                                                   | Generation queue  |
                                                   | picks it up next  |
                                                   +------------------+
```

This same logic will apply to failed **orders** as well, not just leads.

## File Changes

| File | Change |
|------|--------|
| `supabase/functions/process-scheduled-deliveries/index.ts` | Add auto-retry section (~40 lines) after the generation queue |
| Database | One-time reset of 52 stuck leads |

## Safeguards

- Max 3 retries per lead/order prevents infinite loops
- 10-minute backoff prevents rapid re-failing
- 5-per-run cap prevents flooding the generation queue
- Only resets transient failures; `needs_review` status is never touched
- Manual override still takes priority

