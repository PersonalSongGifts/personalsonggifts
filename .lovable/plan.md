
## ✅ Dismiss/Cancel Feature for Orders - COMPLETED

### What Was Implemented

**Database Changes:**
- Added `dismissed_at` timestamptz column to the `orders` table

**Backend Changes:**
1. **`admin-orders/index.ts`**: Added `update_order_dismissal` action that:
   - Sets `dismissed_at` timestamp when dismissed
   - Changes status to `cancelled`
   - Sets `automation_manual_override_at` to prevent AI from running
   - Clears any in-progress automation status
   - Can restore orders by clearing `dismissed_at` and setting status back to `paid`

2. **`automation-trigger/index.ts`**: Added checks to block automation for:
   - Orders with `status === "cancelled"`
   - Orders with `dismissed_at` set
   - Leads with `dismissed_at` set

**Frontend Changes (`Admin.tsx`):**
1. Added `dismissed_at` to Order interface
2. Added `dismissedOrderFilter` state with options: "active" / "cancelled" / "all"
3. Added `dismissingOrder` loading state
4. Added `handleDismissOrder(order, dismiss)` handler
5. Added filter dropdown in Orders tab toolbar
6. Added Cancel/Restore buttons on order cards
7. Visual styling for cancelled orders:
   - Reduced opacity (`opacity-60 bg-muted/50`)
   - Strikethrough on customer name
   - "Cancelled" badge with Archive icon
8. AI Generate button hidden for dismissed orders

---

### Behavior When Order is Cancelled

1. `dismissed_at` is set to current timestamp
2. `status` changes to `cancelled`
3. `automation_manual_override_at` is set (blocks callbacks)
4. Any in-progress automation is cleared
5. Order is hidden from default view (Active filter)
6. Order can be restored by clicking "Restore Order"

---

## Previous Feature: AI Song Generation for Orders

The automation pipeline was extended to support orders alongside leads:
- Edge functions now accept either `leadId` or `orderId`
- Callback routes results to the correct table
- Orders tab has "AI Generate" button
