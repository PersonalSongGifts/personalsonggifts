

## Add Song Link Search to Orders and Leads Tabs

### What This Does
Lets you paste a song link (or just the ending part like `w5UZxRyMrxCbgaay`) into the search box on the Orders tab or Leads tab and find the matching record -- same as the CS Assistant already does.

### Changes

**File 1: `src/pages/Admin.tsx`** (Orders tab search filter, ~lines 1329-1343)

Add song_url matching to the client-side filter. Before the existing search logic, extract a token/path fragment from URLs (same regex: `/\/(?:preview|song)\/([A-Za-z0-9_-]+)/`). Then include `song_url` in the match fields:

- `order.song_url?.toLowerCase().includes(searchLower)`
- `order.cover_image_url?.toLowerCase().includes(searchLower)`

Also update the placeholder text to: "Search by name, email, order ID, or song link..."

**File 2: `src/components/admin/LeadsTable.tsx`** (Leads tab search filter, ~lines 203-217)

Same approach -- add these fields to the client-side filter:

- `lead.preview_song_url?.toLowerCase().includes(searchLower)`
- `lead.preview_token?.toLowerCase().includes(searchLower)`
- `lead.cover_image_url?.toLowerCase().includes(searchLower)`

Also update the placeholder text to: "Search by name, email, lead ID, or song link..."

Both filters will also strip the URL prefix first (extract the token from a full URL) so pasting `https://www.personalsonggifts.com/preview/w5UZxRyMrxCbgaay` works the same as pasting just `w5UZxRyMrxCbgaay`.

### Files Modified

| File | Changes |
|------|---------|
| `src/pages/Admin.tsx` | Add song_url matching + URL extraction to Orders search filter |
| `src/components/admin/LeadsTable.tsx` | Add preview_song_url/preview_token matching + URL extraction to Leads search filter |
