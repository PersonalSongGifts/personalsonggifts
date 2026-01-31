
# Lead Recovery System: Simplified Design

## Overview
Build a unified workflow where leads and orders appear in the same Google Sheet, and uploading a song triggers the right action automatically based on whether it's a lead or customer.

---

## Key Simplifications Made

### 1. One Google Sheet for Everything
Instead of two separate sheets, everything goes to ONE sheet with a "Type" column:

| Type | Order ID | Status | Customer Name | Email | Recipient | ... |
|------|----------|--------|---------------|-------|-----------|-----|
| Order | ABC123 | paid | John Smith | john@... | Mom | ... |
| Lead | - | lead | Sarah Jones | sarah@... | Wife | ... |
| Order | DEF456 | delivered | Mike Chen | mike@... | Dad | ... |
| Lead | - | preview_sent | Lisa Park | lisa@... | Sister | ... |

**Benefit**: You see everything in one place. Orders at top (they paid), leads below (need recovery).

### 2. Smart Upload = One Button
When you click "Upload Song" on ANY entry:
- System checks: Is this an Order (has `order_id`) or a Lead?
- **Order**: Schedules full song delivery email for the right time
- **Lead**: Sends 35-second preview email immediately, they can purchase on the preview page

You don't choose - the system knows.

### 3. Auto-Delivery Timing
Instead of you clicking "Deliver" at the right time, the system schedules it:

| Type | Tier | When Song is Sent |
|------|------|-------------------|
| Order | Priority (24hr) | 12 hours after purchase |
| Order | Standard (48hr) | 36 hours after purchase |
| Lead | (no tier) | Preview sent immediately on upload |

**You can still override**: A "Deliver Now" button bypasses the schedule if needed.

### 4. Lead → Customer Conversion
When a lead purchases from the preview page:
1. Creates an Order from their lead data
2. Copies the full song to the order
3. Updates the Lead row in sheet to "Converted"
4. Adds a NEW Order row with order details
5. Sends full song email immediately (no waiting - they already heard the preview!)

---

## The FULLSONG Promo ($5 Off)

