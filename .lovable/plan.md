

# Lead Capture System - Keeping Leads & Orders Separate

## Overview
We'll create a **completely separate system** for leads that has no overlap with orders. This makes it crystal clear:
- **Leads table** = People who filled in step 7 (potential customers)
- **Orders table** = People who paid (actual customers)

## How They Stay Separate

```text
┌────────────────────────────────┐     ┌─────────────────────────────────┐
│          LEADS TABLE           │     │          ORDERS TABLE           │
│  (Marketing / Retargeting)     │     │   (Fulfillment / Delivery)      │
├────────────────────────────────┤     ├─────────────────────────────────┤
│  • email                       │     │  • customer_email               │
│  • phone                       │     │  • customer_phone               │
│  • name                        │     │  • customer_name                │
│  • song preferences            │     │  • song preferences             │
│  • status: lead | converted    │     │  • status: paid | in_progress   │
│  • captured_at                 │     │  • pricing_tier                 │
│  • converted_at (if paid)      │     │  • price                        │
│                                │     │  • song_url                     │
│                                │     │  • delivered_at                 │
└────────────────────────────────┘     └─────────────────────────────────┘
         ↑                                       ↑
         │                                       │
   Step 7 completion                      Payment success
```

## Key Difference: Status Field

**In the Leads table:**
- `lead` = Captured their info, haven't paid yet
- `converted` = They went on to pay (you can cross-reference with orders)

**In the Orders table (existing):**
- `paid`, `in_progress`, `completed`, `delivered`, `cancelled`

These are completely separate workflows. The leads table is purely for marketing purposes.

---

## Admin Dashboard: Separate Tabs

The admin dashboard will have **three tabs**:
1. **Analytics** - Charts and stats (existing)
2. **Orders** - Paid orders for fulfillment (existing)
3. **Leads** - New tab for marketing leads

The Leads tab will show:
- All captured leads with their status
- Filter by `lead` (unconverted) vs `converted` 
- Export to CSV for email marketing
- Stats like "Conversion Rate" (leads → orders)

---

## Technical Implementation

### 1. New Database Table: `leads`

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Unique ID |
| `email` | text | Their email (required) |
| `phone` | text | Phone number (optional) |
| `customer_name` | text | Their name |
| `recipient_name` | text | Who the song is for |
| `recipient_type` | text | Relationship type |
| `occasion` | text | Birthday, anniversary, etc. |
| `genre` | text | Music style |
| `singer_preference` | text | Male/female vocalist |
| `special_qualities` | text | What makes recipient special |
| `favorite_memory` | text | Memory they shared |
| `special_message` | text | Optional message |
| `status` | text | `lead` or `converted` |
| `captured_at` | timestamp | When step 7 was completed |
| `converted_at` | timestamp | When they paid (null if not) |
| `order_id` | uuid | Reference to order (null if not converted) |

### 2. New Edge Function: `capture-lead`

When the user completes step 7 and clicks "Continue to Checkout":
- Capture all their form data
- Save to leads table with status = "lead"
- This happens instantly (fire-and-forget, doesn't slow them down)

### 3. Update `process-payment` Edge Function

After successful payment:
- Find the lead by email
- Update status from `lead` → `converted`
- Set `converted_at` timestamp
- Link to the order via `order_id`

### 4. Update Admin Dashboard

Add a new "Leads" tab with:
- List of all leads
- Filter: All / Unconverted / Converted
- Conversion stats
- Export button for email marketing

### 5. Create `admin-leads` Edge Function

Similar to `admin-orders`, but for leads:
- Password protected
- GET: Fetch leads with filters
- Supports CSV export

---

## Files to Create

| File | Purpose |
|------|---------|
| Database migration | Create `leads` table with RLS |
| `supabase/functions/capture-lead/index.ts` | Save lead when step 7 completes |
| `supabase/functions/admin-leads/index.ts` | Admin access to leads |

## Files to Modify

| File | Change |
|------|--------|
| `src/pages/CreateSong.tsx` | Call capture-lead after step 7 validation |
| `supabase/functions/process-payment/index.ts` | Update lead status to converted |
| `src/pages/Admin.tsx` | Add Leads tab |

---

## Accessing Leads

After implementation, you can view all leads at:
- **Admin Dashboard** → "Leads" tab → Filter by status
- **Export** → Download CSV for importing into your email marketing tool

You'll easily see:
- **Total leads captured**
- **Conversion rate** (leads who became orders)
- **Unconverted leads** (people to retarget)

