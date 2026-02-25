

# Admin Dashboard Performance Overhaul + Geographic Analytics

This is a large change spanning 7 areas: database indexes, server-side search, server-side stats, faster loading, Today/Yesterday buttons, geographic data capture, and a map visualization. Here's the full implementation plan.

---

## 1. Database Migration

A single migration adds indexes, geographic columns, and extends the date preset type.

**Indexes (6 total):**
- `orders(customer_email)` -- email search
- `orders(automation_status)` -- status filtering
- `orders(created_at DESC)` -- time-range aggregates
- `leads(email)` -- email search
- `leads(automation_status)` -- status filtering
- `leads(captured_at DESC)` -- time-range aggregates

**New columns on `orders`:**
- `billing_country_code` (text, nullable) -- ISO 3166-1 alpha-2 (e.g., "US")
- `billing_country_name` (text, nullable) -- human-readable (e.g., "United States")

No changes to leads table for now -- no billing info available during lead capture, and IP geolocation adds external API dependency. Can be added later.

---

## 2. Server-Side Search (`admin-orders` Edge Function)

**New action: `search`**

Accepts `{ action: "search", query: "...", adminPassword: "..." }`.

Runs `ILIKE '%query%'` against:
- Orders: `customer_email`, `customer_name`, `recipient_name`, `id::text`
- Leads: `email`, `customer_name`, `recipient_name`, `id::text`

Returns up to 50 results each, with all columns (same shape as the `list` response). This means search results drop directly into the existing Orders/Leads tables with full edit/regenerate/reset functionality -- no separate read-only view.

---

## 3. Server-Side Stats (`admin-orders` Edge Function)

**New action: `get_stats`**

Returns pre-computed aggregates via SQL:

```text
Revenue & Orders:
- Total revenue (all time)
- Revenue last 30 days
- Order counts by status: delivered, paid, in_progress, failed (automation_status="failed"), needs_attention (computed)
- Orders created today (since midnight UTC)
- Orders created this week (since Monday UTC)

Leads:
- Total leads
- Leads by status: lead, converted, song_ready, preview_sent
- Unconverted count

Conversion:
- Lead-to-order conversion rate (converted / total leads)

Recovery:
- Previews sent count
- True recoveries (preview_sent + converted)
- Recovery revenue
- Recovery rate

Engagement:
- Songs played, downloaded
- SMS sent, failed, opted-in

Lyrics Unlocks:
- Total, paid, free, revenue
```

This replaces the need to download all data just to show the dashboard stats card.

---

## 4. Faster Background Loading (`src/pages/Admin.tsx`)

Three changes to the existing pagination loop:

1. **Page size 200 -> 1000** -- reduces ~31 requests to ~7
2. **Remove 100ms `setTimeout` delay** between pages -- eliminates ~3 seconds of artificial wait
3. **Parallel orders + leads loading** -- fetch both tables concurrently per page instead of sequentially

On login:
- Call `get_stats` + first page (1000 rows) in parallel
- Dashboard tab renders immediately from server stats
- Background loop fills remaining pages for charts and detailed filtering

---

## 5. Debounced Server-Side Search (Frontend)

**File: `src/pages/Admin.tsx`**

- Add a `useEffect` with 300ms debounce on the search input
- When debounce fires and query has 2+ characters, call `action: "search"` on the backend
- Search results replace the filtered view in both Orders and Leads tabs
- When search is cleared, revert to showing the full in-memory dataset
- Search results use the exact same card/row components -- clicking into a result opens the same detail dialog with full edit/regenerate/reset capabilities

The existing client-side `orderSearch` filter will serve as an instant local filter when all data is loaded, with server-side search as the primary mechanism (especially useful before all data has loaded).

---

## 6. Today/Yesterday Date Quick-Select

**File: `src/pages/Admin.tsx`**

- Extend the `DatePreset` type: `"today" | "yesterday" | "7d" | "14d" | "30d" | "90d" | "all" | "custom"`
- Add "Today" and "Yesterday" as the **first two buttons** in the date range bar
- Style them slightly larger/bolder than the other presets for easy access
- "Today" filters to `startOfDay(new Date())` through `now`
- "Yesterday" filters to `startOfDay(subDays(now, 1))` through `endOfDay(subDays(now, 1))`
- Update the `analyticsOrders` derivation to handle both new presets
- Also derive `analyticsLeads` using the same date range for the geo visualization

---

## 7. Capture Billing Country Going Forward

**File: `supabase/functions/stripe-webhook/index.ts`**

After verifying the checkout session, retrieve the PaymentIntent to access the charge's billing details:

```text
1. Expand session.payment_intent to get charges
2. Read charges.data[0].billing_details.address.country (ISO alpha-2)
3. Map code to country name via a small built-in lookup object
4. Store billing_country_code and billing_country_name on the new order
```

**File: `supabase/functions/process-lead-payment/index.ts`**

Same approach for lead conversions -- retrieve billing country from the Stripe session's payment intent and store on the created order.

No backfilling of existing orders in this release.

---

## 8. Geographic Visualization

**New file: `src/components/admin/GeoAnalytics.tsx`**

Two sections:

### World Map (SVG-based)
- Lightweight inline SVG world map with country paths (no heavy library)
- Countries colored by intensity based on order/lead count
- Hover tooltip showing country name + counts
- Toggle to view: "Orders only", "Leads only", or "Both"
- Filtered by the same dashboard date range (including Today/Yesterday)

### Country Breakdown Table
- Ranked list: Country | Orders | Leads | Revenue
- Sorted by order count descending
- Same date range filtering
- Scrollable if many countries

**Integration in `src/pages/Admin.tsx`:**
- Add `GeoAnalytics` component after Source Analytics in the Analytics tab
- Pass `analyticsOrders` and filtered leads

---

## 9. Future-Proof Architecture

To prepare for server-side pagination without a rewrite:

- Extract data filtering/sorting into a `useAdminData` hook that returns `{ data, loading, search, setSearch, ... }`
- The hook internally decides whether to filter client-side (all data loaded) or call the server (search mode / future paginated mode)
- Table components receive data via props -- they don't know or care whether it's from memory or an API call
- This means switching to true server-side pagination later is a change to the hook internals only, not the table components

---

## File Change Summary

| File | Change |
|------|--------|
| New DB migration | 6 indexes + 2 columns on orders |
| `supabase/functions/admin-orders/index.ts` | Add `search` and `get_stats` actions |
| `supabase/functions/stripe-webhook/index.ts` | Capture billing country from Stripe charge |
| `supabase/functions/process-lead-payment/index.ts` | Same billing country capture |
| `src/pages/Admin.tsx` | Server stats on login, debounced search, faster loading (pageSize 1000, no delay, parallel), Today/Yesterday buttons, analyticsLeads derivation, GeoAnalytics integration, useAdminData hook extraction |
| `src/components/admin/StatsCards.tsx` | Accept optional `serverStats` prop, use when available |
| `src/components/admin/GeoAnalytics.tsx` | New -- SVG world map + country breakdown table |

## What's Deferred
- Backfilling existing orders with country data from Stripe
- Lead geolocation via IP (no billing info on leads)
- True server-side pagination for Orders/Leads tabs (architecture prepared, not activated)

