

## Add Bollywood/Hindi as a Music Genre

### Overview
Add "Bollywood / Hindi" as a new genre option across the customer-facing form, revision/redo flow, admin panel, and the audio generation pipeline. Also insert two new rows (male + female) into the `song_styles` database table with the Suno prompts you provided.

### Changes

#### 1. Database: Insert 2 new song_styles rows
Insert male and female Bollywood style entries into the `song_styles` table:
- **Male**: `genre_match = "bollywood"`, `vocal_gender = "male"`, `label = "Bollywood Male"`, with the male Suno prompt you provided (adding "solo male singer only, no duet..." directive to match existing patterns)
- **Female**: `genre_match = "bollywood"`, `vocal_gender = "female"`, `label = "Bollywood Female"`, with the female Suno prompt (adding "solo female singer only, no duet..." directive)

#### 2. Customer-facing genre cards (`src/components/create/MusicStyleStep.tsx`)
Add `{ id: "bollywood", label: "Bollywood / Hindi" }` to the `genres` array.

#### 3. Shared admin dropdown options (`src/components/admin/adminDropdownOptions.ts`)
Add `{ id: "bollywood", label: "Bollywood / Hindi" }` to the `genreOptions` array. This automatically propagates to:
- Admin order editing
- Admin lead editing
- Revision/redo form (SongRevision.tsx imports `genreOptions` from this file)

#### 4. Audio generation genre map (`supabase/functions/automation-generate-audio/index.ts`)
Add mappings to the `genreMap` object:
- `"bollywood": "bollywood"` (slug format)
- `"Bollywood / Hindi": "bollywood"` (display label backward compat)
- `"Bollywood": "bollywood"` (short label backward compat)

### What does NOT need to change
- **No database migration for schema** -- just inserting rows into existing `song_styles` table
- **No revision form code changes** -- it imports `genreOptions` from the shared file
- **No lyrics generation changes** -- the lyrics pipeline is genre-agnostic
- **No risk of stalling** -- the genre map ensures "bollywood" resolves to the correct `song_styles` rows; if for any reason it didn't match, the existing pop fallback would kick in

### Technical Details

**Files modified:**
1. `src/components/create/MusicStyleStep.tsx` -- add Bollywood to genres array
2. `src/components/admin/adminDropdownOptions.ts` -- add Bollywood to genreOptions
3. `supabase/functions/automation-generate-audio/index.ts` -- add bollywood mappings to genreMap

**Database insert (via migration tool):**
Two rows into `song_styles` with `genre_match = 'bollywood'`, one male and one female, using the exact Suno prompts provided but with the standard solo-singer directive appended.
