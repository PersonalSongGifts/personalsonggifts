
# Admin Support Controls - Implementation Plan

## Current Status

Based on my exploration, here's what's already done vs. what needs to be implemented:

| Feature | Status |
|---------|--------|
| Name pronunciation override (database + UI + lyrics) | Done |
| Regenerate Song action with send timing | Done |
| Creative field dropdowns (genre, occasion, vocal) | Needs work |
| Email override + CC system | Not started |
| Resend Email without regeneration | Not started |
| Change detection for creative fields | Needs work |

---

## Part 1: Admin Editable Creative Fields (Dropdowns)

### What This Adds

Admins will be able to change the song's genre, singer preference (vocal gender), and occasion using dropdowns that match the customer-facing options.

### Changes Required

**Backend - admin-orders/index.ts:**
- Add `genre`, `singer_preference`, `occasion` to the allowed fields whitelist for both `update_order_fields` and `update_lead_fields` actions

**Frontend - Admin.tsx (Order Edit):**
Add three dropdowns in edit mode:

| Field | Options |
|-------|---------|
| Genre | Pop, Country, Rock, R&B, Jazz, Acoustic, Rap/Hip-Hop, Indie, Latin, K-Pop, EDM/Dance |
| Singer | Male, Female |
| Occasion | Valentine's Day, Wedding, Anniversary, Baby Lullaby, Memorial Tribute, Pet Celebration, Pet Memorial, Milestone, Birthday, Graduation, Retirement, Mother's Day, Father's Day, Proposal, Friendship, Thank You, Custom |

**Frontend - LeadsTable.tsx (Lead Edit):**
Same three dropdowns added to the lead edit form.

---

## Part 2: Email Override + CC System

### What This Adds

Admins can correct the delivery email address and optionally add a CC recipient, without triggering automatic resends.

### Database Changes

**Orders table:**
```text
customer_email_override (text, nullable)
customer_email_cc (text, nullable)  
sent_to_emails (jsonb, nullable) - array of recipients used in previous sends
```

**Leads table:**
```text
lead_email_override (text, nullable)
lead_email_cc (text, nullable)
preview_sent_to_emails (jsonb, nullable)
```

### Admin UI Changes

In order edit dialog, show:
- **Original Email** (read-only): Shows the original `customer_email`
- **Delivery Email Override**: Editable field for corrected email
- **CC Email (Optional)**: Additional recipient

Same pattern for lead edit.

### Email Sending Logic

Update both `send-song-delivery` and `send-lead-preview` to:

1. Compute effective email: `override ?? original`
2. Add CC if present and different from effective email
3. After successful send, append recipients to `sent_to_emails` / `preview_sent_to_emails` array

### Backend Whitelist Update

Add these fields to allowed updates:
- Orders: `customer_email_override`, `customer_email_cc`
- Leads: `lead_email_override`, `lead_email_cc`

---

## Part 3: Change Detection for Creative Fields

### What This Adds

Changing genre, occasion, or singer_preference after a song exists will flag the item for admin review.

### Implementation

**Update inputs_hash calculation** in `stripe-webhook/index.ts` and `process-payment/index.ts` to include:
- `genre`
- `singer_preference` (vocal gender)
- `occasion`

**Update admin-orders `update_order_fields`/`update_lead_fields` actions:**
When updating creative fields, if a song already exists:
1. Recompute inputs_hash
2. If changed, set `delivery_status = 'needs_review'` (orders) or equivalent for leads
3. Item appears in "Needs Attention" filter

**Email edits do NOT trigger needs_review** - they only require a resend action.

---

## Part 4: Resend Email Without Regeneration

### What This Adds

A dedicated button to resend the existing song to corrected emails, without regenerating audio.

### Admin UI

**Orders:** Add "Resend Delivery Email" button
- Visible when: `song_url` exists AND `sent_at` is set
- Shows dialog with send options: "Send Now" or "Schedule Send"

**Leads:** Add "Resend Preview Email" button  
- Visible when: `preview_song_url` exists AND `preview_sent_at` is set
- Same dialog options

### Backend Action

Add new action `resend_email` in admin-orders:

```text
action: "resend_email"
orderId / leadId
sendOption: "immediate" | "scheduled"
scheduledAt: ISO string (if scheduled)
```

Behavior:
1. Call appropriate send function with current effective email + CC
2. Record recipients in sent_to_emails array
3. Update sent_at / preview_sent_at timestamp
4. Do NOT modify any generation artifacts

---

## Files to Modify

### Database
| File | Change |
|------|--------|
| New migration | Add email override, CC, and sent_to columns to orders and leads |

