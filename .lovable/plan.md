

## Smart Bonus Style + Bigger UI + Personalized Copy + Download Button Update + Fix Existing Orders

### Problems to solve

1. **Acoustic-on-acoustic redundancy**: When primary genre is "acoustic", the bonus track is also acoustic — useless duplication.
2. **Bonus section is too small**: Currently a small card with tiny player, hidden at the bottom.
3. **Generic copy**: "We also made an acoustic version..." doesn't adapt to the actual bonus genre.
4. **Download button missing commercial rights mention**: Should say "+ Unlimited Commercial Rights & Usage".
5. **Existing acoustic-primary orders need fixing**: Any orders that already generated an acoustic bonus for an acoustic primary need to be re-generated with R&B style.

---

### 1. Smart Genre Detection in `automation-generate-audio/index.ts`

**Current behavior** (line 370-411): Always uses hardcoded acoustic prompt regardless of primary genre.

**New behavior**: Before choosing the bonus style, check `entity.genre`:
- If primary genre is `acoustic` → query `song_styles` table for an R&B style matching the singer's `vocalGender`. Use that prompt. Set `bonus_song_title` suffix to `(R&B Version)`.
- All other genres → use existing acoustic prompt. Keep `(Acoustic)` suffix.

This is a ~15-line change in the bonus generation block (lines 370-413).

### 2. Pass Genre Info to Song Page via `get-song-page/index.ts`

Add `genre` to the `selectFields` string (line 50). Add to response object:
- `genre`: the primary order genre
- `bonus_genre_label`: derived from `bonus_song_title` — parse "(Acoustic)" or "(R&B Version)" suffix. Fallback to "Acoustic".

### 3. Bigger Bonus Section in `SongPlayer.tsx`

Redesign lines 942-1089 to make the bonus section nearly as prominent as the primary player:
- Use the song's cover image (or `bonus_cover_image_url` if available) as a visual header/background
- Larger play/pause button (matching primary player's `w-16 h-16` instead of current `w-10 h-10`)
- Full-width progress bar with time display
- Genre-specific section title: "🎸 Acoustic Version" or "🎵 R&B Version"

### 4. Personalized Copy in `SongPlayer.tsx`

Replace the static line (line 951) with dynamic copy based on `bonus_genre_label`:

- **Acoustic bonus**: "Your song was so special that we created an acoustic version too — intimate, organic, and full of feeling. Like a private performance just for you."
- **R&B bonus** (when primary was acoustic): "Your song was so special that we reimagined it in an R&B style — smooth, soulful, and full of groove. A whole new way to experience your song."

Also update button text from "Unlock Full Acoustic Version" to "Unlock Full [Genre] Version" dynamically.

### 5. Download Button Copy Update in `SongPlayer.tsx`

Line 745: Change `"Download Song — $49.00 USD"` to `"Download Song + Unlimited Commercial Rights & Usage — $49.00 USD"`.

### 6. Genre-Aware Email Copy

**`send-song-delivery/index.ts`** (lines 106, 136): Change "acoustic version" to use the actual bonus genre from the order's `bonus_song_title`. Parse the title suffix to determine genre label. Example: "P.S. We also made an R&B version of your song — visit your song page to check it out."

**`send-bonus-campaign-email/index.ts`**: Same genre-aware copy throughout.

### 7. Fix Existing Acoustic-on-Acoustic Orders

Write a one-time edge function call or admin action to:
1. Query orders where `genre = 'acoustic'` AND `bonus_song_title LIKE '%(Acoustic)%'` AND `bonus_automation_status = 'completed'`
2. For each, clear `bonus_song_url`, `bonus_preview_url`, `bonus_automation_status`, `bonus_automation_task_id` and set them up for re-generation with R&B style
3. This can be done via the existing `batch-generate-bonuses` function once it's updated with the smart genre detection — just re-run it for those specific orders

Alternatively, a simpler SQL migration that resets the bonus columns for affected orders, then the admin uses the Bonus Song Campaign tool to re-generate them.

### SongData Interface Update

Add to `SongData` (line 57-78):
```
genre?: string;
bonus_genre_label?: string;
```

---

### Files Changed

| File | Change |
|------|--------|
| `supabase/functions/automation-generate-audio/index.ts` | Smart genre check: if primary is acoustic, use R&B style from `song_styles` table |
| `supabase/functions/get-song-page/index.ts` | Add `genre` to select, derive and return `bonus_genre_label` |
| `src/pages/SongPlayer.tsx` | (1) Bigger bonus section with cover image + large player (2) Dynamic genre-aware copy (3) Download button: "+ Unlimited Commercial Rights & Usage" (4) Genre-aware button labels |
| `supabase/functions/send-song-delivery/index.ts` | Genre-aware P.S. line based on `bonus_song_title` |
| `supabase/functions/send-bonus-campaign-email/index.ts` | Genre-aware email body |
| SQL or admin action | Reset bonus columns on acoustic-primary orders that got acoustic bonus, for re-generation |

No database migration needed — all columns already exist.

