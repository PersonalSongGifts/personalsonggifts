

## Split "Parent" into "Mom" and "Dad" on Recipient Step

### What
Replace the single "Parent" card with two separate cards — "Mom" and "Dad" — and move them near the top of the grid for Mother's Day prominence. Update admin dropdowns to match.

### Changes

**`src/components/create/RecipientStep.tsx`**
- Replace `{ id: "parent", label: "Parent", icon: Users }` with:
  - `{ id: "mom", label: "Mom", icon: Heart }` (position 4, right after Partner)
  - `{ id: "dad", label: "Dad", icon: Users }` (position 5, right after Mom)
- This gives the grid order: Husband, Wife, Partner, **Mom**, **Dad**, Child, Friend, Pet, Myself, Other (10 items total)

**`src/components/admin/adminDropdownOptions.ts`**
- Add a `recipientOptions` array that includes `mom` and `dad` (instead of `parent`) so admin filtering/editing works with the new values
- Keep backward compatibility: old orders with `recipient_type: "parent"` will still display via the `getLabelForOption` fallback (returns the raw ID)

### What does NOT need to change
- **Database**: `recipient_type` is a free-text string column — no migration needed
- **Lyrics generation** (`automation-generate-lyrics`): The `recipient_type` value is passed directly into the AI prompt as `RecipientType: mom` or `RecipientType: dad`. This actually *improves* lyric quality — the AI will use "Mama/Mom" or "Dad/Pops" instead of generic "parent" language
- **All other edge functions**: They just store/pass `recipient_type` as a string — no logic branches on "parent" specifically
- **Revision form**: Uses the same dropdown options, will pick up the new values automatically

### Files
| File | Change |
|------|--------|
| `src/components/create/RecipientStep.tsx` | Replace "Parent" with "Mom" and "Dad", reorder to put them near top |
| `src/components/admin/adminDropdownOptions.ts` | Add `recipientOptions` array with mom/dad instead of parent |

