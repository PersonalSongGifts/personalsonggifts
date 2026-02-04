
# Fix "Scheduled" Orders Missing Auto-Send Times

## The Problem

You're seeing many orders with the "scheduled" badge, but when you filter by "Auto-Scheduled," only a few appear. This is because:

1. **40 orders** have `delivery_status = "scheduled"` (the green badge you see)
2. But **only 5 of those** actually have a `target_send_at` timestamp saved
3. The other **35 orders** are missing this timestamp, so the automation system doesn't know when to send them

These 35 orders are essentially stuck - they show "scheduled" but **will never auto-send** because the system doesn't have a send time.

## Why This Happened

The automatic timing fields (`earliest_generate_at`, `target_send_at`) were added in a recent update. Orders created before that update, or orders where the Stripe webhook didn't complete properly, don't have these fields populated.

## The Fix (Two Parts)

### Part 1: Backfill Existing Orders

Run a database update to calculate and set `target_send_at` for all orders that:
- Have `automation_status = 'completed'`
- Are missing `target_send_at`
- Haven't been sent yet (`sent_at IS NULL`)
- Aren't cancelled or dismissed

The timing will be:
- **12 hours before expected delivery** (standard approach)
- If that time has already passed, schedule for **30 minutes from now**

### Part 2: Fix the Fallback Payment Processor

Update the `process-payment` edge function to also set timing fields. Currently only `stripe-webhook` sets them. This ensures orders created via the polling fallback (when webhooks are delayed) also get proper timing.

---

## Technical Details

### Database Backfill Query

This will be run via the insert tool (data operation, not schema change):

```sql
UPDATE orders
SET 
  earliest_generate_at = COALESCE(earliest_generate_at, created_at + INTERVAL '5 minutes'),
  target_send_at = CASE
    WHEN expected_delivery - INTERVAL '12 hours' > NOW() 
    THEN expected_delivery - INTERVAL '12 hours'
    ELSE NOW() + INTERVAL '30 minutes'
  END,
  delivery_status = COALESCE(delivery_status, 'pending')
WHERE 
  automation_status = 'completed'
  AND target_send_at IS NULL
  AND sent_at IS NULL
  AND dismissed_at IS NULL
  AND status <> 'cancelled';
```

### Edge Function Update

**File:** `supabase/functions/process-payment/index.ts`

Add the same timing calculation that `stripe-webhook` uses:

```typescript
// Compute timing fields for background automation
const timing = computeOrderTiming(expectedDelivery);
const inputsHash = await computeInputsHash([...]);

// Include in insert:
earliest_generate_at: timing.earliestGenerateAt,
target_send_at: timing.targetSendAt,
inputs_hash: inputsHash,
delivery_status: "pending",
```

---

## Expected Results

After this fix:

| Before | After |
|--------|-------|
| 40 orders show "scheduled" badge | Same |
| Only 5 appear in Auto-Scheduled filter | All 40 appear |
| 35 orders will never auto-send | All orders have send times |
| Cron job skips orders missing `target_send_at` | Cron job processes all scheduled orders |

---

## Files to Modify

| File | Change |
|------|--------|
| Database (via insert tool) | Backfill `target_send_at` for 35 existing orders |
| `supabase/functions/process-payment/index.ts` | Add timing field computation for future orders |
