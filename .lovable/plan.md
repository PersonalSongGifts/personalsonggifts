

## Fix: "Failed to load revisions" error on CS Assistant tab

### Problem
The Pending Revisions component calls the `admin-orders` edge function with `action: "list_pending_revisions"`, but the deployed version of the function doesn't include this action handler yet. The function code was added to the file but the edge function needs to be redeployed.

Evidence:
- Edge function logs show many `"action":"list"` calls succeeding, but zero `list_pending_revisions` calls logged
- The function responds to requests (returns 401 for bad passwords), confirming it's running
- The `revision_requests` table exists with the correct schema
- The code for `list_pending_revisions` and `review_revision` actions exists in the source file (lines 2463-2632)

### Fix
Trigger a redeployment of the `admin-orders` edge function. This can be done by making a trivial edit to the file (e.g., adding a log line) which will trigger automatic redeployment.

### Steps
1. Add a console log line inside the `list_pending_revisions` handler for debugging visibility
2. The edge function will auto-redeploy with the complete code including both `list_pending_revisions` and `review_revision` actions

### Technical details
- File: `supabase/functions/admin-orders/index.ts`
- Add `console.log("[ADMIN] Fetching pending revisions");` at line ~2465 for traceability
- No schema changes needed -- the `revision_requests` table and all columns already exist
