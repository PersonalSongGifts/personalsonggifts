

# Add Generated Lyrics Display to Lead Details

## What's Changing

The generated lyrics are already stored in the database (`automation_lyrics` column) for both orders and leads. The **order detail** view already shows them, but the **lead detail** dialog does not. This change adds the lyrics display to the lead detail dialog so you can see them for each lead too.

## Changes

### File: `src/components/admin/LeadsTable.tsx`

Add a "Generated Lyrics" section inside the lead detail dialog, right after the existing "Automation Status" section (around line 1691). This will show the lyrics in a scrollable, formatted block -- matching the same style already used in the order detail view.

The section will:
- Only appear when `automation_lyrics` exists for the lead
- Show the lyrics in a preformatted text block with word wrap
- Have a max height with scroll for long lyrics
- Match the existing order detail styling for consistency

No backend changes needed -- the data is already being fetched and available in the lead objects.

