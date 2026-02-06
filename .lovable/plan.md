

# Clean Up Admin Stats Dashboard

## Problem

The stats cards are crammed into a 10-column grid on desktop, causing titles and descriptions to get truncated ("Total R...", "Orders...", "Recov...", "SMS S...", etc.). With 13 cards forced into tiny squares, nothing is readable at a glance.

## Solution

Reorganize the 14 stats (13 existing + 1 new "Revenue Today") into **grouped rows by category** with section labels, using a wider, more readable grid layout.

### Layout

```text
+---------------------------+---------------------------+
|  REVENUE & ORDERS                                     |
+---------------------------+---------------------------+
| Total Revenue | Rev Today | Orders Today | Total | Pending |
+---------------------------+---------------------------+
|  LEAD RECOVERY                                        |
+---------------------------+---------------------------+
| Leads | Previews Sent | True Recoveries | Recovery Rate | Play > Buy |
+---------------------------+---------------------------+
|  ENGAGEMENT & SMS                                     |
+---------------------------+---------------------------+
| Songs Played | Downloads | SMS Sent | SMS Failed      |
+---------------------------+---------------------------+
```

- **5 columns max** on large screens (down from 10)
- **3 columns** on medium, **2 columns** on mobile
- Full titles and descriptions visible -- no truncation
- Small section headers ("Revenue & Orders", "Lead Recovery", "Engagement & SMS") to group related metrics

### New Metric: Revenue Today

Calculate today's revenue the same way total revenue is calculated, but filtered to orders created today (using the existing `today` date logic). Excludes cancelled orders.

## Technical Changes

**File: `src/components/admin/StatsCards.tsx`**

1. Add `revenueToday` calculation -- sum of `order.price` for non-cancelled orders created today
2. Insert new "Revenue Today" card after "Total Revenue" in the stats array
3. Restructure the stats array into grouped sections with labels
4. Update the grid layout from `grid-cols-10` to `grid-cols-2 sm:grid-cols-3 lg:grid-cols-5` with section dividers
5. Render each section with a small heading label above the row of cards

No other files need to change -- this is a self-contained component update.

