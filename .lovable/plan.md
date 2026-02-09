
# Fix Lead Count Cap and Conversion Rate Accuracy

## Problem

The admin dashboard shows exactly **1,000 leads**, but the database actually has **1,753 leads**. This is caused by Supabase's default query limit of 1,000 rows. The `admin-orders` edge function fetches leads with a bare `.select("*")` and no pagination, so results are silently truncated.

This also makes the **conversion rate inaccurate** -- with only 1,000 of 1,753 leads visible, all lead-based metrics (conversion rate, recovery rate, play-to-buy rate, source analytics) are computed on incomplete data.

**Actual lead breakdown:**
- 1,023 in `preview_sent` status
- 442 in `lead` status  
- 288 `converted`
- **Total: 1,753**

## Solution

### 1. Fix the leads query in `admin-orders` to fetch all rows

Add `.range(0, 4999)` to the leads query (line 121-124) to explicitly request up to 5,000 rows. This overrides the default 1,000-row cap. The same fix will be applied to the orders query (line 108-117) as a preventive measure since orders will eventually hit 1,000 too.

### 2. Same fix for the orders query

Orders currently have fewer than 1,000 rows, but will hit the cap eventually. Apply the same `.range(0, 4999)` to the orders query to future-proof it.

## Technical Details

### File: `supabase/functions/admin-orders/index.ts`

**Change 1 (orders query, ~line 117):**
```typescript
// Before
const { data: orders, error } = await query;

// After  
const { data: orders, error } = await query.range(0, 4999);
```

**Change 2 (leads query, ~line 121-124):**
```typescript
// Before
const { data: leads, error: leadsError } = await supabase
  .from("leads")
  .select("*")
  .order("captured_at", { ascending: false });

// After
const { data: leads, error: leadsError } = await supabase
  .from("leads")
  .select("*")
  .order("captured_at", { ascending: false })
  .range(0, 4999);
```

No frontend changes needed -- once the backend returns all leads, the existing `StatsCards`, `SourceAnalytics`, and `LeadsTable` components will automatically show accurate counts and conversion rates.
