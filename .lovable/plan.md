

# Branded Song Delivery System - Implementation Plan

## Step 1: Database Migration & Storage Setup

### Schema Changes
Add four new columns to the `orders` table:
- `song_title` (text) - Custom title for the song display
- `cover_image_url` (text) - Album artwork storage URL
- `reaction_video_url` (text) - Customer reaction video URL
- `reaction_submitted_at` (timestamptz) - Timestamp of reaction submission

### Storage Bucket
Create `reactions` bucket with:
- Public read access for displaying videos
- Insert policy allowing public uploads (customers can submit without authentication)

---

## Step 2: Song Player Page (`/song/:orderId`)

New file: `src/pages/SongPlayer.tsx`

Features:
- Fetches order data via `get-song-page` edge function
- Album artwork display with fallback to occasion-based default images
- Custom audio player (play/pause, progress bar, time display, volume)
- Song title and occasion display
- Share buttons (Facebook + Copy Link)
- Reaction video CTA card with $50 gift card incentive
- Brand footer

---

## Step 3: Reaction Upload Page (`/submit-reaction`)

New file: `src/pages/SubmitReaction.tsx`

Features:
- Email lookup form to find customer's order
- Order verification before showing upload form
- Video file upload with progress indicator
- Tips for great reaction videos
- Success confirmation screen
- Link back to home page

---

## Step 4: Edge Functions

### `get-song-page` (new)
- Public endpoint (no auth required)
- Accepts short order ID from URL
- Returns only safe fields: song_url, song_title, cover_image_url, occasion, recipient_name
- Only returns delivered orders with uploaded songs

### `upload-reaction` (new)
- Accepts: email, order ID, video file
- Validates email matches order record
- Uploads video to `reactions` bucket
- Updates order with reaction_video_url and reaction_submitted_at

---

## Step 5: Route Updates

Update `src/App.tsx`:
- Add `/song/:orderId` route for SongPlayer
- Add `/submit-reaction` route for SubmitReaction

---

## Step 6: Admin Panel Updates

Update `src/pages/Admin.tsx`:
- Add song title input field in Order Details dialog
- Add cover image upload capability
- Save to orders table when updated

---

## Step 7: Delivery Email Update

Update `supabase/functions/send-song-delivery/index.ts`:
- Change CTA link from raw storage URL to branded page
- New format: `https://personalsonggifts.lovable.app/song/{SHORT_ORDER_ID}`

---

## Files Summary

| File | Action |
|------|--------|
| Database migration | Create columns + reactions bucket |
| `src/pages/SongPlayer.tsx` | Create |
| `src/pages/SubmitReaction.tsx` | Create |
| `src/App.tsx` | Add 2 routes |
| `supabase/functions/get-song-page/index.ts` | Create |
| `supabase/functions/upload-reaction/index.ts` | Create |
| `supabase/functions/send-song-delivery/index.ts` | Update |
| `supabase/config.toml` | Register new functions |
| `src/pages/Admin.tsx` | Add song title + cover image fields |
| `src/integrations/supabase/types.ts` | Auto-updates after migration |

