

## Surface Revision Status in CS Assistant Lookup

### Problem
When a customer emails CS about a revision, the agent has no quick way to see whether a revision request already exists, its status, or when the revised song will be delivered — they'd have to scroll up to the separate Pending Revisions queue and search manually.

### Solution
Add a **revision status section** to each order card in the CS Assistant lookup results. The data is already returned by the `cs_lookup` endpoint — it just needs to be displayed.

### What CS agents will see

For each order card in the lookup results, a new section appears (when relevant):

```text
┌─ Order 2DA17D9E ─ delivered ─────────────────────┐
│  Occasion: birthday · Recipient: Sarah · ...     │
│  Song: ♫ Listen                                   │
│  ─────────────────────────────────────────────── │
│  📝 Revision: pending (submitted Apr 5)           │
│     Changed: special_qualities, favorite_memory   │
│     Revisions used: 1/1                           │
│     Revised song ETA: ~12h after approval         │
│                                                   │
│  [View Revision Details ↗]                        │
└───────────────────────────────────────────────────┘
```

- **No revision activity**: nothing shown (clean)
- **Pending revision**: yellow badge, fields changed, submission date
- **Approved/in-progress**: purple badge, automation status, ETA
- **Completed & delivered**: green badge, delivered date
- **Rejected**: red badge with reason

### Changes

**`src/components/admin/CSAssistant.tsx`**
1. After the existing delivery status line in each order card, add a conditional revision block:
   - Show revision badge (pending/approved/rejected) using `revision_status`
   - Show `revision_count` / `max_revisions` (e.g. "1/1 revisions used")
   - Show `revision_requested_at` timestamp
   - If `pending_revision` is true, show "⏳ Awaiting admin review"
   - If revision is approved and `automation_status` is active, show generation progress
   - If `resend_scheduled_at` is set, show the scheduled delivery time for the revised song
2. Add a "View Revision Details" button that expands to show the actual revision request content (fields changed, old vs new values) — fetch from `revision_requests` table via the existing `admin-orders` endpoint
3. No backend changes needed — all required fields (`revision_count`, `max_revisions`, `pending_revision`, `revision_status`, `revision_requested_at`, `resend_scheduled_at`, `automation_status`) are already returned by `cs_lookup`

**Fetching revision request details (on-demand)**
- When agent clicks "View Revision Details", call `admin-orders` with `action: "list_pending_revisions"` or query `revision_requests` filtered by `order_id`
- Display the same field diff view (Was/Now) already used in `PendingRevisions` component
- Reuse the `renderChangedField` pattern from `PendingRevisions.tsx`

### Files
| File | Change |
|------|--------|
| `src/components/admin/CSAssistant.tsx` | Add revision status section to order cards with badge, counts, timestamps, and expandable detail view |

