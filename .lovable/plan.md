

## Sales Velocity and Heatmap Modules

### New Components

**1. Sales Velocity Tracker (`SalesVelocity.tsx`)**

A card comparing today's performance against yesterday at the same time of day, using PST:

- **Orders today so far** vs **orders yesterday by this same PST hour/minute**
- **Revenue today so far** vs **revenue yesterday by this same PST hour/minute**
- Percentage difference (green if ahead, red if behind)
- Progress bar showing today's orders relative to yesterday's full-day total
- Labels showing day names (e.g., "vs Sunday") so weekend/weekday differences are obvious
- Cancelled orders excluded from all counts
- Graceful "N/A" when yesterday had zero orders (no divide-by-zero)
- Auto-refreshes when `allOrders` prop changes (no polling needed since data is already fetched)

**2. Sales Heatmap Charts (`SalesHeatmap.tsx`)**

Two bar charts side by side:

- **Orders by Day of Week** (Mon-Sun): Shows *average* orders per weekday across all historical data, so a Monday that's only appeared once isn't unfairly compared to a Friday with 20 data points. Each bar labeled with sample size.
- **Orders by Hour of Day** (12 AM - 11 PM PST): Shows total order distribution across hours. All timestamps converted from UTC to PST before bucketing.

Both charts use `recharts` (already installed) and exclude cancelled orders.

### Integration into Admin Page

Both components will be inserted into the analytics tab (lines 945-960 of `Admin.tsx`):
- `SalesVelocity` goes right after `StatsCards` (top priority info)
- `SalesHeatmap` goes after the existing chart grid, before `SourceAnalytics`

Both receive the existing `allOrders` array as a prop -- no new API calls.

### Technical Details

**Files created:**
- `src/components/admin/SalesVelocity.tsx`
- `src/components/admin/SalesHeatmap.tsx`

**Files modified:**
- `src/pages/Admin.tsx` -- two new imports + two new component renders in the analytics tab

**Libraries used (all already installed):**
- `date-fns` + `date-fns-tz` for PST conversion
- `recharts` for bar charts
- Existing `Card`, `CardHeader`, `CardContent`, `CardTitle` UI components

**Pitfalls pre-addressed:**
- **DST shifts**: Using `date-fns-tz` with `America/Los_Angeles` (not a hardcoded UTC-8 offset) so the comparison stays correct during spring/fall DST transitions
- **Midnight edge case**: If it's 12:05 AM PST, "yesterday by now" means orders between midnight and 12:05 AM yesterday -- this will likely be 0, which is handled gracefully
- **New day with no orders yet**: Shows "0 orders so far" with "N/A" comparison if yesterday also had 0
- **Hour bucketing in wrong timezone**: Every `created_at` timestamp is explicitly converted to PST before extracting the hour, preventing the known peak at 1 PM PST from showing up at 9 PM
- **Day-of-week averages vs raw totals**: Using averages (total Monday orders / number of Mondays in dataset) so recent days with less data aren't over-weighted
