

## Fix: Force redeployment of admin-orders edge function

### Problem
The `admin-orders` edge function has the `list_pending_revisions` handler in the source code (line 2464), but the deployed version doesn't include it. Edge function logs only show `"action":"list"` calls — zero `list_pending_revisions` calls appear. The previous attempt to fix this (adding a console.log) may not have triggered a full redeployment.

### Solution
Make a visible code change to the edge function file to force a fresh deployment. I'll add a version comment at the top of the file — this is a reliable way to ensure the deployment system picks up the change.

### Steps
1. Add a version/build timestamp comment at the top of `supabase/functions/admin-orders/index.ts` (e.g., `// Build: 2026-02-27 force-redeploy`) to guarantee the file is detected as changed
2. This will trigger automatic redeployment of the edge function with all the latest code including `list_pending_revisions` and `review_revision` handlers

### What to verify after
- Go to Admin > CS Assistant tab
- The "Pending Revisions" section should show "No pending revision requests" instead of the error
- Once a customer submits a revision request, it should appear in this queue

