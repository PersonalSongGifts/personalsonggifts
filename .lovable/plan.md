

# Fix: Song Replacement Not Showing New Version

## The Problem

When you upload a corrected song, the file IS being overwritten in storage, but **Supabase Storage CDN caching** is returning the old cached version to customers. The CDN doesn't know the content changed because the URL path stays the same.

---

## The Solution

Add a **cache-busting query parameter** to the song URL whenever a file is uploaded or replaced. This forces browsers and CDNs to fetch the fresh version.

---

## Changes Required

### 1. Update `upload-song` Edge Function

When generating the public URL after upload, append a timestamp or version parameter:

```javascript
// Current:
const publicUrl = urlData.publicUrl;

// Fixed:
const cacheBuster = Date.now();
const publicUrl = `${urlData.publicUrl}?v=${cacheBuster}`;
```

This ensures every upload creates a unique URL, bypassing the CDN cache.

---

### 2. What This Fixes

| Scenario | Before | After |
|----------|--------|-------|
| Upload corrected song | CDN returns old cached file | Fresh file served immediately |
| Resend delivery email | Customer gets old song | Customer gets corrected song |
| Customer refreshes page | May still see old song | Always sees latest version |

---

## Files to Update

| File | Change |
|------|--------|
| `supabase/functions/upload-song/index.ts` | Add cache-buster to song_url and cover_image_url |

---

## Technical Details

**For Orders (line ~204-208):**
- After getting the public URL, append `?v=${Date.now()}`
- Update the order record with the cache-busted URL

**For Leads (line ~303-312):**
- Same approach for `full_song_url`, `preview_song_url`, and `cover_image_url`

**For Cover Images (line ~171-174):**
- Apply the same cache-buster pattern

---

## No Database Changes Required

The `song_url` column already stores the full URL - we're just adding a query parameter that storage ignores but CDNs respect.

