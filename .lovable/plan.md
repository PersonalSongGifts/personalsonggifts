
# Fix "Approve for Delivery" Error

## Problem
The "Approve for Delivery" button sends `{ delivery_status: "scheduled" }` to the `update_order_fields` action, but `delivery_status` is **not included in the allowed fields whitelist** in the `admin-orders` edge function. This causes a 400 error: "No valid fields to update".

## Fix

### `supabase/functions/admin-orders/index.ts`
Add `"delivery_status"` to the `allowedFields` array (around line 729):

```
const allowedFields = [
  "customer_name", "customer_email", "customer_phone",
  "recipient_name", "recipient_name_pronunciation",
  "occasion", "genre", "singer_preference",
  "special_qualities", "favorite_memory",
  "special_message", "notes",
  "customer_email_override", "customer_email_cc",
  "lyrics_language_code",
  "sms_opt_in",
  "delivery_status"   // <-- add this
];
```

This is a one-line change. The edge function will then accept the `delivery_status` update and set it to `"scheduled"`, allowing the cron job to pick it up for delivery.
