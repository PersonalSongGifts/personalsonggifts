
## Auto-Swap Phonetic Names in Displayed Lyrics

### Problem
When an admin edits lyrics to use a phonetic spelling (e.g., "coreee" instead of "Corinne") for audio regeneration, the customer sees that phonetic spelling on the song page instead of the correct name.

### Solution
Modify the `get-song-page` edge function to automatically replace instances of `recipient_name_pronunciation` with `recipient_name` in the lyrics before returning them to the frontend. The stored lyrics remain unchanged (keeping the phonetic version for any future audio regeneration).

### How It Works

1. The function already fetches `recipient_name` from the order
2. Add `recipient_name_pronunciation` to the select fields
3. Before returning lyrics (full or preview), do a case-insensitive find-and-replace: swap all occurrences of the phonetic spelling with the actual name
4. Only perform the swap when `recipient_name_pronunciation` is present and differs from `recipient_name`

### File to Change

| File | Change |
|---|---|
| `supabase/functions/get-song-page/index.ts` | Add `recipient_name_pronunciation` to selected fields; apply find-and-replace on lyrics before returning |

### Technical Details

- The replacement uses a case-insensitive regex so it catches all variations (e.g., "Coreee", "coreee", "COREEE")
- Applied to both full lyrics (unlocked) and the preview snippet (locked)
- The `generateLyricsPreview` function runs first, then the swap is applied to its output, so truncation still works correctly
- No database migration needed -- `recipient_name_pronunciation` already exists on the `orders` table
