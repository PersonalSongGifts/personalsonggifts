

## Emergency Fix: Stop Preview Emails to Paying Customers

### Damage Report

| Metric | Count |
|--------|-------|
| Leads with paid orders but NOT marked converted | **270** |
| Preview emails already sent to paying customers | **118** |
| Preview emails queued and about to send | **149** |
| Follow-up emails sent to paying customers | **0** (not yet, but would start in 24h) |
| Customers with **multiple orders** (potential double-charges) | **~17** |

Notable double-charge cases:
- **Teresa** (trasalan@gmail.com) -- 12 orders, $599.88 total
- **Amanda Murphy** (luv_my_marine@hotmail.com) -- 2 orders, $129.98
- Several others with 2 orders each (~$98-99 total)

### What We're Fixing

**Root cause**: When a customer pays, the webhook tries to mark their lead as converted using `.eq("status", "lead")`. But the automation pipeline has usually already changed the status to `"song_ready"`, so the update silently matches zero rows. The lead stays active, and the cron sends them a "buy your song" email 24 hours later.

### Implementation (4 changes + 1 data fix)

**1. Database migration: Bulk-convert 270 corrupted leads**

SQL to mark all affected leads as `converted` with their matching order ID. This immediately cancels all 149 queued preview emails.

**2. Fix stripe-webhook/index.ts (root cause)**

Line 315: Change `.eq("status", "lead")` to `.neq("status", "converted")`
Line 316: Change `.single()` to `.maybeSingle()`

**3. Add purchase guard in process-scheduled-deliveries/index.ts**

At line 929, before the email send loop body: query the orders table for a matching paid order. If found, auto-convert the lead and skip.

**4. Add purchase guard in send-lead-preview/index.ts**

After line 64 (the existing converted check): query orders table by email. If paid order exists, auto-convert and return error.

**5. Add purchase guard in send-lead-followup/index.ts**

After line 64 (same pattern): query orders table by email. If paid order exists, auto-convert and return error.

### Audit Options for Double-Charged Customers

There are ~17 customers with multiple orders. Options:

1. **Manual review**: I can list all 17 with order details so you can decide case-by-case which are legitimate repeat purchases vs. duplicates caused by this bug
2. **Bulk refund duplicates**: Identify orders where the same customer paid twice within a short window (e.g., under 10 minutes) for the same recipient, and refund the second charge
3. **Do nothing for now**: Fix the bug first, then audit at your pace

I'd recommend option 1 -- get the list, then decide. Not all multi-order customers are duplicates (some may be repeat buyers for different recipients).

