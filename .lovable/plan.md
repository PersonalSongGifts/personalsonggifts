

## Fix Valentine Remarketing Progress Tracking

**Problem:** The progress bar doesn't show meaningful progress because:
1. `dryRunCount` (total eligible leads) is stored only in local component state -- it resets to `null` on every page reload
2. Without `dryRunCount`, the progress calculation returns 0% or falls back incorrectly
3. After running batches, there's no persistent denominator to measure against

**Solution:** Persist the `totalEligible` count in the campaign settings (alongside `total_sent`) so the progress bar always has both numerator and denominator.

### Technical Details

**File 1:** `supabase/functions/send-valentine-remarketing/index.ts`
- When a dry run completes, return `totalEligible` as before (no change needed)
- When a batch send completes, include the current `totalEligible` count in the response

**File 2:** `src/components/admin/ValentineRemarketingPanel.tsx`

1. Add `total_eligible` to the `CampaignSettings` interface (default `0`)
2. In `handleDryRun`, persist the eligible count to settings: call `updateSetting({ total_eligible: data.totalEligible })`
3. Update progress calculation to use `settings.total_eligible` instead of the local `dryRunCount` state
4. Remove the `dryRunCount` local state variable (no longer needed)
5. After each batch run, the `fetchSettings` call already refreshes `total_sent` -- now it will also show the correct denominator from `total_eligible`
6. Show `total_eligible` in the progress label so the user always sees "X sent / Y eligible" even after page reload

This ensures the progress bar works correctly across page reloads and batch runs.