### How It Works
1. Lead receives preview email
2. 24 hours later (if they haven't purchased), they get follow-up email with FULLSONG code
3. FULLSONG gives $5 off ON TOP of current promo (VALENTINES50)
4. Final price: $44.99 (was $99.99 → 50% off = $49.99 → minus $5 = $44.99)

### Stripe Setup Required
Create a new coupon "FULLSONG" with:
- Type: Fixed amount
- Discount: $5.00 off
- Duration: Once

---

## Database Changes

### New Columns on `leads` Table
```sql
ALTER TABLE leads ADD COLUMN preview_song_url TEXT;
ALTER TABLE leads ADD COLUMN full_song_url TEXT;
ALTER TABLE leads ADD COLUMN song_title TEXT;
ALTER TABLE leads ADD COLUMN cover_image_url TEXT;
ALTER TABLE leads ADD COLUMN preview_token TEXT;
ALTER TABLE leads ADD COLUMN preview_sent_at TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN preview_opened_at TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN follow_up_sent_at TIMESTAMPTZ;
```

### Sync Existing Converted Leads
```sql
UPDATE leads l
SET status = 'converted', converted_at = o.created_at, order_id = o.id
FROM orders o
WHERE LOWER(l.email) = LOWER(o.customer_email) AND l.status = 'lead';
```

---

## Updated Edge Functions

### 1. Modify `capture-lead` 
**Change**: Also append to unified Google Sheet (same sheet as orders)

Current: Sends to Zapier webhook only
New: Sends to both Zapier AND append-to-sheet with Type = "Lead"

### 2. Modify `process-payment`
**Change**: Mark matching lead as converted when order is placed

Add after creating order:
```text
1. Query leads table for matching email
2. If found with status = 'lead':
   - Update to status = 'converted'
   - Set converted_at = now()
   - Set order_id = new order ID
```

### 3. Modify `append-to-sheet`
**Change**: Support both Order and Lead types

New columns in sheet:
- Column A: Type (Order / Lead)
- Rest of columns stay same, just leave Order-specific fields empty for leads

### 4. New `upload-song` (unified)
**Purpose**: Single upload handler for both orders AND leads

Logic:
```text
1. Receive song file + entry ID
2. Detect: Is this an order_id or lead_id?
3. Store full song
4. Extract cover art from MP3
5. If ORDER:
   - Update order with song_url
   - Schedule delivery email based on tier
6. If LEAD:
   - Generate preview_token
   - Clip first 35 seconds (server-side)
   - Store preview
   - Send preview email immediately
```

### 5. New `process-lead-payment`
**Purpose**: Handle lead purchasing from preview page

Logic:
```text
1. Verify Stripe payment
2. Create order from lead data
3. Copy song file to orders location
4. Mark lead as converted
5. Update Google Sheet (lead row → converted, add order row)
6. Send full song email IMMEDIATELY (no delay - they waited long enough!)
```

### 6. New `send-lead-followup`
**Purpose**: Send $5-off follow-up email 24 hours after preview

Trigger: Either manual button OR scheduled job checking `preview_sent_at > 24 hours ago`

---

## Admin Interface Changes

### Unified View (Optional)
Instead of separate Orders/Leads tabs, you could have ONE list sorted by priority:
1. Orders (paid, needs song) - top priority
2. Leads (unconverted, no song) - make songs when time permits

But keeping separate tabs is fine if you prefer - just adds visual distinction.

### Enhanced Card Display

**For Orders:**
```text
┌─────────────────────────────────────────────────────┐
│  ORDER • John Smith               [Paid - Awaiting]│
│  Song for: Mom • Birthday • Pop                    │
│  Ordered: Jan 30, 2026 • Priority (24hr)           │
│  Auto-delivers: Jan 31, 2026 12:00 PM PST          │
│                                                    │
│  [Upload Song]                   [View Details]    │
└─────────────────────────────────────────────────────┘
```

**For Leads:**
```text
┌─────────────────────────────────────────────────────┐
│  LEAD • Sarah Jones                  [Unconverted] │
│  Song for: Wife • Anniversary • R&B                │
│  Captured: Jan 28, 2026                            │
│                                                    │
│  [Upload Song]                   [View Details]    │
└─────────────────────────────────────────────────────┘
```

**After Upload (Lead):**
```text
┌─────────────────────────────────────────────────────┐
│  LEAD • Sarah Jones                 [Preview Sent] │
│  Song for: Wife • Anniversary • R&B                │
│  Preview sent: Jan 30, 2026 2:00 PM PST            │
│  Follow-up eligible: Jan 31, 2026 2:00 PM PST      │
│                                                    │
│  [▶ Listen]  [Send $5 Follow-up]   [View Details]  │
└─────────────────────────────────────────────────────┘
```

---

## Files to Create/Modify

### New Files
| File | Purpose |
|------|---------|
| `src/pages/SongPreview.tsx` | Customer-facing preview page (35s player + buy CTA) |
| `src/lib/audioClipper.ts` | Client-side 35-second audio extraction |
| `supabase/functions/get-lead-preview/index.ts` | Serve preview page data |
| `supabase/functions/create-lead-checkout/index.ts` | Stripe checkout for leads |
| `supabase/functions/process-lead-payment/index.ts` | Handle lead payment |
| `supabase/functions/send-lead-followup/index.ts` | Send $5-off follow-up email |

### Modified Files
| File | Changes |
|------|---------|
| `supabase/functions/capture-lead/index.ts` | Also append to Google Sheet |
| `supabase/functions/append-to-sheet/index.ts` | Support Type column (Order/Lead) |
| `supabase/functions/process-payment/index.ts` | Mark matching leads as converted |
| `supabase/functions/upload-song/index.ts` | Handle leads (clip + preview email) |
| `src/components/admin/LeadsTable.tsx` | Add upload + preview functionality |
| `src/pages/Admin.tsx` | Support unified upload flow |
| `src/pages/PaymentSuccess.tsx` | Handle lead conversion |
| `src/App.tsx` | Add `/preview/:token` route |

---

## Google Sheet Final Structure

| Column | Order | Lead |
|--------|-------|------|
| A: Type | "Order" | "Lead" |
| B: ID | Order UUID | Lead UUID |
| C: Status | paid/delivered | lead/preview_sent/converted |
| D: Created At | Order date | Capture date |
| E: Tier | standard/priority | (empty) |
| F: Price | 49/79 | (empty) |
| G: Customer Name | ✓ | ✓ |
| H: Customer Email | ✓ | ✓ |
| I: Customer Phone | ✓ | ✓ |
| J: Recipient Name | ✓ | ✓ |
| K: Occasion | ✓ | ✓ |
| L: Genre | ✓ | ✓ |
| M: Singer | ✓ | ✓ |
| N: Special Qualities | ✓ | ✓ |
| O: Favorite Memory | ✓ | ✓ |
| P: Special Message | ✓ | ✓ |

---

## Automation Ready (kie.ai)

All endpoints accept standard POST:

```text
POST /upload-song
Body: FormData with { id, type: "order"|"lead", file, adminPassword }

POST /send-lead-followup  
Body: { leadId, adminPassword }
```

**Future automated flow:**
1. New lead/order → webhook to kie.ai
2. kie.ai generates song
3. kie.ai calls upload-song with the MP3
4. System auto-handles the rest:
   - Order: Schedules delivery for 12/36 hours
   - Lead: Sends preview email immediately
   - Lead follow-up: Auto-sends $5 offer 24 hours later if no purchase

---

## Questions Answered

**Q: What about the timing?**
- Orders: Auto-deliver at 12hr (priority) or 36hr (standard) after purchase
- Leads: Preview sent immediately on upload, follow-up 24hr later

**Q: What if lead purchases normally (not from preview)?**
- process-payment auto-marks lead as converted
- They get normal order flow
- No duplicate outreach

**Q: What if I need to override timing?**
- "Deliver Now" button always available
- "Reschedule" option if needed

**Q: What about existing Zapier setup for leads?**
- Keep it running in parallel for now (it goes to a different sheet)
- OR update Zapier to listen to the unified sheet instead
- Can migrate later without breaking anything
