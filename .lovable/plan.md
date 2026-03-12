

## Add Filipino (Tagalog) Language Option

Additive-only change across 3 files. No schema changes needed — `lyrics_language_code` already accepts any text value.

### Changes

**1. `supabase/functions/_shared/language-utils.ts`**
- Add `tl: "Filipino (Tagalog)"` to `LANGUAGE_LABELS`
- Add Tagalog-specific rules to `LANGUAGE_SPECIFIC_RULES`:
  - "Write lyrics in Tagalog (Filipino). Use natural conversational Tagalog suitable for a heartfelt song."
  - "Keep names in original Latin characters"
  - "Use natural Tagalog emotional expressions and idioms"
- Add Tagalog word markers to `LANGUAGE_MARKERS` for QA detection (common Tagalog function words: `ang, ng, sa, na, at, ay, ko, mo, ka, mga, nang, kung, para, ito, iyon, aking, iyong, puso, mahal`)

**2. `src/components/create/MusicStyleStep.tsx`**
- Add `{ id: "tl", label: "Filipino (Tagalog)" }` to `languageOptions` array

**3. `src/components/admin/adminDropdownOptions.ts`**
- Add `{ id: "tl", label: "Filipino (Tagalog)" }` to `languageOptions` array

### What does NOT change
- No database schema changes (field is free-text)
- No Stripe/PayPal checkout logic
- No order status machine or scheduler
- No email delivery logic
- Generation pipeline already passes `lyrics_language_code` through — `tl` will flow through `buildLanguagePromptBlock()` automatically using the new label and rules

### Pipeline compatibility
The generation functions (`automation-generate-lyrics`, `automation-trigger`) read `lyrics_language_code` from the order/lead and pass it to `buildLanguagePromptBlock()`. Adding the label and rules to `language-utils.ts` is sufficient — no pipeline code changes needed.

