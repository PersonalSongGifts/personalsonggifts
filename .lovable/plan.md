

## Add Banner Color Picker to Promo Admin

### What Changes

1. **Database**: Add `banner_bg_color` (text, nullable, default `null`) and `banner_text_color` (text, nullable, default `null`) columns to the `promotions` table. When null, falls back to the current `bg-primary` / `text-primary-foreground`.

2. **Admin form (`PromosPanel.tsx`)**: Add two color picker inputs (background + text color) in the banner settings section. Use native `<input type="color">` with a hex text input beside it for precision. Include a "Reset to default" option.

3. **Edge function (`get-active-promo`)**: Return `banner_bg_color` and `banner_text_color` in the response.

4. **`useActivePromo` hook**: Pass through the two new color fields.

5. **`PromoBanner.tsx`**: Apply inline `style={{ backgroundColor, color }}` when promo colors are set, otherwise keep the Tailwind classes.

### Files
| File | Change |
|------|--------|
| Migration | `ALTER TABLE promotions ADD COLUMN banner_bg_color text, ADD COLUMN banner_text_color text` |
| `supabase/functions/admin-promos/index.ts` | Save/return color fields |
| `supabase/functions/get-active-promo/index.ts` | Return color fields |
| `src/hooks/useActivePromo.tsx` | Map new fields |
| `src/components/admin/PromosPanel.tsx` | Two color pickers in form |
| `src/components/layout/PromoBanner.tsx` | Apply dynamic colors via inline style |

