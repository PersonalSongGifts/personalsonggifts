

## Safety Verification: Nothing Breaks, Full Rollback Available

### Confirmed: Two Isolated Checkout Pipelines

The system has two completely separate payment flows. Our changes only touch the lead conversion path, and only when a specific URL parameter is present.

```text
Pipeline 1: New Customers (UNTOUCHED)
/create --> /checkout --> create-checkout --> stripe-webhook --> order created
   |                        |
   |                        +-- validate-promo-code (UNTOUCHED)
   |                        +-- Seasonal 50% + Stripe coupon stacking (UNTOUCHED)
   +-- Promo code input on page (UNTOUCHED)

Pipeline 2: Lead Conversions (MINOR CHANGE, GATED BY URL PARAM)
/preview/:token --> create-lead-checkout --> process-lead-payment --> order created
                       |
                       +-- NEW: if ?vday10=true, subtract $10 from unit amount
                       +-- allow_promotion_codes: true (UNCHANGED)
                       +-- Everything else identical
```

### What Cannot Break

1. **Main checkout flow** (`/checkout` page, `create-checkout` function, `validate-promo-code` function): Zero lines of code changed. All existing promo codes (VALENTINES50, WELCOME50, HYPERDRIVETEST, Stripe coupons) work exactly as they do today.

2. **Lead preview page without ?vday10=true**: Renders identically to today. Same $49.99 price, same followup $44.99 logic, same checkout call with no discount flag.

3. **Stripe webhook and order recording**: Uses `session.amount_total` as canonical price source. Works with any dollar amount. No metadata format changes, no notes format changes.

4. **Admin dashboard and fulfillment**: No changes to order management, song upload, delivery, or automation functions.

5. **Existing leads and orders**: The new `last_valentine_remarketing_sent_at` column is nullable with no default. Existing rows are unaffected.

### Rollback Options (Instant, No Deploy Required)

| Scenario | Action | Effect |
|----------|--------|--------|
| Stop all remarketing sends | Set `paused: true` in admin panel | Sends stop within 50 emails |
| Disable $10 discount for new clicks | Remove `?vday10=true` from email links (already sent links still work) | New visitors see normal $49.99 |
| Full revert of discount logic | One-line code change: remove the `if (applyVday10Discount)` block | All preview pages show $49.99 regardless of URL params |
| Undo suppression table | Table is additive only, does not affect any existing queries | No rollback needed |

### Price Math Verification (Integer Cents, No Floats)

All calculations use integer arithmetic with `Math.floor` and `Math.max(0, ...)`:

| Scenario | Calculation | Result | Where |
|----------|------------|--------|-------|
| Normal lead checkout | 4999 | $49.99 | create-lead-checkout (unchanged) |
| Followup lead checkout | 4499 | $44.99 | create-lead-checkout (unchanged) |
| VDay10 lead checkout | 4999 - 1000 = 3999 | $39.99 | create-lead-checkout (new path) |
| VDay10 + followup | 4499 - 1000 = 3499 | $34.99 | create-lead-checkout (new path) |
| Normal new customer checkout | 9999 * 50/100 = 4999 | $49.99 | create-checkout (UNTOUCHED) |
| Priority new customer checkout | 15999 * 50/100 = 7999 | $79.99 | create-checkout (UNTOUCHED) |

### Downstream Recording (Stripe Webhook + Process-Lead-Payment)

Both functions use the same canonical price pattern:

```text
priceCents = session.amount_total ?? metadata fallback ?? legacy default
```

Whatever Stripe charges (3999 for VDay10, 4999 for normal) flows correctly into `price_cents` on the order. No special handling needed.

### Campaign Control Kill Switch

The admin panel provides immediate control:
- **Pause**: Stops sends within one chunk (50 emails max overshoot)
- **Resume**: Continues from where it left off (idempotent via `last_valentine_remarketing_sent_at`)
- **Batch size**: Adjustable without code deploy
- **Canary first**: Initial 100-email batch before full rollout

### Files Changed Summary

| File | Risk Level | Rollback |
|------|-----------|----------|
| `create-lead-checkout` | Low (new optional param, default = no change) | Remove 5 lines |
| `SongPreview.tsx` | Low (gated by URL param, default = no change) | Remove 15 lines |
| `Unsubscribe.tsx` | None (additive API call, graceful failure) | Remove API call |
| `send-valentine-remarketing` (new) | None (new function, does not affect existing code) | Delete function |
| `unsubscribe-email` (new) | None (new function, writes to new table only) | Delete function |
| `ValentineRemarketingPanel` (new) | None (new UI component in admin panel) | Remove import |
| Database: `last_valentine_remarketing_sent_at` column | None (nullable, no default, no constraints) | Drop column |
| Database: `email_suppressions` table | None (new table, not referenced by existing code) | Drop table |

### Bottom Line

Every change is additive and gated. The existing pricing, coupon, checkout, webhook, and fulfillment flows are untouched. The campaign can be paused instantly from the admin panel, and the discount logic can be fully reverted with a one-line code change. Ready to implement on your approval.

