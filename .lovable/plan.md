
## Dismiss/Cancel Feature for Leads & Orders

### Current State Analysis

**For Leads:**
- ✅ Leads **can** be dismissed using the `dismissed_at` column
- ✅ Dismissed leads are filtered out by default (filter shows "Active Only" / "Dismissed" / "All")
- ✅ The `handleDismissLead` function calls `admin-orders` with action `update_lead_dismissal`
- ✅ Dismissed leads can be **restored** by setting `dismissed_at` back to `null`
- ✅ Dismissed leads are blocked from automation (checked in LeadsTable logic)

**For Orders:**
- ❌ Orders do **NOT** have a `dismissed_at` column
- ❌ No dismiss/cancel button in the Orders UI
- ❌ The automation pipeline does NOT check for cancelled/dismissed orders
- ⚠️ There's a `cancelled` status option in the status dropdown, but no dedicated dismiss flow

---

## Problems to Solve

1. **Orders can't be dismissed/cancelled from the UI** - There's no button to mark an order as cancelled
2. **Automation doesn't respect order cancellation** - If an order is cancelled, the AI pipeline could still generate a song for it
3. **No way to view dismissed/cancelled orders** - Unlike leads, orders don't have a filter to show cancelled items

---

## Solution Overview

### Database Changes
Add a `dismissed_at` column to the `orders` table for consistent tracking (similar to leads).

```sql
ALTER TABLE public.orders ADD COLUMN dismissed_at timestamptz;
```

### Backend Changes

**File: `supabase/functions/admin-orders/index.ts`**

Add a new action: `update_order_dismissal`
- Sets `dismissed_at` timestamp when dismissed
- Changes status to `cancelled`
- Sets `automation_manual_override_at` to prevent AI from running
- Clears any in-progress automation status

**File: `supabase/functions/automation-trigger/index.ts`**

Add a check for cancelled/dismissed orders:
- If `entity.status === "cancelled"` → skip automation
- If `entity.dismissed_at` → skip automation

### Frontend Changes

**File: `src/pages/Admin.tsx`**

1. Add `dismissed_at` to the Order interface
2. Add a dismiss filter dropdown (similar to leads): "Active" / "Cancelled" / "All"
3. Add a "Cancel Order" button in the order card actions
4. Add a "Restore Order" button for cancelled orders
5. Style cancelled orders with reduced opacity and strikethrough (like leads)

**Handler: `handleDismissOrder(order, dismiss)`**
- Calls `admin-orders` with action `update_order_dismissal`
- Shows success toast
- Refreshes order list

---

## Detailed Implementation

### 1. Database Migration
```sql
-- Add dismissed_at column for order cancellation/archival tracking
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS dismissed_at timestamptz;
```

### 2. Backend: `admin-orders/index.ts`

Add new action handler:

```text
if (body?.action === "update_order_dismissal") {
  const orderId = body.orderId;
  const dismissed = body.dismissed === true;
  
  const updates = {
    dismissed_at: dismissed ? new Date().toISOString() : null,
    status: dismissed ? "cancelled" : "paid", // Restore to paid
    automation_manual_override_at: dismissed ? new Date().toISOString() : null,
    automation_status: dismissed ? null : undefined, // Clear automation if cancelling
    automation_last_error: dismissed ? "Cancelled by admin" : undefined,
  };
  
  // Update order
  await supabase.from("orders").update(updates).eq("id", orderId);
  
  return { success: true };
}
```

### 3. Backend: `automation-trigger/index.ts`

Add dismissal check after fetching entity:

```text
// Block automation for cancelled/dismissed orders
if (entityType === "order") {
  if (entity.status === "cancelled" || entity.dismissed_at) {
    return Response({ error: "Order is cancelled" }, 409);
  }
}

// Block automation for dismissed leads  
if (entityType === "lead" && entity.dismissed_at) {
  return Response({ error: "Lead is dismissed" }, 409);
}
```

### 4. Frontend: Order Interface & State

```typescript
interface Order {
  // ... existing fields
  dismissed_at: string | null; // ADD THIS
}

// Add state
const [dismissedOrderFilter, setDismissedOrderFilter] = useState<"active" | "cancelled" | "all">("active");
const [dismissingOrder, setDismissingOrder] = useState<string | null>(null);
```

### 5. Frontend: Orders Tab Filter

Add a dropdown next to the existing status filter:
- "Active Only" (default) - hides cancelled/dismissed orders
- "Cancelled" - shows only cancelled orders
- "All" - shows everything

### 6. Frontend: Order Card Actions

Add dismiss/restore button to each order card:

```text
{!order.dismissed_at ? (
  <Button variant="outline" size="sm" onClick={() => handleDismissOrder(order, true)}>
    <X className="h-4 w-4 mr-2" />
    Cancel Order
  </Button>
) : (
  <Button variant="outline" size="sm" onClick={() => handleDismissOrder(order, false)}>
    <RotateCcw className="h-4 w-4 mr-2" />
    Restore Order
  </Button>
)}
```

### 7. Frontend: Visual Styling for Cancelled Orders

Apply the same treatment as dismissed leads:
- Reduced opacity (`opacity-60 bg-muted/50`)
- Strikethrough on customer name
- "Cancelled" badge with Archive icon

---

## Summary of Changes

| Component | Change |
|-----------|--------|
| Database | Add `dismissed_at` column to orders |
| `admin-orders/index.ts` | Add `update_order_dismissal` action |
| `automation-trigger/index.ts` | Block cancelled/dismissed orders from automation |
| `Admin.tsx` | Add dismiss filter, Cancel/Restore buttons, visual styling |
| Order interface | Add `dismissed_at` field |

---

## Behavior When Order is Cancelled

1. `dismissed_at` is set to current timestamp
2. `status` changes to `cancelled`
3. `automation_manual_override_at` is set (blocks callbacks)
4. Any in-progress automation is cleared
5. Order is hidden from default view (Active filter)
6. Order can be restored by clicking "Restore Order"
