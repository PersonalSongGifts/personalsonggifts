

## Fix: Revision token not appearing on thank-you page

### Problem
The "Make changes here" revision link is already coded into the PaymentSuccess page, but it never shows because the `revision_token` is not being selected from the database after order creation.

In `stripe-webhook/index.ts` line 275, the `.select()` clause only picks specific columns and omits `revision_token`:
```
.select("id, recipient_name, occasion, genre, pricing_tier, customer_email, expected_delivery")
```

The database auto-generates `revision_token` via `DEFAULT gen_random_uuid()`, but since it's not in the select, it's never returned -- so it can't be passed to the confirmation email or to `process-payment`.

### Fix (1 line change)
Update the `.select()` in `supabase/functions/stripe-webhook/index.ts` (line 275) to include `revision_token`:
```
.select("id, recipient_name, occasion, genre, pricing_tier, customer_email, expected_delivery, revision_token")
```

Similarly, in `process-payment/index.ts`, verify the select clause when fetching existing orders also includes `revision_token` (it likely queries from the orders table too).

### Result
- The thank-you page will show: "Need to update details before your song is created? Make changes here"
- The confirmation email will include the revision link
- No database changes needed -- the column already exists with a default value

