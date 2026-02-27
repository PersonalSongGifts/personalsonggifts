

## Fix: "Failed to load revisions" in CS Assistant tab

### Root Cause
The `list_pending_revisions` and `review_revision` action handlers in `admin-orders/index.ts` are placed **after** the legacy fallback block (line 2094) which catches any unrecognized action and returns a `400 "Unknown action"` error. Since the legacy fallback runs first, the revision handlers at lines 2467-2636 are **unreachable**.

### Fix
Move both revision handlers (`list_pending_revisions` at line 2467 and `review_revision` at line 2504) to **before** the legacy fallback block (before line 2089). This ensures they're evaluated before the catch-all "Unknown action" response.

### File Changed
- `supabase/functions/admin-orders/index.ts` -- relocate the two revision handler blocks (lines 2466-2636) to just before the legacy fallback section (before line 2089)

### What This Fixes
- CS Assistant tab will load without the "Failed to load revisions" error toast
- Pending Revisions card will correctly show "No pending revision requests" when the queue is empty
- The approve/reject revision flow will also work correctly
