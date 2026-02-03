
# Plan: Editable Order/Lead Fields + Lead-to-Order Conversion

## Overview

This plan covers two related admin features:
1. **Editable Fields**: Allow admins to edit order and lead information (including email) so changes are saved to the database and used in all subsequent email deliveries
2. **Lead-to-Order Conversion**: Manually convert a lead to a paid order when Stripe payment succeeded but the webhook failed

---

## Part 1: Editable Order/Lead Fields

### What You'll Be Able to Edit

**For Orders:**
| Field | Example Use Case |
|-------|------------------|
| Customer Name | Fix typos |
| Customer Email | Customer requests delivery to different email |
| Customer Phone | Add missing phone |
| Recipient Name | Fix spelling in song personalization |
| Special Message | Customer wants to change message in song |
| Special Qualities | Additional details for song revision |
| Favorite Memory | Revisions to song content |
| Notes | Internal admin notes |

**For Leads:**
| Field | Example Use Case |
|-------|------------------|
| Customer Name | Fix typos |
| Email | Customer wants preview sent to different email |
| Phone | Add missing phone |
| Recipient Name | Fix spelling |
| Special Qualities | Edit before creating song |
| Favorite Memory | Edit before creating song |
| Special Message | Edit content |

### How It Works

1. In the Order/Lead details dialog, click **"Edit"** button
2. Fields become editable text inputs
3. Make changes and click **"Save Changes"**
4. Data is saved to database via backend function
5. Future emails automatically use updated email address

### Email Delivery Behavior

When you change a customer's email address:
- The database is updated immediately
- The next "Resend Delivery Email" or "Send Preview" will go to the **new** email
- Previous emails sent to the old address are unaffected (they were already delivered)

---

## Part 2: Lead-to-Order Conversion

### When to Use

Use this when a customer paid via Stripe but their order wasn't created (webhook failure). The customer contacts support saying they paid, you verify in Stripe, then convert them manually.

### Conversion Flow

```text
1. Customer pays → webhook fails → stuck as "lead"
2. Customer emails support: "I paid but never got my song"
3. Admin verifies payment in Stripe dashboard
4. Admin opens lead in admin panel
5. Admin clicks "Convert to Order" button
6. Enters price paid ($49 or $79)
7. Lead becomes an order with status "paid"
8. Admin uploads song in Orders tab
9. Admin delivers song normally
```

### What Gets Copied

All lead data transfers to the new order:
- Customer info (name, email, phone)
- Recipient info
- Song details (qualities, memory, message)
- Music preferences (genre, singer)
- UTM tracking data
- If song was already uploaded to lead, it carries over

---

## Technical Implementation

### Backend Changes

**File: `supabase/functions/admin-orders/index.ts`**

Add two new actions:

**1. `update_order_fields`** - Update editable fields on an order
```typescript
if (body?.action === "update_order_fields") {
  const orderId = body.orderId;
  const updates = body.updates; // { customer_name, customer_email, etc. }
  
  // Validate: only allow specific fields to be updated
  const allowedFields = [
    "customer_name", "customer_email", "customer_phone",
    "recipient_name", "special_qualities", "favorite_memory",
    "special_message", "notes"
  ];
  
  // Filter to allowed fields only
  const safeUpdates = {};
  for (const field of allowedFields) {
    if (updates[field] !== undefined) safeUpdates[field] = updates[field];
  }
  
  // Update order
  await supabase.from("orders").update(safeUpdates).eq("id", orderId);
}
```

**2. `update_lead_fields`** - Update editable fields on a lead
```typescript
if (body?.action === "update_lead_fields") {
  const leadId = body.leadId;
  const updates = body.updates;
  
  const allowedFields = [
    "customer_name", "email", "phone",
    "recipient_name", "special_qualities", "favorite_memory",
    "special_message"
  ];
  
  // Filter and update
  await supabase.from("leads").update(safeUpdates).eq("id", leadId);
}
```

