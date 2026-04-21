

## You're right — the "$10-off / $39.99" label is wrong

### What's actually happening

The followup email pricing **does** dynamically pull from the active promo (the code reads `lead_price_cents` from the `promotions` table). Right now your active promo is **Early Mother's Day @ $29.99** (`lead_price_cents = 2999`), so the email is correctly showing **$29.99 vs. $99.99**, not $39.99.

The bug is purely in the **dashboard label**. In `LeadFollowupPanel.tsx` (and/or `FunnelInsights.tsx`) the text "$10-off / $39.99 followup converts at 1.44%" is a **hardcoded string** — it never reads the actual promo price.

So:
- ✅ Customers see the correct $29.99 offer
- ❌ Admin dashboard says "$39.99" because that string was hardcoded back when the fallback (no-promo) price was $39.99
- ⚠️ The 1.44% conversion rate itself is accurate — it's just labeled with the wrong price

### The fix

Replace the hardcoded label with a dynamic one driven by the active promo:

1. **Find the hardcoded string** in the admin followup analytics card (`src/components/admin/LeadFollowupPanel.tsx` and/or `FunnelInsights.tsx` — wherever the "$10-off / $39.99 followup converts at X%" text lives).

2. **Fetch the active promo price** the same way `send-lead-followup` does: query `promotions` where `is_active=true` and current time is between `starts_at` and `ends_at`. Use the existing `useActivePromo` hook (`src/hooks/useActivePromo.tsx`) — it already does this.

3. **Render the label dynamically:**
   - If a promo is active: `"The {promo.name} offer (${lead_price})  followup converts at {rate}%"` → e.g. *"The Early Mother's Day offer ($29.99) followup converts at 1.44%"*
   - If no promo active: `"The $10-off ($39.99) followup converts at {rate}%"` (matches the email's no-promo fallback)

4. **Add a small "current offer" badge** next to the followup analytics so it's always obvious what's being sent: `Current followup offer: $29.99 (Early Mother's Day)`.

### Files to change

- **Edit** `src/components/admin/LeadFollowupPanel.tsx` — replace hardcoded $39.99 string, use `useActivePromo` hook for dynamic price + name
- **Edit** `src/components/admin/FunnelInsights.tsx` — same fix if the string also appears there

### Out of scope (flag for later)

- The fallback price `$39.99` and the `$10 off` copy in `send-lead-followup/index.ts` (lines 40 & 45) are also hardcoded. They only fire when no promo is active — which is rare for you — but if you ever go promo-less they'd show stale numbers. Easy follow-up: pull the standard price from a config/admin_settings row instead.

