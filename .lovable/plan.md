

## Add "Sender Context" to Revision Form + Wire It Into Lyrics Prompt

### Problem
The lyrics AI has no concept of sender gender. It infers from recipient type ("wife" = male sender), producing lines like "you make me a better man" for a woman writing to her wife. The revision form has `style_notes` and `anything_else` fields, but these are never fed into the lyrics generation prompt.

### Solution
Add a dedicated **"Song Perspective" field** to the revision form and wire all revision-specific notes into the lyrics prompt.

---

### Changes

#### 1. Add `sender_context` column to `revision_requests` table
A new nullable text column to store the sender's self-description (e.g., "I'm a woman writing to my wife").

#### 2. Add `sender_context` column to `orders` table
So it persists after approval and is available during lyrics regeneration.

#### 3. Update the Revision Form (`src/pages/SongRevision.tsx`)
Add a new field between "Singer Voice Preference" and "Language" with:
- Label: **"Song Perspective / Sender Context"**
- Helper text: "Tell us about yourself so the lyrics fit. Example: 'I'm a woman writing to my wife' or 'I'm their daughter, not their son'"
- Text input, max 200 characters
- Only shown for post-delivery redos (not pre-delivery updates, since the song hasn't been generated yet -- actually, show it for both since it helps initial generation too)

#### 4. Update `submit-revision` edge function
Accept `sender_context` from the form, store it in the `revision_requests` row, and include it in `fields_changed`.

#### 5. Update `review_revision` handler in `admin-orders`
Map `sender_context` from revision request to the order's `sender_context` column on approval. Add it to `contentFields` so it triggers regeneration.

#### 6. Update Lyrics Generation Prompt (`automation-generate-lyrics`)
- Read `sender_context` (or `notes` as fallback) from the order/lead
- If present, add a block to the user prompt:

```
SenderContext: "I'm a woman writing to my wife"

IMPORTANT: The sender has provided context about themselves.
Use this to ensure correct gender references and perspective in the lyrics.
Never assume the sender's gender from the recipient type alone.
```

#### 7. Update the System Prompt
Add a new rule to the SYSTEM_PROMPT:

```
# Sender Context
- If SenderContext is provided, use it to determine the correct gender perspective
- NEVER assume sender gender from RecipientType alone
  (e.g., "wife" does not mean the sender is male)
- When no SenderContext is given, keep gender references neutral
  or use universal phrases like "you make me better" instead of "you make me a better man"
```

This last point is a general improvement -- even without sender context, the AI should default to gender-neutral phrasing unless it has explicit info.

---

### Technical Details

**Database migrations:**
- `ALTER TABLE revision_requests ADD COLUMN sender_context text;`
- `ALTER TABLE orders ADD COLUMN sender_context text;`

**Files modified:**
1. `src/pages/SongRevision.tsx` -- add sender_context field to form
2. `supabase/functions/submit-revision/index.ts` -- accept and store sender_context
3. `supabase/functions/admin-orders/index.ts` -- map sender_context on approval
4. `supabase/functions/automation-generate-lyrics/index.ts` -- read sender_context, update system prompt and user prompt
5. `supabase/functions/get-revision-page/index.ts` -- include sender_context in order data returned to form

**No changes to the main order form** -- this keeps the initial ordering flow simple. Sender context is only available via the revision/redo form and admin panel.

