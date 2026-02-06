

# Fix False-Positive "Needs Review" Orders and Prevent Recurrence

## Problem

16 paid orders (created Feb 4) are stuck in `needs_review` and NOT being delivered. The songs are generated and ready, but the automated delivery system thinks the inputs changed after generation. This is a **false positive** caused by the hash formula gaining new fields (`recipient_name_pronunciation`, `lyrics_language_code`) after these orders were created with the old formula.

15 of these customers have not received their songs and are overdue.

## Fix (Two Parts)

### Part 1: Unblock the 16 stuck orders (immediate)

Write a SQL migration that:
1. Recomputes the `inputs_hash` for all 16 affected orders using the current 8-field formula
2. Resets `delivery_status` from `needs_review` back to `pending`
3. Clears `delivery_last_error`

This will allow the next cron run (within 1 minute) to pick them up and deliver the songs.

**Migration SQL (using a PL/pgSQL block)**:

For each order where `delivery_status = 'needs_review'` and `delivery_last_error = 'Inputs changed after generation'` and `dismissed_at IS NULL`:
- Compute the SHA-256 hash of the same 8 fields (pipe-delimited, trimmed) that `process-scheduled-deliveries` uses
- Update `inputs_hash` to the new value
- Set `delivery_status = 'pending'`
- Clear `delivery_last_error`

### Part 2: Prevent recurrence

Update `process-scheduled-deliveries` to handle the case where `inputs_hash` is stale gracefully. Specifically: if the hash doesn't match but the order has `automation_status = 'completed'` and was never manually edited (`automation_manual_override_at IS NULL`), recompute and store the new hash instead of blocking delivery. This ensures future field additions to the hash formula don't cause false positives.

The logic change in `process-scheduled-deliveries/index.ts` (around lines 238-260):

```text
Current behavior:
  if hash mismatch -> mark needs_review, skip delivery

New behavior:
  if hash mismatch:
    if manual_override_at is set -> mark needs_review (real admin edit, keep safety)
    else -> recompute + update hash, proceed with delivery (likely formula change)
```

This preserves the safety net for genuine input changes (admin edits) while being resilient to hash formula evolution.

## File Changes

| File | Action | Description |
|------|--------|-------------|
| Database migration | CREATE | Recompute hashes and unblock 16 orders |
| `supabase/functions/process-scheduled-deliveries/index.ts` | EDIT | Make hash check tolerant of formula changes (only block if manual override detected) |

## What Happens After the Fix

- The 15 unsent orders will have `delivery_status = 'pending'`
- The next cron run (within 60 seconds) will pick them up and send the delivery emails
- Customers will receive their songs
- Future hash formula changes will not cause false positives

