

## Easter Flash Sale — Reusable Promotions System (Updated Plan)

All 6 requested items are now included. Rush tier confirmed as not applicable (2-tier system only).

---

### Step 1: Database Migration

**New table: `promotions`**
- id, name, slug (unique), standard_price_cents, priority_price_cents, lead_price_cents (all integer NOT NULL)
- starts_at, ends_at (timestamptz NOT NULL)
- is_active (boolean default false), show_banner (boolean default true)
- banner_text, banner_emoji (text)
- email_leads (boolean default false), email_leads_days (integer default 30)
- email_subject, email_body_template (text)
- email_batch_sent, email_batch_total (integer default 0)
- created_at (timestamptz default now())
- RLS enabled, no public policies
- Unique partial index: `CREATE UNIQUE INDEX idx_promotions_no_overlap ON promotions (is_active) WHERE is_active = true;`

**Alter `leads` table:**
- Add `last_promo_email_sent_at timestamptz`

---

### Step 2: Edge Function — `get-active-promo`

Public endpoint. Query `promotions` where `is_active = true AND now() >= starts_at AND now() <= ends_at`. Returns promo data or `{ active: false }`. Cache-Control: public, max-age=60.

---

### Step 3: Shared `useActivePromo` hook

**New file: `src/hooks/useActivePromo.ts`**

A React context + hook that fetches `get-active-promo` once on app mount and exposes the result to all consumers. `PromoBanner`, `Checkout`, and `SongPreview` all use this hook instead of making independent fetch calls. Includes loading state and error handling. Falls back to `{ active: false }` on error.

Wrap the app with `<ActivePromoProvider>` in `App.tsx`.

---

### Step 4: Edge Function — `admin-promos`

Admin-authed via `x-admin-password`. Supports:
- **GET**: List all promos with computed status (active/upcoming/expired/inactive)
- **POST**: Create/update with validation (prices > 0, starts < ends, slug URL-safe, no overlapping active)
- **POST action=dry_run_lead_emails**: Returns `{ eligibleCount, sampleEmails }` (first 10 emails) without sending. Query uses `LOWER(TRIM(email))` for matching.
- **POST action=send_lead_emails**: Same query as dry run but actually sends. Brevo batches of 50, kill-switch check every batch, sets `last_promo_email_sent_at`. Email exclusion query uses `LOWER(TRIM())` on all email comparisons (leads, orders, suppressions).

---

### Step 5: Admin Panel — Promos Tab

Add 8th tab "Promos" (Tag icon) to `Admin.tsx` (change `grid-cols-7` → `grid-cols-8`). New `PromosPanel.tsx` with:
- Promo list with status badges
- Create/edit form (prices in dollars → stored as cents)
- Activate/deactivate with confirmation dialog
- **"Dry Run" button** → shows eligible count + sample emails before committing
- "Send Lead Emails" button with confirmation
- Email progress bar

---

### Step 6: Backend — `create-checkout/index.ts` (Stripe)

Before seasonal discount math, query active promo. Priority order: **free test codes → discount test codes → promo prices → seasonal discount**.

If promo found:
- Use `standard_price_cents` / `priority_price_cents` directly
- Set `allow_promotion_codes: false`
- Add `promoSlug`/`promoName` to metadata

**If frontend sends `promoSlug` but promo is expired/inactive → return HTTP 400 `{ error: "promo_expired" }`.** Do NOT silently fall back to higher price.

---

### Step 7: Backend — `create-paypal-order/index.ts` (PayPal)

Identical promo logic as Step 6. Same active promo query, same price override, same `promo_expired` error handling. Must produce identical cent amounts as Stripe.

---

### Step 8: Backend — `create-lead-checkout/index.ts`

Accept optional `promoSlug`. If valid active promo → use `lead_price_cents`, set `allow_promotion_codes: false`.

**When promo is active: BOTH `applyFollowupDiscount` AND `applyVday10Discount` are completely ignored.** Promo price takes total precedence — no stacking of any kind.

**If `promoSlug` sent but promo expired → return HTTP 400 `{ error: "promo_expired" }`.** Same pattern as Stripe/PayPal.

If no `promoSlug` provided: existing logic unchanged (followup/vday10 still work).

---

### Step 9: Frontend — `Checkout.tsx`

Use `useActivePromo()` hook. If active:
- Override pricing with promo prices (skip seasonal calc)
- Strikethrough: ~~$99.99~~ → $24.99 / ~~$159.99~~ → $34.99
- Show promo name, hide additional promo code input
- Pass `promoSlug` to `create-checkout` and `create-paypal-order`

**`promo_expired` error handling:** If checkout returns `{ error: "promo_expired" }`:
1. Show toast: "This sale has ended"
2. Invalidate the promo context (re-fetch `get-active-promo`)
3. Re-render with normal seasonal prices

Fallback: if no promo or fetch error → existing behavior unchanged.

---

### Step 10: Frontend — `SongPreview.tsx`

Use `useActivePromo()` hook. Also read `?promo=` URL param. If active:
- Show `leadPriceCents` with strikethrough ~~$49.99~~
- Show promo banner text
- Pass `promoSlug` to `create-lead-checkout`

**`promo_expired` error handling:** Same as Checkout — toast "This sale has ended", re-fetch promo, re-render with $49.99.

If `?promo=` param present but no active promo → show normal $49.99 gracefully, no error.

---

### Step 11: Frontend — `PromoBanner.tsx`

Use `useActivePromo()` hook. If active + showBanner → display `bannerText`. If no promo → fall back to existing "50% Off" banner.

---

### Step 12: Lead Email Blast (inside `admin-promos`)

Email exclusion query — **all comparisons use `LOWER(TRIM(email))`**:
```sql
WHERE LOWER(TRIM(l.email)) NOT IN (SELECT LOWER(TRIM(email)) FROM email_suppressions)
  AND LOWER(TRIM(l.email)) NOT IN (SELECT LOWER(TRIM(customer_email)) FROM orders)
  AND l.status != 'converted'
  AND l.last_promo_email_sent_at IS NULL
  AND l.captured_at >= now() - interval '{N} days'
```

Same query for both `dry_run_lead_emails` (returns count + samples) and `send_lead_emails` (actually sends).

---

### Files Changed

| # | File | Type |
|---|------|------|
| 1 | Migration SQL | New `promotions` table + `leads.last_promo_email_sent_at` |
| 2 | `supabase/functions/get-active-promo/index.ts` | New |
| 3 | `supabase/functions/admin-promos/index.ts` | New (CRUD + dry run + email blast) |
| 4 | `src/hooks/useActivePromo.ts` | New (shared hook/context) |
| 5 | `src/App.tsx` | Wrap with `ActivePromoProvider` |
| 6 | `src/components/admin/PromosPanel.tsx` | New |
| 7 | `src/pages/Admin.tsx` | Add 8th tab |
| 8 | `supabase/functions/create-checkout/index.ts` | Promo lookup + `promo_expired` error |
| 9 | `supabase/functions/create-paypal-order/index.ts` | Same |
| 10 | `supabase/functions/create-lead-checkout/index.ts` | Promo lookup + ignore followup/vday10 + `promo_expired` error |
| 11 | `src/pages/Checkout.tsx` | Use `useActivePromo`, handle `promo_expired` |
| 12 | `src/pages/SongPreview.tsx` | Use `useActivePromo`, handle `promo_expired` |
| 13 | `src/components/layout/PromoBanner.tsx` | Use `useActivePromo` |

### Rollback
Set `is_active = false` → all pages revert within 60s. Email blast stops within 50 sends.

