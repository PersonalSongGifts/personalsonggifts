

## Revised Plan — Download Unlock Webhook Fix + Safer Validation

### Root cause confirmed
The `stripe-webhook` has early-return handlers for `lyrics_unlock` (line 126) and `leadId` (line 191), but **no handler for `download_unlock`**. The download checkout session (`create-download-checkout`) sets `metadata.entitlement = "download_unlock"`, but the webhook ignores it and falls through to creating a blank order.

### What I changed from the original plan

**Removed the webhook "creative field safety net"**. The original plan said: "before the order INSERT, skip if creative fields are empty." This is **dangerous** — if Stripe ever truncates metadata for a legitimate $50+ order, the customer pays but silently gets no order. A broken order is visible and fixable. A silently dropped order is lost revenue and a CS nightmare. The download_unlock handler alone fixes the actual bug.

### Changes (3 items, not 4)

**1. `supabase/functions/stripe-webhook/index.ts` — Add download_unlock early-return handler**
- Insert right after the lyrics_unlock handler (after line 164), before Supabase init at line 167
- Check `sessionMetadata.entitlement === "download_unlock"`
- Validate `orderId` from metadata (same UUID regex as lyrics handler)
- Update the order: `download_unlocked_at`, `download_unlock_session_id`, `download_unlock_payment_intent_id`, `download_price_cents`
- Idempotent: only update where `download_unlocked_at IS NULL`
- Log activity, return early — never falls through to order creation
- This mirrors lines 126-164 exactly

**2. `supabase/functions/create-checkout/index.ts` — Strengthen input validation**
- Expand line 181 validation to also require `occasion`, `genre`, `singerPreference`, `specialQualities`, `favoriteMemory` as non-empty
- This is safe because:
  - The frontend form already validates all these fields before allowing checkout
  - Lead conversions use a separate function (`create-lead-checkout`), not this one
  - Download/lyrics upsells use their own separate functions
  - Free test codes still go through the form, which requires all fields

**3. Migration — Cancel the broken order**
- `UPDATE orders SET status = 'cancelled' WHERE id::text ILIKE 'B59B6978%'`

### Touch points verified safe

| Flow | Uses `create-checkout`? | Uses `stripe-webhook`? | Impact |
|------|------------------------|----------------------|--------|
| Normal song purchase | Yes | Yes (order insert path) | No change — fields always present from form |
| Free test codes (HYPERDRIVETEST etc.) | Yes (then skips Stripe) | No | Stricter validation, but form always fills fields |
| Lead conversion | No (`create-lead-checkout`) | Yes (leadId early return) | Untouched |
| Lyrics unlock | No (`create-lyrics-checkout`) | Yes (lyrics_unlock early return) | Untouched |
| Download unlock | No (`create-download-checkout`) | Yes (**NEW handler**) | Fixed — no longer falls through |
| PayPal orders | No (separate flow) | No | Untouched |

### Files
| File | Change |
|------|--------|
| `supabase/functions/stripe-webhook/index.ts` | Add `download_unlock` early-return handler after lyrics handler |
| `supabase/functions/create-checkout/index.ts` | Require 5 creative fields in validation |
| Migration SQL | Cancel order B59B6978 |

