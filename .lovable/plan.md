## Goal
Father's Day has passed. Replace the Father's Day branding in the active site-wide promo with a generic red "Flash Sale" banner, and remove the big blue Father's Day promo card from the Create flow's Occasion step. Leave normal "Father's Day" catalog options (home occasions grid, sample player, admin dropdowns) alone — those are year-round options, not promo copy.

## Changes

### 1. Update the active promo in the database (no schema changes)
The site banner is driven by the `promotions` row with slug `early-father-s-day` (currently `show_banner = true`, blue background, Father's Day copy). Update only these display fields on that row:

- `name` → `Flash Sale`
- `banner_text` → `Flash Sale! Starting at Just $29.99`
- `banner_emoji` → `🔥` (neutral, no Father's Day icons)
- `banner_bg_color` → `#DC2626` (red)
- `banner_text_color` → `#FFFFFF` (white, for contrast on red)

Leave pricing, dates, `is_active`, `show_banner`, slug, and all other promo logic untouched so the existing discount keeps working exactly as it does today. The banner component (`src/components/layout/PromoBanner.tsx`) already reads these fields, so no code change is needed there.

### 2. Remove the featured Father's Day card from the Occasion step
File: `src/components/create/OccasionStep.tsx`

- Delete the "Featured Father's Day Button" block (the big blue card at the top with `🤵 💙 Father's Day 💙 🤵`).
- Delete the now-unused `isFathersSelected` variable.
- Leave the regular occasion grid (Valentine's, Wedding, Birthday, etc.) unchanged. Father's Day is not in that grid today, so removing the featured card simply removes it from this step entirely — consistent with the season being over.

## Out of scope (intentionally untouched)
- Home page `OccasionsGrid` "Father's Day" tile, `SamplePlayer` sample tagged "Father's Day", admin dropdown options — these are evergreen catalog entries, not seasonal promo copy.
- No edits to `PromoBanner.tsx`, `useActivePromo.tsx`, edge functions, or any other order/checkout logic.
- No new migrations, no schema changes, no other promos modified.

## Verification after build
- Banner shows red background with white text reading `🔥 Flash Sale! Starting at Just $29.99` and the "Create Your Song →" link still works.
- `/create` step 3 shows only the standard occasion grid — no blue Father's Day card.
- Checkout pricing and promo discount behavior unchanged (same `early-father-s-day` row, same dates and prices).
