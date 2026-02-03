
# Fix: Manual Automation Trigger Ignoring Quality Threshold

## The Problem

When you manually trigger automation from the Automation dashboard, the system still enforces the quality score threshold. This happens because:

1. The `batch_trigger_automation` action in `admin-orders/index.ts` (line 342) calls `automation-trigger` with just `{ leadId }`
2. The `automation-trigger` function defaults `forceRun` to `false`
3. Without `forceRun: true`, the quality check on lines 77-87 rejects low-quality leads

## The Fix

Pass `forceRun: true` when the trigger comes from the admin dashboard (manual action). This bypasses the quality threshold check for intentional manual triggers.

### File: `supabase/functions/admin-orders/index.ts`

Update the batch_trigger_automation action (line 342):

**Before:**
```typescript
body: JSON.stringify({ leadId }),
```

**After:**
```typescript
body: JSON.stringify({ leadId, forceRun: true }),
```

Also update the retry_automation action to pass `forceRun: true` for consistency.

### File: `supabase/functions/automation-trigger/index.ts`

No changes needed - it already supports `forceRun: true` and bypasses all checks when set.

---

## Behavior After Fix

| Trigger Source | Quality Check | When It Runs |
|----------------|--------------|--------------|
| New lead capture (automatic) | YES - enforces threshold | Only if quality >= threshold |
| Admin dashboard "Generate" button | NO - bypasses threshold | Always runs |
| Admin dashboard "Retry" button | NO - bypasses threshold | Always runs |
| "Run All Eligible" button | NO - bypasses threshold | Always runs |

This gives you full control from the admin panel to manually run automation on any lead, regardless of quality score.
