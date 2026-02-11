

## Add Conversion Rate Analytics + Additional Insights

### Overview
Add a new **Conversion Funnel** analytics component to the Analytics tab showing daily conversion rates (leads-to-orders), plus an **Average Order Value (AOV) trend** chart -- two high-value metrics currently missing from the dashboard.

### New Component: `ConversionFunnel.tsx`

A card showing:

1. **Daily Conversion Rate Chart** (line chart, last 14 days)
   - X-axis: date
   - Y-axis: conversion rate (%)
   - Calculation: `(orders created that day / leads captured that day) * 100`
   - Excludes cancelled orders
   - Shows today vs yesterday comparison with trend arrow
   - All timestamps converted to PST before bucketing

2. **Summary Stats Row** below the chart:
   - Today's conversion rate vs yesterday's (with % change badge)
   - 7-day rolling average conversion rate
   - 30-day rolling average conversion rate
   - Best day (highest conversion rate and which date)

3. **AOV Trend** (second chart in same component or separate card)
   - Line chart showing Average Order Value per day over last 14 days
   - Calculation: `total revenue that day / number of paid orders that day`
   - Helps spot pricing tier shifts or discount impact

### Placement in Analytics Tab

Insert after `SalesVelocity` and before the existing chart grid:

```
StatsCards
SalesVelocity
ConversionFunnel  <-- NEW
AOV Trend         <-- NEW (can be part of same component)
RevenueChart + OrdersChart
StatusChart + GenreChart
SalesHeatmap
SourceAnalytics
HotLeads
```

### Technical Details

**File changes:**

1. **`src/components/admin/ConversionFunnel.tsx`** (new file)
   - Accepts `orders` and `leads` arrays as props
   - Uses `recharts` LineChart for the daily trend
   - Uses `date-fns-tz` `toZonedTime` for PST conversion (matches existing pattern in SalesHeatmap/SalesVelocity)
   - Groups orders by `created_at` date (PST) and leads by `captured_at` date (PST)
   - Computes daily conversion rate, 7-day and 30-day rolling averages
   - Shows AOV trend as a second line chart below

2. **`src/pages/Admin.tsx`**
   - Import `ConversionFunnel`
   - Add `<ConversionFunnel orders={allOrders} leads={leads} />` after `<SalesVelocity>`

No database changes needed -- all computed client-side from existing data.