**3. `convert_lead_to_order`** - Create order from lead
```typescript
if (body?.action === "convert_lead_to_order") {
  const leadId = body.leadId;
  const price = body.price || 4900; // cents
  
  // Get lead
  const { data: lead } = await supabase.from("leads").select("*").eq("id", leadId).single();
  
  // Verify not already converted
  if (lead.status === "converted") throw new Error("Lead already converted");
  
  // Create order
  const orderData = {
    customer_name: lead.customer_name,
    customer_email: lead.email,
    customer_phone: lead.phone,
    recipient_name: lead.recipient_name,
    recipient_type: lead.recipient_type,
    occasion: lead.occasion,
    genre: lead.genre,
    singer_preference: lead.singer_preference,
    special_qualities: lead.special_qualities,
    favorite_memory: lead.favorite_memory,
    special_message: lead.special_message,
    song_url: lead.full_song_url,
    song_title: lead.song_title,
    cover_image_url: lead.cover_image_url,
    price: price,
    pricing_tier: price >= 7900 ? "priority" : "standard",
    status: lead.full_song_url ? "completed" : "paid",
    notes: "Manual conversion from lead",
    utm_source: lead.utm_source,
    utm_medium: lead.utm_medium,
    utm_campaign: lead.utm_campaign,
    utm_content: lead.utm_content,
    utm_term: lead.utm_term,
  };
  
  const { data: order } = await supabase.from("orders").insert(orderData).select().single();
  
  // Mark lead as converted
  await supabase.from("leads").update({
    status: "converted",
    converted_at: new Date().toISOString(),
    order_id: order.id,
  }).eq("id", leadId);
  
  return { success: true, order };
}
```

### Frontend Changes

**File: `src/pages/Admin.tsx` (Order Details Dialog)**

Add edit mode state and editable form:
- Add `isEditing` state
- Add `editedOrder` state to hold temporary edits
- Add "Edit" button that toggles edit mode
- Replace static text with Input/Textarea when editing
- Add "Save" and "Cancel" buttons
- Call `update_order_fields` on save

**File: `src/components/admin/LeadsTable.tsx` (Lead Details Dialog)**

Same pattern:
- Add `isEditing` and `editedLead` states
- Toggle between display and edit modes
- Add "Convert to Order" button (with confirmation dialog)
- Price selection for conversion ($49 Standard / $79 Priority)

---

## UI Design

### Edit Mode for Orders

```
┌─────────────────────────────────────────────────┐
│  Order Details                    [Edit]        │
│  ───────────────────────────────────────────── │
│  Customer                                       │
│  ┌──────────────────────────────────────────┐  │
│  │ John Smith                                │  │ ← Static (view mode)
│  │ john@example.com                          │  │
│  └──────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘

   ↓ Click "Edit" ↓

┌─────────────────────────────────────────────────┐
│  Order Details            [Save] [Cancel]       │
│  ───────────────────────────────────────────── │
│  Customer Name                                  │
│  ┌──────────────────────────────────────────┐  │
│  │ John Smith                                │  │ ← Editable input
│  └──────────────────────────────────────────┘  │
│  Customer Email                                 │
│  ┌──────────────────────────────────────────┐  │
│  │ john@example.com                          │  │ ← Editable input
│  └──────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

### Convert Lead to Order

```
┌─────────────────────────────────────────────────┐
│  Lead Details                                   │
│  ───────────────────────────────────────────── │
│  ... lead info ...                              │
│                                                 │
│  ┌─────────────────────────────────────────────┐
│  │  ⚠️ Convert to Order                        │
│  │                                             │
│  │  Use when customer paid via Stripe but     │
│  │  order wasn't created (webhook failure).   │
│  │                                             │
│  │  Price Paid:                               │
│  │  ○ $49 (Standard)                          │
│  │  ● $79 (Priority)                          │
│  │                                             │
│  │  [Cancel]           [Convert to Order]     │
│  └─────────────────────────────────────────────┘
└─────────────────────────────────────────────────┘
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/admin-orders/index.ts` | Add `update_order_fields`, `update_lead_fields`, `convert_lead_to_order` actions |
| `src/pages/Admin.tsx` | Add edit mode UI for order details dialog |
| `src/components/admin/LeadsTable.tsx` | Add edit mode UI + conversion button/dialog |

---

## Safety Considerations

1. **Field Validation**: Only specific fields can be updated (blocklist prevents changing IDs, status manipulation, etc.)
2. **Email Validation**: Basic format check before saving
3. **Conversion Safeguard**: Lead must not already be converted; confirmation dialog required
4. **Audit Trail**: Converted orders include "Manual conversion from lead" in notes field
5. **No Data Loss**: Original lead record preserved with converted status and linked order_id

---

## How Email Delivery Uses Updated Data

When you change a customer's email in an order:
1. The `orders` table is updated with the new email
2. When you click "Resend Delivery Email" or deliver for the first time
3. The `send-song-delivery` function reads `customer_email` from the database
4. Email is sent to the **updated** address via Brevo

Same for leads - when you update the email and then send a preview, it reads from the database and sends to the new address.
