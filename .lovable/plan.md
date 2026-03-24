

## Fix cs-agent-actions UUID Bug + revisions_remaining Accuracy

### Issue 1: cs-agent-actions broken UUID matching
**`supabase/functions/cs-agent-actions/index.ts`** — Replace the `findOrder` helper (line 49-57) to use the `find_orders_by_short_id` RPC instead of `.ilike("id::text", ...)`, matching the pattern already working in cs-agent-lookup.

### Issue 2: Stale revisions_remaining in pre-delivery response
**`supabase/functions/submit-revision/index.ts`** — Fix the `revisions_remaining` calculation (line 538-540) to account for the just-incremented count for both pre- and post-delivery paths. Use a consistent formula:

```typescript
const newCount = (order.revision_count || 0) + (isEditingPending ? 0 : 1);
revisions_remaining: Math.max(0, (order.max_revisions || 1) - newCount)
```

### Summary
Two files, two small fixes. No other issues found — the revision system, auto-approve flow, customer-facing pages, email notifications, and cs-agent-lookup are all functioning correctly.

