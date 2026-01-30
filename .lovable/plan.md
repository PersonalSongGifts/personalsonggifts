
# Branded Song Delivery Page System

## What You're Getting

A complete song delivery experience on your own website, matching the competitor's approach but with your Personal Song Gifts branding.

### Two New Pages

**1. Song Player Page** (`/song/:orderId`)
Clean URL like `personalsonggifts.lovable.app/song/C015D00C` featuring:
- Album artwork displayed as cover image (extracted from MP3 or uploaded separately)
- Full audio player with progress bar, time display, and volume control
- Song title (generated from occasion + recipient)
- Social sharing buttons (Facebook, Copy Link)
- Reaction video upload CTA with $50 gift card incentive
- Your brand footer

**2. Reaction Video Upload Page** (`/submit-reaction`)
- Email lookup to find the customer's order
- Video upload form after verification
- Tips for great reaction videos
- Confirmation after upload

---

## Technical Components

### Database Changes

Add new columns to `orders` table:

| Column | Type | Purpose |
|--------|------|---------|
| `song_title` | text | Custom song title for display |
| `cover_image_url` | text | Album artwork URL (uploaded to storage) |
| `reaction_video_url` | text | Customer's reaction video URL |
| `reaction_submitted_at` | timestamptz | When reaction was submitted |

Create a new `reactions` storage bucket for customer video uploads.

### New Pages

**`src/pages/SongPlayer.tsx`**
- Fetches order data by short ID from URL
- Displays cover image (falls back to occasion-based default)
- Custom audio player matching your existing SamplePlayer component
- Share buttons using Web Share API + Facebook SDK
- Link to reaction upload page

**`src/pages/SubmitReaction.tsx`**
- Email lookup form
- Finds order by customer email
- Video upload form (appears after email verified)
- Tips for great reaction videos card
- Uploads to `reactions` bucket and updates order

### Edge Functions

**`get-song-page` (new)**
- Public endpoint: fetches order data by short ID
- Returns only necessary fields (no sensitive data)
- No authentication required (public page)

**`upload-reaction` (new)**
- Accepts video file + order ID + customer email
- Validates email matches order
- Uploads to `reactions` storage bucket
- Updates order with video URL

**`send-song-delivery` (update)**
- Change email CTA from raw storage URL to new branded page URL
- Example: `https://personalsonggifts.lovable.app/song/C015D00C`

### Admin Panel Updates

Add fields to Order Details dialog for:
- Song title (editable)
- Cover image upload (uses songs bucket with image support)

---

## Page Mockups

### Song Player Page Layout

```text
+------------------------------------------+
|         Personal Song Gifts              |
+------------------------------------------+
|                                          |
|     +---------------------------+        |
|     |                           |        |
|     |    [Album Artwork]        |        |
|     |       (square)            |        |
|     |                           |        |
|     |    [Play Button Overlay]  |        |
|     +---------------------------+        |
|     |  0:00 ===|======= 3:47    |        |
|     +---------------------------+        |
|      PersonalSongGifts.com       [Vol]   |
|                                          |
|     "A Song for Veronica"                |
|     Created for Valentine's Day          |
|                                          |
|  [Share on Facebook]  [Copy Link]        |
|                                          |
|  +------------------------------------+  |
|  | Limited time                       |  |
|  | Submit your reaction video         |  |
|  | Record the moment Veronica hears   |  |
|  | the song. Get a $50 gift card!     |  |
|  |                                    |  |
|  | [Upload your video]                |  |
|  +------------------------------------+  |
|                                          |
|  Made with love by Personal Song Gifts   |
+------------------------------------------+
```

### Reaction Upload Page Layout

```text
+------------------------------------------+
|     [Video Camera Icon]                  |
|     Limited time                         |
|                                          |
|     Submit Your Reaction Video           |
|     Upload the special moment when       |
|     your loved one heard their song!     |
|     Get a $50 Amazon gift card.          |
|                                          |
|  +------------------------------------+  |
|  | Enter your email address           |  |
|  | Use the email from your order      |  |
|  |                                    |  |
|  | [your@email.com]                   |  |
|  |                                    |  |
|  | [Find My Order]                    |  |
|  +------------------------------------+  |
|                                          |
|  +------------------------------------+  |
|  | Tips for a Great Reaction Video    |  |
|  |                                    |  |
|  | - Capture the full journey         |  |
|  | - Good lighting, steady camera     |  |
|  | - Make sure we can hear everything |  |
|  | - Keep it natural                  |  |
|  +------------------------------------+  |
|                                          |
|           Back to Home                   |
+------------------------------------------+
```

---

## Cover Image Handling

### Option A: Upload Separately in Admin (Recommended)
- Add image upload field to Admin Order Details
- You upload the album artwork when uploading the song
- Works for any image format

### Option B: Extract from MP3 Metadata
- More complex, requires parsing ID3 tags
- Not all MP3s have embedded artwork
- Adds backend complexity

Going with Option A is simpler and gives you full control over the cover image.

---

## Files to Create/Modify

| File | Action |
|------|--------|
| `src/pages/SongPlayer.tsx` | Create |
| `src/pages/SubmitReaction.tsx` | Create |
| `src/App.tsx` | Add routes |
| `supabase/functions/get-song-page/index.ts` | Create |
| `supabase/functions/upload-reaction/index.ts` | Create |
| `supabase/functions/send-song-delivery/index.ts` | Update email URL |
| `src/pages/Admin.tsx` | Add song title + cover image fields |
| `supabase/config.toml` | Register new functions |
| Migration | Add columns + reactions bucket |

---

## Delivery Email Change

Current email links to raw storage URL:
```
https://kjyh...supabase.co/storage/v1/object/public/songs/C015D00C.mp3
```

New email links to branded page:
```
https://personalsonggifts.lovable.app/song/C015D00C
```

---

## Summary

This gives you:
- Professional branded URLs for song delivery
- Beautiful player page matching your site design
- Social sharing to drive word-of-mouth marketing
- Reaction video collection for testimonials
- Built-in incentive program ($50 gift card offer)
- Everything hosted on your own domain

