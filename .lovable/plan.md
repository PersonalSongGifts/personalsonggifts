
# Plan: Add UTM Tracking for Traffic Source Analytics

## Overview
Track where leads and orders come from using UTM parameters (`utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`). This will enable analytics showing which marketing channels drive the most traffic, leads, and sales.

## How UTM Tracking Works
When visitors arrive via marketing links like:
```
https://personalsonggifts.lovable.app/?utm_source=facebook&utm_medium=cpc&utm_campaign=valentines2026
```

The system will:
1. **Capture** UTM params on page load and store in sessionStorage
2. **Persist** them through the song creation and checkout flow
3. **Save** them to the database with leads and orders
4. **Display** source info in admin panel with analytics charts

---

## Technical Changes

### 1. Database Schema Changes
Add UTM columns to both `leads` and `orders` tables:

**New columns for both tables:**
| Column | Type | Description |
|--------|------|-------------|
| `utm_source` | text | Traffic source (google, facebook, tiktok, etc.) |
| `utm_medium` | text | Marketing medium (cpc, email, social, etc.) |
| `utm_campaign` | text | Campaign name |
| `utm_content` | text | Ad content identifier |
| `utm_term` | text | Search keyword |

### 2. Frontend: UTM Capture Hook
Create `src/hooks/useUtmCapture.ts`:
- On first page load, extract UTM params from URL
- Store in sessionStorage so they persist through navigation
- Provide a hook to retrieve stored UTMs when needed

### 3. Update CreateSong.tsx
- Import UTM hook
- Include UTM data when calling `capture-lead` endpoint

### 4. Update Checkout.tsx  
- Import UTM hook
- Include UTM data in checkout payload → Stripe metadata

### 5. Update Edge Functions

**capture-lead/index.ts:**
- Accept new UTM fields in input
- Store UTMs in leads table

**create-checkout/index.ts:**
- Accept UTM data
- Pass to Stripe metadata

**stripe-webhook/index.ts:**
- Read UTM data from Stripe metadata
- Store in orders table

### 6. Admin Panel Updates

**LeadsTable.tsx:**
- Display source badge on lead cards (e.g., "facebook / cpc")
- Show UTM details in lead dialog

**Admin.tsx (Orders):**
- Display source badge on order cards
- Show UTM details in order dialog

**New: SourceAnalytics Component:**
- Pie chart showing leads by source
- Pie chart showing orders/revenue by source
- Conversion rate by source

---

## User Flow Example

```text
1. User clicks Facebook ad:
   personalsonggifts.lovable.app/?utm_source=facebook&utm_medium=cpc&utm_campaign=valentines2026

2. UTMs captured and stored in sessionStorage

3. User completes song form → Lead captured with UTMs

4. User completes checkout → Order created with UTMs

5. Admin sees in dashboard:
   - Lead card: "Source: facebook / cpc"
   - Order card: "Source: facebook / cpc"  
   - Analytics: "Facebook: 45% of leads, 60% of revenue"
```

---

## Admin Analytics View
New analytics section showing:

| Source | Leads | Orders | Revenue | Conversion Rate |
|--------|-------|--------|---------|-----------------|
| facebook | 120 | 45 | $2,205 | 37.5% |
| google | 80 | 28 | $1,372 | 35.0% |
| tiktok | 60 | 15 | $735 | 25.0% |
| direct | 40 | 20 | $980 | 50.0% |

---

## Files to Create/Modify

| File | Action |
|------|--------|
| `src/hooks/useUtmCapture.ts` | Create - UTM capture and storage |
| `src/pages/Index.tsx` | Modify - Trigger UTM capture on homepage |
| `src/pages/CreateSong.tsx` | Modify - Pass UTMs to lead capture |
| `src/pages/Checkout.tsx` | Modify - Pass UTMs to checkout |
| `supabase/functions/capture-lead/index.ts` | Modify - Accept and store UTMs |
| `supabase/functions/create-checkout/index.ts` | Modify - Pass UTMs to Stripe |
| `supabase/functions/stripe-webhook/index.ts` | Modify - Store UTMs from metadata |
| `src/pages/Admin.tsx` | Modify - Display source on order cards |
| `src/components/admin/LeadsTable.tsx` | Modify - Display source on lead cards |
| `src/components/admin/SourceAnalytics.tsx` | Create - Source analytics charts |
| Database migration | Add UTM columns to leads and orders |

---

## Safety Notes
- UTM tracking is additive - won't break existing functionality
- All UTM fields are optional (nullable)
- Existing leads/orders will show "Direct" as source when UTMs are null
- sessionStorage ensures UTMs persist through multi-page flows but expire with session
