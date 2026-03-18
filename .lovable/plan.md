

## Fix Plan: Three Admin Issues

### Issue 1: Leads Tab Crashing Browser

**Root Cause:** The `LeadsTable` component renders ALL 16,240+ leads as individual `<Card>` components at once (`filteredLeads.map(...)` at line 1054). No pagination or virtualization exists. Each card has complex JSX with badges, buttons, tooltips — this creates 100,000+ DOM nodes, crashing the browser.

**Fix:** Add client-side pagination to `LeadsTable.tsx`.
- Add `currentPage` state (default 0) and a `PAGE_SIZE` constant (50 leads per page).
- Slice `filteredLeads` to only render the current page: `filteredLeads.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE)`.
- Add pagination controls (Previous/Next buttons, page indicator) below the leads list.
- Reset `currentPage` to 0 when filters or search change.

---

### Issue 2: Metrics / Graphs Accuracy Concerns

**Root Cause:** The admin dashboard loads data in pages of 250 records across 65+ parallel requests (2,104 orders, 16,240 leads). Charts and stats render with partial data during loading, making them appear wrong until all pages finish. The `lyrics_unlocked_at` and `lyrics_price_cents` fields ARE included in the query — this is a loading timing issue, not a data issue.

**Fix:** 
- In `StatsCards` and chart components, show a loading skeleton or "Loading..." indicator while `loadingMore` is true, so admins know data is still being fetched.
- In `Admin.tsx`, pass the `loadingMore` state to `StatsCards` and chart components so they can display a "data still loading" badge.
- This prevents admins from thinking the metrics are wrong when they're just incomplete.

---

### Issue 3: Auto-Approve Toggle Not Fully Automatic

**Root Cause:** In `supabase/functions/submit-revision/index.ts` (lines 326-329), the auto-approve logic has a "low-risk" gate that BLOCKS approval for revisions with 4+ fields changed or any language/occasion changes. Even with the toggle ON, these "high-risk" revisions still require manual approval.

**Fix:** Remove the low-risk restriction when auto-approve is enabled.
- Change line 329 from:
  `const shouldAutoApprove = autoApproveEnabled && !isHighRisk && fieldsChanged.length > 0;`
  to:
  `const shouldAutoApprove = autoApproveEnabled && fieldsChanged.length > 0;`
- Update the log message and UI description to reflect that ALL revisions (not just low-risk) are auto-approved when toggled on.
- Update the `PendingRevisions.tsx` description from "Low-risk revisions are approved automatically" to "All revisions are approved automatically".
- Redeploy the `submit-revision` edge function.

### Files Changed
1. `src/components/admin/LeadsTable.tsx` — Add pagination (50 per page)
2. `src/pages/Admin.tsx` — Pass `loadingMore` to stats/chart components
3. `src/components/admin/StatsCards.tsx` — Show "still loading" indicator
4. `src/components/admin/RevenueChart.tsx` / `OrdersChart.tsx` / `StatusChart.tsx` / `GenreChart.tsx` — Show loading state
5. `supabase/functions/submit-revision/index.ts` — Remove high-risk gate from auto-approve
6. `src/components/admin/PendingRevisions.tsx` — Update description text

