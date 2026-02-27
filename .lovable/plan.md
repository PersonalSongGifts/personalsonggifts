

## Add Revision Link to Admin Order Dialog + Emoji Update

### Changes

#### 1. Add revision link to Admin Order Details dialog (`src/pages/Admin.tsx`)
In the `DialogDescription` area (line ~1650), next to the existing "View Song Page" link, add a "Revision Link" that shows whenever the order has a `revision_token`. Clicking it copies the full URL to clipboard. Format:

```
Order ID: C36052E8 · View Song Page ↗ · Copy Revision Link 📋
```

The revision link will be: `https://www.personalsonggifts.com/song/revision/{revision_token}`

This uses `window.location.origin` so it works in any environment. On click, it copies to clipboard and shows a toast confirmation.

#### 2. Add emoji to revision button on Song Player (`src/pages/SongPlayer.tsx`)
Update line 616 to include a thinking emoji alongside the pencil icon:

```
Need changes? Request a revision
```
becomes:
```
🤔 Need changes? Request a revision
```

### Technical Details

**Files modified:**
1. `src/pages/Admin.tsx` (line ~1649-1654) -- add a "Copy Revision Link" button next to "View Song Page" link, visible when `selectedOrder.revision_token` exists
2. `src/pages/SongPlayer.tsx` (line ~614-617) -- add the thinking emoji to the revision button text

Both are small, targeted UI changes with no backend modifications needed.
