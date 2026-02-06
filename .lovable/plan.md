

# Add "Prayer" Genre to the Song Creation Pipeline

## Overview

Add a new "Prayer" music genre positioned after Country and before Rock. This is a clean additive change across 5 files (3 frontend, 2 backend) plus 2 new rows in the database. Nothing breaks -- all existing orders, leads, and automation logic are string-agnostic and will continue working.

## Changes

### 1. Customer-Facing Song Form
**File: `src/components/create/MusicStyleStep.tsx`**
- Insert `{ id: "prayer", label: "Prayer" }` into the `genres` array after Country (position 2)

### 2. Admin Dropdown Options
**File: `src/components/admin/adminDropdownOptions.ts`**
- Insert `{ id: "prayer", label: "Prayer" }` into `genreOptions` after Country (position 2)

### 3. Genre Chart Colors
**File: `src/components/admin/GenreChart.tsx`**
- Add `"Prayer": "#7C3AED"` (a reverent purple) to the `GENRE_COLORS` map

### 4. Audio Generation -- Genre Mapping
**File: `supabase/functions/automation-generate-audio/index.ts`**
- Add `"prayer": "worship"` to the `genreMap` (slug format)
- Add `"Prayer": "worship"` to the `genreMap` (display label backward-compat)
- This maps the "prayer" database slug to `genre_match: "worship"` in the `song_styles` table

### 5. Lyrics Generation -- Genre Vibes
**File: `supabase/functions/automation-generate-lyrics/index.ts`**
- Add a new line to the "Genre Vibes" section in `SYSTEM_PROMPT`:
  `- Prayer/Worship: Reverent, intimate conversation with God, gratitude and trust, congregational chorus hook`

### 6. Database: Insert 2 Song Styles
Insert two new rows into the `song_styles` table with `genre_match: "worship"`:

**Male:**
- label: `Worship Male`
- genre_match: `worship`
- vocal_gender: `male`
- suno_prompt: `Modern worship ballad, slow to mid-tempo (70-90 BPM), gentle piano and ambient pads with warm bass and soft drums, intimate church-worship atmosphere, heartfelt male vocal pouring out a personal prayer to God, simple repeated chorus that feels like a congregational worship hook, verses that tell a story of struggle, grace, and gratitude, bridge that builds into a powerful declaration of faith, spacious reverb-rich production, overall reverent, hopeful, and deeply comforting energy, solo male singer only, no duet, no featured artists, no secondary vocals`

**Female:**
- label: `Worship Female`
- genre_match: `worship`
- vocal_gender: `female`
- suno_prompt: `Modern worship song, slow to mid-tempo (70-90 BPM), gentle piano and acoustic guitar with warm pads and soft drums, intimate prayerful atmosphere, expressive female vocal that feels like a personal conversation with God, simple chorus with a repeated worship phrase that a congregation could easily sing, verses that share gratitude, surrender, and trust in the middle of real-life struggles, bridge that lifts into a strong declaration of hope and God's faithfulness, spacious reverb-rich production, overall tender, reverent, uplifting energy, solo female singer only, no duet, no featured artists, no secondary vocals`

## What Will NOT Break

- **Validation/payment/checkout**: These flows are genre-agnostic (just pass through whatever string is selected)
- **Lead capture**: Stores whatever genre string is provided
- **Existing orders**: Unaffected -- they already have their genre value stored
- **Order creation edge function**: Passes genre through as-is
- **Song delivery emails**: Genre-agnostic

## Summary of Files

| File | Change |
|------|--------|
| `src/components/create/MusicStyleStep.tsx` | Add "Prayer" to genres array |
| `src/components/admin/adminDropdownOptions.ts` | Add "Prayer" to genreOptions |
| `src/components/admin/GenreChart.tsx` | Add purple color for Prayer |
| `supabase/functions/automation-generate-audio/index.ts` | Map "prayer" to "worship" |
| `supabase/functions/automation-generate-lyrics/index.ts` | Add Prayer/Worship genre vibes |
| Database migration | Insert 2 song_styles rows (worship male + female) |

