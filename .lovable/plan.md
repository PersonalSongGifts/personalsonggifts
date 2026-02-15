

## Add Order ID Search to Admin Dashboard

Allow admins to search for orders and leads by their ID (e.g., "6F220862") in the existing search boxes.

### Changes

**File 1: `src/pages/Admin.tsx` (Order search filter, ~line 1204)**
- Add `order.id.toLowerCase().includes(searchLower)` to the existing search filter chain
- This supports both full UUIDs and short 8-character prefixes since `.includes()` matches substrings

**File 2: `src/components/admin/LeadsTable.tsx` (Lead search filter, ~line 200)**
- Add `lead.id.toLowerCase().includes(searchLower)` to the existing search filter chain
- Same substring matching logic

**Placeholder text updates:**
- Change "Search orders..." to "Search by name, email, or order ID..."
- Change "Search leads..." to "Search by name, email, or lead ID..."

This makes the search placeholders hint that ID lookup is supported, so admins know they can paste an order number directly.

No backend or database changes needed -- the filtering is entirely client-side on already-loaded data.
