## Goal

Replace the prominent featured "Mother's Day" button at the top of the Occasion step with a "Father's Day" featured button, styled in blue to match the current Early Father's Day Sale banner, and remove the redundant "Father's Day" tile from the regular grid.

## Scope

Single file: `src/components/create/OccasionStep.tsx`. No business logic, no backend, no schema changes. Same auto-advance behavior.

## Changes

1. **Featured button** (currently Mother's Day):
   - Change `occasion` id it sets from `"mothers-day"` to `"fathers-day"`.
   - Change `isMothersSelected` → `isFathersSelected` checking `formData.occasion === "fathers-day"`.
   - Swap label content to: `🤵 💙 Father's Day 💙 🤵` with a sub-line of dad-appropriate emojis (e.g. `👔 🎩 ⛳`), matching the banner's tuxedo + blue heart vibe.
   - Replace pink color classes with blue equivalents mirroring the banner tone (banner uses `bg-primary` ≈ navy `#1E3A5F`). Use a softer blue background gradient so it reads as a featured card, not the dark banner:
     - Border: `border-blue-300` → selected `border-blue-500` + `ring-blue-400`
     - Background: `from-blue-50 to-sky-50` → selected `from-blue-100 to-sky-100`
     - Text: `text-blue-700` for heading, `text-blue-500` for subline
   - Keep the same sizing, rounded-xl, shadow, and hover behavior.

2. **Regular occasion grid**:
   - Remove the `{ id: "fathers-day", label: "Father's Day" }` entry from the `occasions` array so it isn't duplicated below the featured button (mirrors how Mother's Day was excluded from the grid).

3. **No other changes** — Valentine's, Mother's Day handling elsewhere in the codebase, pricing, and create flow logic remain untouched. The Mother's Day featured treatment is simply replaced (not preserved as a second featured button) since it's no longer the active seasonal push.

## Technical notes

- File touched: `src/components/create/OccasionStep.tsx` only.
- Auto-advance via `onAutoAdvance?.()` preserved.
- Tailwind classes only; no new tokens needed.
- The downstream form already accepts `"fathers-day"` as a valid occasion id (it's currently listed in the grid), so no validation or prompt-mapping changes are required.
