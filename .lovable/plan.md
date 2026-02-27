

## Fix TOS Link and Add Important Highlights to Revision Page

### 1. Fix Terms of Service link (404 fix)
The link currently points to `/terms-of-service` but the actual route is `/terms`. Update line 487 in `SongRevision.tsx` to use `/terms` instead.

### 2. Add "Important -- please read before submitting" highlights box
For the **post-delivery redo** form, add a prominent warning card (amber/yellow styled, matching the existing amber alert pattern) below the header and above the editable fields. This mirrors the competitor reference screenshot and clearly sets expectations.

The highlights will include:
- Your original song will be permanently replaced with a new version
- You get 1 redo -- it cannot be undone
- Each remake is uniquely generated and will sound different from the original
- We can only rework what was in your original order -- new details (names, stories, etc.) can't be guaranteed and the song will sound materially different
- If your requested changes don't all fit, some content may be trimmed

This box appears only for post-delivery redo forms (not pre-delivery updates, which are low-stakes edits).

### 3. Keep the disclaimer checkboxes as-is
The checkboxes at the bottom of the form stay -- they serve as explicit confirmation before submit (the user likes this pattern).

### Files changed
- `src/pages/SongRevision.tsx` -- fix TOS link path, add highlights card for post-delivery
