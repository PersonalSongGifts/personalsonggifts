

## Add "Stop Automation" Button to Both Leads and Orders

### What It Does

Adds a visible **"Stop Automation"** button directly in the detail dialogs for both **leads** (LeadsTable.tsx) and **orders** (Admin.tsx). One click immediately halts all in-progress automation, preventing any AI-generated content from overwriting a manual upload.

### Backend Change: Extend `cancel_automation` to support orders

The existing `cancel_automation` action in `admin-orders/index.ts` only works on leads. We need to extend it to also accept an `orderId` parameter and update the `orders` table.

**Logic**: If `orderId` is provided, update `orders` table. If `leadId` is provided, update `leads` table (existing behavior). Require exactly one of the two.

### Frontend Changes

**Lead Detail Dialog (`src/components/admin/LeadsTable.tsx`)**:
- Add a red "Stop Automation" button inside the existing Automation Status section (lines 1697-1729)
- Visible when `automation_status` is active (`queued`, `pending`, `lyrics_generating`, `lyrics_ready`, `audio_generating`) AND `automation_manual_override_at` is null
- On click: calls `admin-orders` with `action: "cancel_automation", leadId: selectedLead.id`
- After success: refreshes leads and shows toast

**Order Detail Dialog (`src/pages/Admin.tsx`)**:
- Add the same "Stop Automation" button inside the Automation Controls section (lines 1755-1813)
- Same visibility logic using the order's `automation_status` and `automation_manual_override_at`
- On click: calls `admin-orders` with `action: "cancel_automation", orderId: selectedOrder.id`
- After success: refreshes orders and shows toast

### Pitfalls

| Pitfall | Prevention |
|---------|------------|
| Backend only supports `leadId` today | Extend the action to accept `orderId` as an alternative, updating the `orders` table instead |
| Suno callback arrives after cancel | Already protected -- all callback handlers check `automation_manual_override_at` before writing |
| Admin uploads a song without clicking Stop first | Still safe -- `upload-song` automatically sets `automation_manual_override_at` |
| Admin wants to re-enable automation later | "Regenerate Song" and "Reset Automation" already clear `automation_manual_override_at` |
| Button shows after automation already completed | Visibility guard checks for active statuses only, so it won't appear on `completed` or null statuses |

### Files Modified

- **`supabase/functions/admin-orders/index.ts`** -- extend `cancel_automation` to accept `orderId`
- **`src/components/admin/LeadsTable.tsx`** -- add Stop Automation button in lead detail dialog
- **`src/pages/Admin.tsx`** -- add Stop Automation button in order detail dialog

No database changes. No new dependencies. No new files.
