

## Update Consent Language on Submit Reaction Page

Single line change in `src/pages/SubmitReaction.tsx` — update the consent checkbox label text to include "modify and/or edit" rights.

**Current text (line ~213):**
> I grant Personal Song Gifts a perpetual, royalty-free, worldwide, irrevocable license to use, reproduce, edit, and distribute this video for any purpose, including but not limited to advertising, social media, website content, and promotional materials.

**New text:**
> I grant Personal Song Gifts a perpetual, royalty-free, worldwide, irrevocable license to use, reproduce, modify, edit, and distribute this video for any purpose, including but not limited to advertising, social media, website content, and promotional materials.

The word "modify" is added before "edit" to explicitly cover video modifications. The existing text already includes "edit" — this addition makes "modify and/or edit" coverage explicit.

**File:** `src/pages/SubmitReaction.tsx` (1 line change)

