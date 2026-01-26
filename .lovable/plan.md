
# Orders Database + Zapier Integration

## Overview
Set up Supabase (via Lovable Cloud) as your source of truth for all song orders, with automatic webhook triggers to push order data to Google Sheets via Zapier for manual fulfillment.

## What You'll Get

**Supabase Database (Source of Truth)**
- All orders stored securely with unique order IDs
- Order status tracking (pending, in_progress, completed, delivered)
- Timestamps for submissions and expected delivery
- Song URL storage for completed songs
- Ready for future admin dashboard

**Zapier Integration (Fulfillment View)**
- Automatic push to Google Sheets when orders are placed
- No manual data entry required
- Sheet stays in sync with every new order

---

## Data Flow

```text
Customer completes checkout
         |
         v
+------------------+
|  Save to         |
|  Supabase        |  <-- Source of truth
|  (orders table)  |
+------------------+
         |
         v
+------------------+
|  Send to         |
|  Zapier Webhook  |  <-- Triggers Google Sheets row
+------------------+
         |
         v
+------------------+
|  Google Sheets   |
|  (fulfillment)   |  <-- Manual work happens here
+------------------+
```

---

## Implementation Steps

### Step 1: Enable Lovable Cloud
Spin up Supabase backend for your project (no external account needed)

### Step 2: Create Orders Table
Database table with all order fields:

| Column | Type | Purpose |
|--------|------|---------|
| id | UUID | Unique order identifier |
| created_at | Timestamp | When order was placed |
| status | Text | pending, in_progress, completed, delivered |
| pricing_tier | Text | standard or priority |
| price | Integer | 49 or 79 |
| expected_delivery | Timestamp | Based on tier selection |
| customer_name | Text | Buyer's name |
| customer_email | Text | Buyer's email |
| customer_phone | Text | Phone for SMS updates (optional) |
| recipient_type | Text | Who song is for (husband, wife, etc.) |
| recipient_name | Text | Recipient's name |
| occasion | Text | Birthday, wedding, etc. |
| genre | Text | Music genre |
| singer_preference | Text | Male or Female |
| relationship | Text | Relationship description |
| special_qualities | Text | What makes them special |
| favorite_memory | Text | Shared memory |
| special_message | Text | Message from the heart |
| song_url | Text | Completed song link (filled later) |
| delivered_at | Timestamp | When song was delivered |
| notes | Text | Internal notes |
| device_type | Text | Desktop/Mobile |

### Step 3: Create Order Service
New file with functions to:
- Generate unique order IDs
- Insert orders into database
- Send data to Zapier webhook

### Step 4: Update Checkout Page
Modify the "Complete Payment" button to:
1. Save order to Supabase
2. Trigger Zapier webhook
3. Navigate to confirmation with order ID
4. Show loading state during submission
5. Handle errors gracefully

### Step 5: Update Confirmation Page
- Display the unique order ID
- Pull order details from location state (already passed)

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| Supabase migration | Create | Set up orders table schema |
| `src/lib/orderService.ts` | Create | Order creation + Zapier webhook logic |
| `src/pages/Checkout.tsx` | Modify | Add order submission on checkout |
| `src/pages/Confirmation.tsx` | Modify | Display order ID |

---

## Technical Details

### Order Service Implementation
```text
createOrder(formData, tier, webhookUrl?)
  |
  +-- Generate order ID
  +-- Calculate expected delivery time
  +-- Insert into Supabase
  +-- If webhook URL provided, POST to Zapier
  +-- Return order ID
```

### Zapier Webhook Payload
All form fields plus:
- Order ID (for matching records)
- Submitted timestamp
- Expected delivery timestamp
- Pricing tier and price
- Device type

### Error Handling
- If Supabase insert fails: Show error, don't proceed
- If Zapier webhook fails: Log error but still proceed (order is safe in Supabase)
- Loading state prevents double-submissions

---

## Action Required From You

**Before implementation:**
1. Approve this plan so I can enable Lovable Cloud

**After implementation:**
1. Create your Zapier "Catch Hook" trigger
2. Provide the webhook URL so I can add it to the code
3. Connect the Zap to your Google Sheet with column mapping

---

## Future Enhancements (After This)

Once this is working, you can build:
- **Admin Dashboard**: View all orders, update status, add song URLs
- **Customer Order Lookup**: Let customers check their order status
- **Stripe Integration**: Real payments before order submission
- **Email Notifications**: Automated order confirmations
