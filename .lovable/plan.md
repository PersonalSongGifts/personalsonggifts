

## Fix: Revision Approve Not Working + logActivity Crash

### Problem
When you approve a revision in the CS Assistant tab, two issues prevent it from working properly:

1. **logActivity call crashes** -- The `review_revision` handler calls `logActivity` with an object argument (`logActivity(supabase, { entityId, entityType, ... })`), but the actual function expects **positional arguments** (`logActivity(supabase, entityType, entityId, eventType, actor, details, metadata)`). This causes a database error (`null value in column "entity_id"`) visible in the postgres logs. While the error is caught and doesn't crash the function, it may interfere with the response.

2. **No logging for debugging** -- The review_revision handler has zero `console.log` statements, making it impossible to see what's happening in the backend function logs.

3. **Missing field mappings** -- `style_notes`, `tempo`, and `anything_else` are tracked in revision requests but aren't mapped to order columns, so changes to those fields are silently dropped on approve.

### Fix Plan

**File: `supabase/functions/admin-orders/index.ts`**

1. Fix both `logActivity` calls in the review_revision handler to use positional arguments instead of an object:
   - `logActivity(supabase, "order", rev.order_id, "revision_rejected", "admin", details)` 
   - `logActivity(supabase, "order", rev.order_id, "revision_approved", "admin", details, metadata)`

2. Add `console.log` statements at key points (entry, approve path, reject path) for future debugging.

3. Add missing field mappings for `style_notes` (to `notes`), `tempo`, and `anything_else` (to `notes` or appropriate columns) -- or document that these are intentionally excluded.

### What This Fixes
- The approve action will complete cleanly without the entity_id null constraint violation
- Activity log entries will be properly recorded for approved/rejected revisions
- Backend logs will show revision review actions for future debugging
- Your test order 5BF67D34 should work correctly after this fix

### Note About "Nothing Happened"
When a revision is approved that includes content fields (recipient name, story, genre, etc.), the order status changes to `needs_review` -- meaning it's flagged for song regeneration. You'd then need to trigger regeneration from the admin Orders tab. If only non-content fields changed (like delivery email), the order status stays the same but the field values are updated.
