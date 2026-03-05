

## Fix: Lead Payments Not Creating Orders + Broken Manual Conversion

### Root Cause

**Problem 1 — Webhook skips lead payments (lines 190-196 of stripe-webhook):**
When a customer pays through a lead checkout, the Stripe webhook sees `metadata.leadId` and returns immediately with "skipped - handled by process-lead-payment." The actual order creation depends on the frontend `PaymentSuccess` page calling `process-lead-payment`. If the user closes the browser, has a slow connection, or the redirect fails, no order is ever created.

**Problem 2 — Manual conversion missing fields (lines 1342-1368 of admin-orders):**
The `convert_lead_to_order` action is missing these critical fields:
- `automation_lyrics` — lyrics never appear
- `automation_status` — automation pipeline doesn't know state
- `lyrics_language_code` — defaults to 'en' instead of actual
- `inputs_hash` — change detection breaks
- `recipient_name_pronunciation`
- `phone_e164`, `sms_opt_in`, `timezone`
- `prev_automation_lyrics`, `prev_song_url`, `prev_cover_image_url`
- `delivered_at` — never set even when song exists

Also sets status to `"completed"` when song exists, but the song player page filters for `"delivered"` or `"ready"`, so the customer gets "Song not found."

### Plan (3 changes + 1 backfill)

#### 1. Fix `stripe-webhook/index.ts` — Handle lead payments server-side

Replace the early-return skip (lines 190-196) with full order creation logic:

- Fetch the lead record by `metadata.leadId`
- Check idempotency (existing order with `notes = lead_session:{session.id}`)
- Create order with ALL fields from the lead (same as `process-lead-payment` does)
- Set status to `"delivered"` if `full_song_url` exists, else `"paid"`
- Set `delivered_at` when song exists
- Copy `automation_lyrics`, `automation_status`, `lyrics_language_code`, `inputs_hash`, `song_url`, `song_title`, `cover_image_url`
- Mark lead as converted
- Trigger fallback lyrics generation if missing
- Send delivery email if song exists
- Log activity

This makes the webhook the **primary** handler. The existing `process-lead-payment` frontend call becomes a harmless duplicate (idempotent via the `notes` check).

#### 2. Fix `admin-orders/index.ts` — Fix `convert_lead_to_order` action

Update the order creation block (lines 1342-1368) to include all missing fields:

- Add `automation_lyrics`, `automation_status`, `lyrics_language_code`, `inputs_hash`
- Add `recipient_name_pronunciation`, `phone_e164`, `sms_opt_in`, `timezone`
- Add `prev_automation_lyrics`, `prev_song_url`, `prev_cover_image_url`
- Change status from `"completed"` to `"delivered"` when `full_song_url` exists
- Set `delivered_at` to `now()` when song exists
- Set `price_cents` (price * 100)
- After creating order, trigger lyrics generation if `automation_lyrics` is null and song exists

#### 3. Create `supabase/functions/backfill-lead-orders/index.ts` — Fix existing broken orders

New edge function to repair orders that were manually converted without full data:

- Find orders where `source = 'lead_conversion'` and `automation_lyrics IS NULL` and `song_url IS NOT NULL`
- For each, look up the original lead by `order_id` match or email match
- Copy missing fields from lead to order
- Fix status from `"completed"` to `"delivered"` where applicable
- Set `delivered_at` if missing
- Trigger lyrics generation for any still-missing lyrics
- Protected by `ADMIN_PASSWORD`
- Add to `supabase/config.toml`

#### 4. Route + Config

- Add `backfill-lead-orders` to `supabase/config.toml` with `verify_jwt = false`

### Files

| Action | File |
|--------|------|
| Modify | `supabase/functions/stripe-webhook/index.ts` |
| Modify | `supabase/functions/admin-orders/index.ts` |
| Create | `supabase/functions/backfill-lead-orders/index.ts` |
| Modify | `supabase/config.toml` |