### Frontend
| File | Change |
|------|--------|
| `src/pages/Admin.tsx` | Add creative field dropdowns, email override fields, Resend button |
| `src/components/admin/LeadsTable.tsx` | Add creative field dropdowns, email override fields, Resend button |

### Edge Functions
| File | Change |
|------|--------|
| `supabase/functions/admin-orders/index.ts` | Whitelist creative + email fields, add change detection, add resend_email action |
| `supabase/functions/send-song-delivery/index.ts` | Accept email override + CC, record sent_to_emails |
| `supabase/functions/send-lead-preview/index.ts` | Accept email override + CC, record preview_sent_to_emails |
| `supabase/functions/stripe-webhook/index.ts` | Include genre, occasion, singer_preference in inputs_hash |
| `supabase/functions/process-payment/index.ts` | Include genre, occasion, singer_preference in inputs_hash |

---

## Technical Details

### Dropdown Options (Matching Customer Flow)

**Genre Options:**
```typescript
const genres = [
  { id: "pop", label: "Pop" },
  { id: "country", label: "Country" },
  { id: "rock", label: "Rock" },
  { id: "rnb", label: "R&B" },
  { id: "jazz", label: "Jazz" },
  { id: "acoustic", label: "Acoustic" },
  { id: "rap-hip-hop", label: "Rap / Hip-Hop" },
  { id: "indie", label: "Indie" },
  { id: "latin", label: "Latin" },
  { id: "kpop", label: "K-Pop" },
  { id: "edm-dance", label: "EDM / Dance" },
];
```

**Singer Options:**
```typescript
const singerOptions = [
  { id: "male", label: "Male" },
  { id: "female", label: "Female" },
];
```

**Occasion Options:**
```typescript
const occasions = [
  { id: "valentines", label: "Valentine's Day" },
  { id: "wedding", label: "Wedding" },
  { id: "anniversary", label: "Anniversary" },
  { id: "baby", label: "Baby Lullaby" },
  { id: "memorial", label: "Memorial Tribute" },
  { id: "pet-celebration", label: "Pet Celebration" },
  { id: "pet-memorial", label: "Pet Memorial" },
  { id: "milestone", label: "Milestone" },
  { id: "birthday", label: "Birthday" },
  { id: "graduation", label: "Graduation" },
  { id: "retirement", label: "Retirement" },
  { id: "mothers-day", label: "Mother's Day" },
  { id: "fathers-day", label: "Father's Day" },
  { id: "proposal", label: "Proposal" },
  { id: "friendship", label: "Friendship" },
  { id: "thank-you", label: "Thank You" },
  { id: "custom", label: "Custom" },
];
```

### Effective Email Logic

```typescript
function getEffectiveEmail(order: Order): string {
  return order.customer_email_override?.trim() || order.customer_email;
}

function getEmailRecipients(order: Order): string[] {
  const effective = getEffectiveEmail(order);
  const cc = order.customer_email_cc?.trim();
  
  const recipients = [effective];
  if (cc && cc !== effective) {
    recipients.push(cc);
  }
  return recipients;
}
```

### Change Detection Logic

```typescript
// In update_order_fields / update_lead_fields action:
if (hasCreativeFieldChange && entityHasSong) {
  // Recompute hash
  const newHash = await computeInputsHash([...]);
  
  if (newHash !== entity.inputs_hash) {
    updates.delivery_status = "needs_review";
    updates.inputs_hash = newHash;
  }
}
```

### Resend Email Flow

```text
Admin clicks "Resend Delivery Email"
        │
        ▼
Dialog: "Send Now" or "Schedule"
        │
        ▼
resend_email action:
  1. Get current effective email + CC
  2. Call send-song-delivery with these recipients
  3. Append to sent_to_emails array
  4. Update sent_at
        │
        ▼
Email sent to corrected addresses
(No song regeneration)
```

---

## Safety Guarantees

| Protection | Implementation |
|------------|----------------|
| No accidental auto-sends after email edit | Cron only sends when sent_at is NULL; email edit alone doesn't clear sent_at |
| Email validation | Basic regex check on override and CC fields |
| CC duplicate prevention | CC ignored if equals effective email |
| Idempotency tracking | sent_to_emails records all recipients used |
| Creative changes flagged | needs_review status surfaces in Needs Attention |

---

## Order of Implementation

1. **Database migration**: Add email columns
2. **Backend whitelist**: Add creative fields + email fields  
3. **Admin UI dropdowns**: Genre, singer, occasion
4. **Admin UI email fields**: Override, CC, read-only original
5. **Change detection**: inputs_hash update + needs_review logic
6. **Email sending updates**: Accept recipients array, record sent_to
7. **Resend action**: New admin action + UI button
