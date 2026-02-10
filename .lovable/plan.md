

## Converted Lead Admin Controls: "View Order" Bridge + Song Page Link

### The Problem (Two Issues)

1. **No bridge from lead to order**: When a lead converts, the lead card shows "Converted to Order: 229E978F" as plain text. There's no way to click through to the order's detail dialog to upload songs, edit lyrics, resend delivery, etc.

2. **Song Page link invisible**: The song page URL (`/song/229E978F`) only appears inside the ORDER detail dialog (and only when status is "delivered"). From the leads tab, you can't see or access it at all.

### The Fix

#### Change 1: "Manage Order" button on converted leads (LeadsTable.tsx)

Replace the plain-text "Converted to Order: 229E978F" with:
- A **clickable "Manage Order" button** that closes the lead view and opens the order's detail dialog in the Orders tab
- A **Song Page link** (`/song/SHORT_ID`) displayed directly, so you can copy/share it without navigating

This requires a new prop `onNavigateToOrder` on LeadsTable, which Admin.tsx will provide.

#### Change 2: Cross-tab navigation handler (Admin.tsx)

Add a `handleNavigateToOrder` function that:
1. Switches `activeTab` to `"orders"`
2. Clears `statusFilter` to `"all"` (so the order isn't hidden by a filter)
3. Finds the order in `allOrders` by ID
4. Sets it as `selectedOrder` to open the detail dialog immediately

Pass this function to LeadsTable as `onNavigateToOrder`.

### Pitfalls and Prevention

| Pitfall | Risk | Prevention |
|---------|------|------------|
| Order not in `allOrders` array | If data hasn't been fetched yet or order was created externally | Show a toast "Order not found -- try refreshing" and still switch to the orders tab so admin can search manually |
| Stale `allOrders` after manual conversion | Admin converts a lead, but `allOrders` hasn't refreshed yet | The existing `fetchOrders()` is already called after conversion. The navigate function will also call `fetchOrders()` as a safety net if the order isn't found |
| Filter hiding the order | `statusFilter` might be set to "delivered" while the order is still "pending" | Clear `statusFilter` to "all" before selecting the order |
| Song Page link for orders without a song | Clicking the link when no song is uploaded shows an error page | Only render the Song Page link when the order has status "delivered" or "ready". Otherwise show "Song not yet uploaded" |
| Lead dialog staying open behind order dialog | Both dialogs could render simultaneously | Close the lead detail (via `setSelectedLead(null)` in LeadsTable) before triggering the navigation callback |

### Technical Details

**Files modified:**

**`src/components/admin/LeadsTable.tsx`**:
- Add `onNavigateToOrder?: (orderId: string) => void` to `LeadsTableProps`
- In the converted lead section (around line 1099), replace plain text with:
  - Song Page link (anchor tag, opens in new tab) -- only if order exists
  - "Manage Order" button that calls `onNavigateToOrder(lead.order_id)`

**`src/pages/Admin.tsx`**:
- Add `handleNavigateToOrder` function
- Pass it as prop to `LeadsTable`

### No new files, no new dependencies, no database changes.
