

## Add AOV Stat Card + AOV Trend Chart to Admin Analytics

### What we're building
1. **AOV stat card** in the "Revenue & Orders" section of StatsCards — shows the average order value for the current date range
2. **AOV Trend chart** — a new line/area chart showing daily AOV over the selected date range, placed alongside the existing Revenue and Orders charts

### Changes

**1. `src/components/admin/StatsCards.tsx`**
- Add an "AOV" stat to the "Revenue & Orders" section
- Calculate: `totalRevenue / activeOrders.length` (non-cancelled orders in the filtered set)
- Display as `$XX.XX` with description showing order count

**2. New file: `src/components/admin/AOVChart.tsx`**
- Line/area chart showing daily AOV over the date range passed in via `orders` prop
- Group orders by day, compute `sum(price) / count` per day
- Show rolling 7-day average line for trend visibility
- Tooltip shows exact AOV, order count, and revenue for each day
- Uses same styling as RevenueChart (AreaChart from recharts)

**3. `src/pages/Admin.tsx`**
- Import and add `<AOVChart orders={analyticsOrders} />` in the Analytics tab grid (alongside RevenueChart/OrdersChart or in a new row)

All components already receive `analyticsOrders` which is pre-filtered by the date range selector, so AOV will automatically respond to date range changes.

