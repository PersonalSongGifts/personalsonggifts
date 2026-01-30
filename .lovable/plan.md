

# Fix Persistent Video Cache Issue

## Problem Diagnosis

I verified from the server that your new compressed 1.9MB video **is correctly deployed**:
- The server shows the video was last modified at 21:28:20 on Jan 30
- File size: 1,779,061 bytes (~1.77 MB) - matches your compressed file
- CDN shows "MISS" meaning it fetched fresh content

The issue is **browser-level caching** - your browser stored the old video locally and is not requesting the new version despite having the same filename.

---

## Solution: Cache-Busting with Version Query Parameter

I'll add a version parameter to the video URL that forces the browser to treat it as a completely new file:

**Before:**
```tsx
<source src="/videos/hero-video.mp4" type="video/mp4" />
```

**After:**
```tsx
<source src="/videos/hero-video.mp4?v=2" type="video/mp4" />
```

This approach:
- Forces all browsers to fetch the new video immediately
- Works even if the user has aggressive caching
- Simple to update in the future (just change `v=2` to `v=3`, etc.)

---

## Implementation

| Step | Action |
|------|--------|
| 1 | Update `src/components/home/HeroSection.tsx` line 62 to add `?v=2` cache-busting parameter |

---

## After Implementation

Once I make this change:
1. The preview should immediately show your new compressed video
2. When you publish, the live site will also show the new video
3. Future video updates would just require incrementing the version number

---

## Technical Details

**File to modify:** `src/components/home/HeroSection.tsx`

**Change:** Line 62:
```diff
- <source src="/videos/hero-video.mp4" type="video/mp4" />
+ <source src="/videos/hero-video.mp4?v=2" type="video/mp4" />
```

