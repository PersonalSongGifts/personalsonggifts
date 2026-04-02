

## Skip Reaction Video Emails for Memorial Orders

### Problem
Customers who order memorial/tribute songs (for someone who passed away) receive automated "send us a reaction video!" emails, which is insensitive and caused a complaint.

### Solution
Add a simple filter to the reaction email logic in `process-scheduled-deliveries` that skips orders where the occasion is `memorial` or `pet-memorial`. These are the two occasion types where asking for a reaction video is inappropriate.

### Change

**`supabase/functions/process-scheduled-deliveries/index.ts`**

In both Phase A (24h) and Phase B (72h) eligible order queries, add a filter to exclude memorial occasions:

- After fetching eligible orders, filter out any where `occasion` is `memorial` or `pet-memorial`
- This is a simple in-memory filter since the occasion column is already returned in the query
- Add a log line noting how many were skipped for memorial sensitivity

The occasion values `memorial` and `pet-memorial` match exactly what the intake form uses.

### Why this approach
- Minimal change — one filter added in two places
- No database migration needed (occasion is already stored on orders)
- No UI changes needed
- Covers both human and pet memorials
- Future-proof: if more sensitive occasion types are added, they can be added to the exclusion list

### Files
| File | Change |
|------|--------|
| `supabase/functions/process-scheduled-deliveries/index.ts` | Filter out `memorial` and `pet-memorial` occasions from both 24h and 72h reaction email queries |

