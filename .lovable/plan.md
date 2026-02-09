

# Add Lyrics Display to Main Order Detail Dialog

## Problem

The "Generated Lyrics" section with the Copy button currently only exists inside the Debug Info dialog -- not in the main order detail dialog. That's why you can't see or copy lyrics when viewing an order.

## Changes

### `src/pages/Admin.tsx`

Add a "Generated Lyrics" section with a Copy button directly into the **main order detail dialog**, placed right after the "Song Title" section (around line 1832) and before "Order Settings". This puts it high enough that it's visible without excessive scrolling.

The section will:
- Only show when `selectedOrder.automation_lyrics` exists
- Display the lyrics in a scrollable `<pre>` block (max height ~200px)
- Include a Copy button in the header row that copies lyrics to clipboard with a toast confirmation
- Use the same styling already established in the debug dialog

This keeps the existing lyrics display in the Debug dialog as-is (for technical reference), while giving you easy access in the main view.
