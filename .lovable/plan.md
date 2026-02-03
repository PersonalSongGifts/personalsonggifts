
# Plan: Fix Revenue Calculation - Price Format Inconsistency

## The Problem

Your revenue shows $10,535 for Feb 2 when it should be much lower. The issue is a **price format mismatch**:

- **46 existing orders** store price in **dollars** (49, 79)
- **2 manually converted orders** store price in **cents** (4900, 7900)

The manual lead-to-order conversion feature we just built is using cents (4900) while all your historical orders use dollars (49). This causes the revenue chart to calculate those two orders as $4,900 each instead of $49.

---

## The Fix

Standardize on **dollars** (49, 79) to match your existing data. This requires:

### 1. Fix the Frontend Conversion Dialog

**File:** `src/components/admin/LeadsTable.tsx`

Change the price values from cents to dollars:

| Current | Fixed |
|---------|-------|
| `useState<number>(4900)` | `useState<number>(49)` |
| `value="4900"` | `value="49"` |
| `value="7900"` | `value="79"` |

### 2. Fix the Backend Conversion Logic

**File:** `supabase/functions/admin-orders/index.ts`

Update the pricing tier check from cents to dollars:

| Current | Fixed |
|---------|-------|
| `price >= 7900` | `price >= 79` |
| Default `4900` | Default `49` |

### 3. Fix the Two Existing Incorrect Orders

Run a one-time SQL update to fix the two orders that were created with cents:

```sql
UPDATE orders 
SET price = price / 100 
WHERE price >= 100 AND notes LIKE '%Manual conversion%';
```

---

## Files to Modify

| File | Change |
|------|--------|
| `src/components/admin/LeadsTable.tsx` | Change convertPrice default and radio values from cents (4900/7900) to dollars (49/79) |
| `supabase/functions/admin-orders/index.ts` | Change default price from 4900 to 49, pricing tier check from 7900 to 79 |
| Database | Fix the 2 existing orders with incorrect prices |

---

## After the Fix

- Revenue chart will show accurate totals
- Future lead conversions will use correct dollar amounts
- All orders will have consistent price format (dollars)
