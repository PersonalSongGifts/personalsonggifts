

# Add Copy Button to Lyrics Display

## What's Changing

The generated lyrics section already exists in both the order detail dialog (`src/pages/Admin.tsx`, line ~2102) and the lead detail dialog (`src/components/admin/LeadsTable.tsx`, line ~1693). This change adds a "Copy" button next to each lyrics header so admins can quickly copy lyrics to clipboard.

## Changes

### 1. `src/pages/Admin.tsx` (Order Detail Dialog)

Update the "Generated Lyrics" section (around line 2102-2109) to add a copy button next to the header:

- Change the header from a plain `<h4>` to a flex row with `<h4>` + a small "Copy" button
- The button uses `navigator.clipboard.writeText()` with the `automation_lyrics` value
- Show a brief toast confirmation on copy

### 2. `src/components/admin/LeadsTable.tsx` (Lead Detail Dialog)

Same change in the leads lyrics section (around line 1693-1700):

- Add a flex header row with "Generated Lyrics" title + "Copy" button
- Same clipboard copy logic and toast feedback

Both buttons will use the existing `Copy` icon from lucide-react and the existing `toast` hook already in use in both files.

