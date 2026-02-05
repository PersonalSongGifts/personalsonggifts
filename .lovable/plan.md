
# Track Converted Lead Orders

## Summary

Add a dedicated `source` column to the orders table and update the Admin dashboard to filter and display orders by their origin (direct checkout vs lead conversion). This will let you easily identify and analyze which purchases came from the lead recovery funnel.

---

## Current State

Right now, converted leads are identified by parsing the `notes` field:
- `lead_session:${sessionId}` - automatic conversions
- `Manual conversion from lead` - manual conversions

This is fragile and not filterable in the UI. You have **8 orders from leads** and **110 direct orders**.

---

## Solution

### 1. Database: Add `source` Column

Add a new column to track order origin:

| Column | Type | Default | Values |
|--------|------|---------|--------|
| `source` | text | `'direct'` | `'direct'`, `'lead_conversion'` |

A migration will also backfill existing orders by analyzing the `notes` field.

### 2. Backend: Tag Lead Conversions

Update the functions that create orders from leads:

**Files:**
- `supabase/functions/process-lead-payment/index.ts` - Set `source: 'lead_conversion'`
- `supabase/functions/admin-orders/index.ts` (manual conversion) - Set `source: 'lead_conversion'`

### 3. Admin Dashboard: Filter by Source

**File:** `src/pages/Admin.tsx`

Add a new filter dropdown for order source:

```text
┌───────────────────┐
│ Source: All       ▼│
├───────────────────┤
│ All Orders        │
│ 🎯 Direct         │ ← From checkout page
│ 🔄 Converted Leads│ ← From lead recovery
└───────────────────┘
```

### 4. Stats Cards: Show Breakdown

**File:** `src/components/admin/StatsCards.tsx`

Add a stat card showing the source breakdown:

| Card | Display |
|------|---------|
| Lead Conversions | `8` (with revenue amount) |

### 5. Visual Badge on Order Cards

Show a "CONVERTED LEAD" badge on order cards for quick identification:

```text
┌──────────────────────────────────────┐
│ 🎵 Song for Mom                      │
│ John Smith • Mother's Day            │
│ [DELIVERED] [CONVERTED LEAD]         │ ← New badge
└──────────────────────────────────────┘
```

---

## Files to Modify

| File | Changes |
|------|---------|
| Database migration | Add `source` column, backfill existing orders |
| `supabase/functions/process-lead-payment/index.ts` | Set `source: 'lead_conversion'` on insert |
| `supabase/functions/admin-orders/index.ts` | Set `source: 'lead_conversion'` for manual conversions |
| `src/pages/Admin.tsx` | Add source filter, add badge display |
| `src/components/admin/StatsCards.tsx` | Add converted leads stat card |

---

## Technical Details

### Migration SQL

```sql
-- Add source column
ALTER TABLE orders ADD COLUMN source TEXT DEFAULT 'direct';

-- Backfill existing lead conversions
UPDATE orders 
SET source = 'lead_conversion' 
WHERE notes LIKE 'lead_session:%' 
   OR notes LIKE '%Manual conversion from lead%';
```

### Filter Logic

```typescript
// New state
const [sourceFilter, setSourceFilter] = useState<"all" | "direct" | "lead_conversion">("all");

// In filter logic
if (sourceFilter !== "all" && order.source !== sourceFilter) return false;
```

---

## Expected Outcome

After implementation:
- New dropdown to filter orders by source (Direct vs Converted Leads)
- Visual badge on converted lead orders
- Stats card showing conversion revenue
- Proper tracking for future lead conversions via dedicated column
- Backfill ensures existing data is correctly categorized
