

# Branded Song Delivery System - Complete Implementation

## Overview

This builds a professional song delivery experience on your own website, matching competitors like ForeverSongs but with your Personal Song Gifts branding.

## What's Being Built

### 1. Song Player Page (`/song/:orderId`)
- Beautiful branded URL like `personalsonggifts.com/song/C015D00C`
- Album artwork with play button overlay
- Full audio player with progress bar and volume control
- Song title and occasion display
- Share buttons (Facebook + Copy Link)
- Reaction video upload CTA with $50 gift card incentive

### 2. Reaction Upload Page (`/submit-reaction`)
- Email verification to find customer's order
- Video upload form with progress indicator
- Tips for great reaction videos
- Success confirmation screen

### 3. Database Updates
New columns on `orders` table:
- `song_title` - Custom title for the song
- `cover_image_url` - Album artwork URL
- `reaction_video_url` - Customer's reaction video
- `reaction_submitted_at` - When reaction was submitted

New storage bucket:
- `reactions` - For customer video uploads

### 4. Edge Functions
- `get-song-page` - Public endpoint to fetch song data safely
- `upload-reaction` - Handles email lookup and video upload

### 5. Admin Panel Updates
- Song title input field
- Cover image upload capability
- Updated delivery email to link to branded page

## Implementation Steps

**Step 1: Database Migration**
Add new columns to orders table and create reactions storage bucket

**Step 2: Create Song Player Page**
New page at `src/pages/SongPlayer.tsx` with audio player and sharing

**Step 3: Create Reaction Upload Page**
New page at `src/pages/SubmitReaction.tsx` with email lookup and video upload

**Step 4: Create Edge Functions**
- `get-song-page` for fetching song data publicly
- `upload-reaction` for email lookup and video uploads

**Step 5: Update App Routes**
Add routes for `/song/:orderId` and `/submit-reaction`

**Step 6: Update Admin Panel**
Add song title and cover image fields to Order Details dialog

**Step 7: Update Delivery Email**
Change email CTA to link to branded page instead of raw storage URL

## URL Structure Change

**Before:**
```
https://kjyh...supabase.co/storage/v1/object/public/songs/C015D00C.mp3
```

**After:**
```
https://personalsonggifts.com/song/C015D00C
```

## Security Considerations

- Song page only shows delivered orders with uploaded songs
- No customer PII exposed (only recipient name and occasion)
- Reaction upload validates email matches order
- All edge functions use service role with proper CORS

