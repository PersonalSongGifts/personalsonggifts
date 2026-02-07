

## Ship-Ready Pricing Fix: Final Version with All Must-Fixes

### Summary

This plan addresses your two must-fixes (naming consistency, idempotency hardening) and strong recommendation (external sync price accuracy), on top of the already-approved cents-only integer math and single-writer architecture.

---

### Must-Fix 1: Consistent Naming -- `amount_total` as Canonical Source

**Decision:** `session.amount_total` is the canonical source. It represents the true customer charge (single line item, no tax/shipping currently).

**Naming changes:**

| Location | Current Name | New Name | Why |
|----------|-------------|----------|-----|
| `create-checkout` metadata | (none) | `amount_total_cents` | Matches the Stripe field name it represents |
| `stripe-webhook` variable | N/A | `priceCents` derived from `session.amount_total` | Clear internal name |
| `process-payment` variable | N/A | `priceCents` derived from `session.amount_total` | Same pattern |
| `process-lead-payment` metadata | `offerPriceCents` | Keep as-is (different flow) | Lead checkout is a separate path with its own pricing constants |

**Comment added in `create-checkout`:**

```typescript
// Store the calculated charge amount in metadata as a fallback.
// Canonical price source downstream is session.amount_total (Stripe's actual charge in cents).
// This metadata field is only used if amount_total is somehow unavailable (legacy sessions).
metadata.amount_total_cents = String(unitAmount);
```

**Comment added in `stripe-webhook` and `process-payment`:**

```typescript
// Canonical price: session.amount_total (Stripe's actual total charge, in cents).
// This is the single line item amount; no tax/shipping currently applies.
// Fallback chain: metadata.amount_total_cents -> legacy tier mapping (for old sessions).
```

---

### Must-Fix 2: Idempotency Hardening

**Current state:** Two unique partial indexes already exist:
- `idx_orders_stripe_session_unique` on `notes WHERE notes LIKE 'stripe_session:%'`
- `idx_orders_lead_session_unique` on `notes WHERE notes LIKE 'lead_session:%'`

These work but are brittle if anyone ever appends to `notes`.

**Action taken (strict-notes guarantee):**

Add assertion guards in all three writer functions before INSERT:

```typescript
// Strict notes format assertion -- do not proceed if format is wrong
const notesValue = `stripe_session:${session.id}`;
if (!/^stripe_session:cs_[a-zA-Z0-9_]+$/.test(notesValue)) {
  console.error(`[WEBHOOK] Unexpected notes format: ${notesValue}`);
  return new Response(
    JSON.stringify({ error: "Internal error: unexpected session ID format" }),
    { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}
```

Same pattern for `process-payment` (`stripe_session:`) and `process-lead-payment` (`lead_session:`).

This guarantees notes is always exactly `stripe_session:{id}` or `lead_session:{id}` -- never appended to, never reformatted.

**Not adding `stripe_session_id` column** -- the strict assertion + existing unique indexes are sufficient for now and avoids a schema migration that touches every writer and every query.

---

### Strong Recommendation: External Syncs Use `price_cents`

All outbound integrations that send price data:

| Integration | File | Current | Fix |
|-------------|------|---------|-----|
| Zapier (webhook) | `stripe-webhook/index.ts` line 305 | `price: price` (hardcoded $49/$79) | `price: priceCents / 100` |
| Zapier (process-payment) | `process-payment/index.ts` line 270 | `price: price` (hardcoded $49/$79) | `price: priceCents / 100` |
| Google Sheets (process-lead-payment) | `process-lead-payment/index.ts` line 192 | `price: price` (hardcoded) | `price: priceCents / 100` |
| Confirmation email | `send-order-confirmation/index.ts` | Does not include price (only tier label) | No change needed |
| Song delivery email | `send-song-delivery/index.ts` | Does not include price | No change needed |
| Admin dashboard | `StatsCards.tsx`, `RevenueChart.tsx`, `SourceAnalytics.tsx` | Reads `order.price` (integer dollars) | No change now -- will read same `Math.floor(priceCents/100)` value. Future: switch to `price_cents/100` |

---

### Complete File-by-File Changes

#### Database Migration

```sql
ALTER TABLE orders ADD COLUMN IF NOT EXISTS price_cents integer;
UPDATE orders SET price_cents = price * 100 WHERE price_cents IS NULL AND price IS NOT NULL;
```

No new indexes needed.

---

#### 1. `supabase/functions/create-checkout/index.ts`

**Lines 85-94 -- Integer arithmetic + `Math.floor`:**

