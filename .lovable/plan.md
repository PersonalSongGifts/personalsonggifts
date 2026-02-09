

# Add "Approve for Delivery" Button

## What's Changing

When an order has `delivery_status = "needs_review"`, it's blocked from automatic delivery by the cron job. Currently, an admin has no quick way to clear this flag -- they'd have to know to manually change the delivery status. This adds a prominent "Approve for Delivery" button that clears the review flag and sets the delivery status back to `scheduled` so the cron picks it up at the scheduled time.

## Changes

### File: `src/pages/Admin.tsx`

**1. Add an "Approve for Delivery" handler function**

A new async function `handleApproveForDelivery` that calls the existing `admin-orders` edge function with `action: "update_order_fields"` to set `delivery_status: "scheduled"`. This reuses the existing backend endpoint -- no edge function changes needed.

**2. Add the button in the order detail dialog**

Insert a visible banner + button in the order detail view that appears only when `delivery_status === "needs_review"`. It will be placed prominently near the top of the order detail content (after the song details section, before the upload section), styled with an amber/warning background to draw attention.

The banner will look like:

```text
+--------------------------------------------------+
| This order needs review before delivery.         |
| The song was generated but inputs were changed.  |
|                                                  |
|              [Approve for Delivery]              |
+--------------------------------------------------+
```

**Technical details:**
- The button calls `update_order_fields` with `{ delivery_status: "scheduled" }` via the existing `admin-orders` edge function
- On success, it refreshes the orders list and shows a success toast
- The button is disabled while the request is in-flight
- No new state variables needed beyond reusing `updating` for the loading state

