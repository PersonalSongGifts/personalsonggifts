

## Fix: Increment revision_count for All New Revision Submissions

### Root Cause
In `supabase/functions/submit-revision/index.ts` (~line 233), `revision_count` is only incremented when the revision is **post-delivery AND not editing a pending revision**:

```typescript
if (!isPreDelivery && !isEditingPending) {
  orderUpdate.revision_count = (order.revision_count || 0) + 1;
}
```

Pre-delivery revisions never increment the counter. That's why order 2DA17D9E (which was classified as pre-delivery) has `revision_count: 0` despite having an approved revision.

### Fix
Change the condition to increment for **all new submissions** (both pre- and post-delivery), only skipping edits to already-pending revisions:

```typescript
if (!isEditingPending) {
  orderUpdate.revision_count = (order.revision_count || 0) + 1;
}
```

### File Changed
- `supabase/functions/submit-revision/index.ts` — one line change at the increment condition