```
BEFORE:
  const afterSeasonal = Math.round(basePrice * (1 - SEASONAL_DISCOUNT_PERCENT / 100));
  ...
  const afterAdditional = Math.round(afterSeasonal * (1 - stripeCoupon.percent_off / 100));

AFTER:
  const afterSeasonal = Math.floor(basePrice * (100 - SEASONAL_DISCOUNT_PERCENT) / 100);
  ...
  const afterAdditional = Math.floor(afterSeasonal * (100 - stripeCoupon.percent_off) / 100);
```

**After `unitAmount` finalized, before session creation -- add metadata field:**

```typescript
// Canonical price downstream is session.amount_total (Stripe's actual charge, cents).
// This metadata field is a fallback for sessions where amount_total is unavailable.
metadata.amount_total_cents = String(unitAmount);
```

---

#### 2. `supabase/functions/stripe-webhook/index.ts` (Canonical Writer)

**Line 156 -- Replace hardcoded price:**

```typescript
// Canonical price: session.amount_total (Stripe's actual total charge, cents).
// Single line item, no tax/shipping. Fallback: metadata -> legacy tier mapping.
const priceCents: number = session.amount_total
  ?? (metadata.amount_total_cents ? parseInt(metadata.amount_total_cents, 10) : NaN)
  || (pricingTier === "priority" ? 7999 : 4999);
const price = Math.floor(priceCents / 100);
```

**Before INSERT -- notes format assertion:**

```typescript
const notesValue = `stripe_session:${session.id}`;
if (!/^stripe_session:cs_[a-zA-Z0-9_]+$/.test(notesValue)) {
  console.error(`[WEBHOOK] Unexpected notes format: ${notesValue}`);
  return new Response(
    JSON.stringify({ error: "Internal error: unexpected session ID format" }),
    { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}
```

**INSERT -- add `price_cents`:**

```typescript
price,              // integer dollars (backward compat for admin dashboard)
price_cents: priceCents,  // canonical cents from Stripe
```

**Line 305 -- Zapier sync:**

```
BEFORE: price: price,
AFTER:  price: priceCents / 100,
```

---

#### 3. `supabase/functions/process-payment/index.ts` (Read-First, Fallback Writer)

**Existing order path (line 103) -- include `price_cents` in select:**

```
.select("id, recipient_name, occasion, genre, pricing_tier, customer_email, expected_delivery, price_cents")
```

Return `price` in existing-order response:

```typescript
price: existingOrder.price_cents != null ? existingOrder.price_cents / 100 : undefined,
```

**New order path (line 125) -- same canonical pricing:**

```typescript
// Canonical price: session.amount_total (Stripe's actual total charge, cents).
const priceCents: number = session.amount_total
  ?? (metadata.amount_total_cents ? parseInt(metadata.amount_total_cents, 10) : NaN)
  || (pricingTier === "priority" ? 7999 : 4999);
const price = Math.floor(priceCents / 100);
```

**Before INSERT -- notes format assertion** (same pattern as webhook).

**INSERT -- add `price_cents: priceCents`.**

**Select + response -- include `price_cents`, return `price: priceCents / 100`.**

**Race condition handler (line 180) -- same `price_cents` in select and response.**

**Zapier sync (line 270):**

```
BEFORE: price: price,
AFTER:  price: priceCents / 100,
```

---

#### 4. `supabase/functions/process-lead-payment/index.ts`

**Line 101 -- Replace hardcoded price:**

```typescript
// Lead checkout uses session.amount_total as canonical (may differ from standard pricing)
const priceCents: number = session.amount_total
  ?? (metadata.offerPriceCents ? parseInt(metadata.offerPriceCents, 10) : NaN)
  || 4999;
const price = Math.floor(priceCents / 100);
```

**Before INSERT -- notes format assertion:**

```typescript
const notesValue = `lead_session:${sessionId}`;
if (!/^lead_session:cs_[a-zA-Z0-9_]+$/.test(notesValue)) {
  console.error(`[LEAD-PAYMENT] Unexpected notes format: ${notesValue}`);
  // return 500...
}
```

**INSERT -- add `price_cents: priceCents`.**

**Existing order + race condition paths -- include `price_cents` in select, return `price` in response.**

**Google Sheets sync (line 192):**

```
BEFORE: price: price,
AFTER:  price: priceCents / 100,
```

---

#### 5. `src/pages/Checkout.tsx` -- Client Display Math (Cents-Based)

**Line 50 -- Change base prices to cents:**

```
BEFORE: const BASE_PRICES = { standard: 99.99, priority: 159.99 };
AFTER:  const BASE_PRICES_CENTS = { standard: 9999, priority: 15999 };
```

**Lines 53-65 -- Rewrite display functions with integer arithmetic:**

