

## Add Hindi Language Support

### Overview
Add Hindi (`hi`) as a supported language across the entire system -- customer-facing form, revision/redo form, admin panel, and backend lyrics generation pipeline.

### Changes

#### 1. Shared dropdown options (`src/components/admin/adminDropdownOptions.ts`)
Add `{ id: "hi", label: "Hindi" }` to the `languageOptions` array. This automatically propagates to:
- Admin order editing (Admin.tsx)
- Admin lead editing (LeadsTable.tsx)
- Revision/redo form (SongRevision.tsx)

#### 2. Customer-facing form (`src/components/create/MusicStyleStep.tsx`)
Add `{ id: "hi", label: "Hindi" }` to the local `languageOptions` array (this file has its own copy).

#### 3. Backend language utilities (`supabase/functions/_shared/language-utils.ts`)
- Add `hi: "Hindi"` to `LANGUAGE_LABELS`
- Add Devanagari script detection pattern (`[\u0900-\u097F]`) to `detectByScript()` so the QA system can verify Hindi lyrics
- Add Hindi-specific rules to `LANGUAGE_SPECIFIC_RULES` (e.g., use conversational Hindi, avoid overly Sanskritized/formal phrasing, Devanagari script preferred)
- Add Hindi word markers to `LANGUAGE_MARKERS` for mixed-language detection on romanized Hindi

### What does NOT need to change
- **No database migration needed** -- `lyrics_language_code` is a plain text column, any value works
- **No edge function logic changes** -- the lyrics generator and audio generator read from the language-utils constants; adding Hindi there is sufficient
- **No revision flow changes** -- the revision form already imports `languageOptions` from the shared file, so it picks up Hindi automatically
- **No risk of stalling** -- the automation pipeline treats unknown languages gracefully (falls back to the code as-is), and adding Hindi to the known set only improves QA accuracy

### Technical Details

**Files modified:**
1. `src/components/admin/adminDropdownOptions.ts` -- add Hindi to languageOptions
2. `src/components/create/MusicStyleStep.tsx` -- add Hindi to local languageOptions
3. `supabase/functions/_shared/language-utils.ts` -- add Hindi to LANGUAGE_LABELS, LANGUAGE_SPECIFIC_RULES, script detection (Devanagari), and LANGUAGE_MARKERS

**Devanagari script detection** will use Unicode range `\u0900-\u097F` which covers all standard Hindi characters. This gives the QA system high-confidence detection for Hindi lyrics written in Devanagari, similar to how Japanese/Korean/Cyrillic are already handled.

**Hindi-specific prompt rules** will instruct the AI to:
- Use conversational Hindi (not overly formal or Sanskritized)
- Write in Devanagari script
- Keep names in their original Latin characters
- Embrace natural Hindi emotional expressions and idioms