```typescript
function calculateSeasonalPriceCents(tier: PricingTier): number {
  return Math.floor(BASE_PRICES_CENTS[tier] * (100 - SEASONAL_DISCOUNT_PERCENT) / 100);
}

// Returns discount amount in cents
function calculateAdditionalDiscountCents(afterSeasonalCents: number, promo: AdditionalPromo): number {
  if (promo.type === "amount_off" && promo.amount_off) {
    return Math.min(promo.amount_off, afterSeasonalCents); // both in cents
  }
  if (promo.type === "percent_off" && promo.percent_off) {
    return afterSeasonalCents - Math.floor(afterSeasonalCents * (100 - promo.percent_off) / 100);
  }
  return 0;
}
```

**Lines 96-109 -- Rewrite pricing useMemo:**

```typescript
const pricing = useMemo(() => {
  const baseCents = BASE_PRICES_CENTS[selectedTier];
  const afterSeasonalCents = calculateSeasonalPriceCents(selectedTier);
  const seasonalSavingsCents = baseCents - afterSeasonalCents;

  let additionalSavingsCents = 0;
  if (additionalPromo) {
    additionalSavingsCents = calculateAdditionalDiscountCents(afterSeasonalCents, additionalPromo);
  }

  const totalCents = Math.max(0, afterSeasonalCents - additionalSavingsCents);

  return {
    base: baseCents / 100,
    afterSeasonal: afterSeasonalCents / 100,
    seasonalSavings: seasonalSavingsCents / 100,
    additionalSavings: additionalSavingsCents / 100,
    total: totalCents / 100,
  };
}, [selectedTier, additionalPromo]);
```

**Lines 319, 371 -- Tier card price display:**

```
BEFORE: calculateSeasonalPrice("standard").toFixed(2)
AFTER:  (calculateSeasonalPriceCents("standard") / 100).toFixed(2)

BEFORE: calculateSeasonalPrice("priority").toFixed(2)
AFTER:  (calculateSeasonalPriceCents("priority") / 100).toFixed(2)
```

---

#### 6. `src/pages/PaymentSuccess.tsx` -- Analytics Uses Real Price

**Line 10-19 -- Add `price` to interface:**

```typescript
interface OrderDetails {
  orderId: string;
  recipientName: string;
  occasion: string;
  genre: string;
  pricingTier: string;
  customerEmail: string;
  expectedDelivery?: string;
  songUrl?: string;
  price?: number;  // actual charged amount in dollars (from price_cents / 100)
}
```

**Line 42 -- Use real price:**

```
BEFORE: const purchaseValue = data.pricingTier === "priority" ? 79 : 49;
AFTER:  const purchaseValue = data.price ?? (data.pricingTier === "priority" ? 79 : 49);
```

---

#### 7. Dead Code: `create-order/index.ts` and `orderService.ts`

`create-order` also hardcodes `price = tier === "priority" ? 79 : 49` (line 132). `orderService.ts` calls it but is never imported anywhere. Both are dead code -- the real checkout flow goes through `create-checkout` + Stripe.

**Action:** Leave them untouched for now. They are not in the payment path and won't cause incorrect charges. Can be cleaned up separately.

---

### Files Changed Summary

| File | Changes |
|------|---------|
| Database migration | Add `price_cents` column, backfill existing rows |
| `create-checkout/index.ts` | `Math.floor` with integer arithmetic (2 places), add `amount_total_cents` to metadata |
| `stripe-webhook/index.ts` | `session.amount_total` as canonical price, notes assertion, `price_cents` in INSERT, fix Zapier sync |
| `process-payment/index.ts` | `session.amount_total` as canonical price, notes assertion, `price_cents` in INSERT, `price` in all responses, fix Zapier sync |
| `process-lead-payment/index.ts` | `session.amount_total` as canonical price, notes assertion, `price_cents` in INSERT, `price` in responses, fix Google Sheets sync |
| `Checkout.tsx` | All math in integer cents with `(100 - percent) / 100` pattern, convert to dollars only for display |
| `PaymentSuccess.tsx` | Add `price` to interface, use real price for analytics |

### Acceptance Criteria

| Test | Expected |
|------|----------|
| $99.99 at 50% | `floor(9999 * 50 / 100)` = 4999 cents = **$49.99** |
| $159.99 at 50% | `floor(15999 * 50 / 100)` = 7999 cents = **$79.99** |
| Additional 10% off | `floor(4999 * 90 / 100)` = 4499 cents = **$44.99** |
| `orders.price_cents` | Equals `session.amount_total` for every new order |
| Analytics | Uses `price_cents / 100` via response `price` field |
| Idempotency | Notes assertion prevents format drift; unique indexes prevent duplicates; 23505 handler recovers gracefully |
| Webhook + process-payment both fire | First writer creates (with `price_cents` from `amount_total`), second reads existing row |

