
# Song Upload & Delivery System

## Overview
Build a complete system that lets you upload songs directly (either through chat or the Admin panel), stores them securely in your project's file storage, and automatically delivers them to customers with clean, professional URLs.

## What You Get

### Upload Methods
1. **Chat Upload** - Give me a song file + order number, I handle everything
2. **Admin Panel Upload** - Upload directly from the Order Details dialog with a file picker

### Professional Delivery
- Clean URLs like `https://[project].supabase.co/storage/v1/object/public/songs/C015D00C.mp3`
- No Google branding or personal email visible
- Direct download/streaming for customers

---

## Components to Build

### 1. Storage Bucket
Create a `songs` bucket to store audio files securely.

| Setting | Value |
|---------|-------|
| Bucket Name | songs |
| Public Access | Yes (so customers can download) |
| Allowed File Types | MP3, WAV, M4A, OGG, FLAC |

### 2. Upload Edge Function
`supabase/functions/upload-song/index.ts`

Handles file uploads from the Admin panel:
- Accepts audio file + order ID + admin password
- Validates admin authorization
- Uploads to the `songs` bucket with a clean filename
- Updates the order's `song_url` automatically
- Returns the public URL

### 3. Admin Panel Updates
Add upload capability to the Order Details dialog:

```text
+------------------------------------------+
|  Order Details                           |
|  ----------------------------------------|
|  Customer: Jimmy                         |
|  Recipient: Veronica                     |
|  Occasion: Valentine's                   |
|  ----------------------------------------|
|  UPLOAD SONG                             |
|  [Choose File] [Upload]                  |
|                                          |
|  Song URL: (auto-filled after upload)    |
|  https://...songs/C015D00C.mp3           |
|                                          |
|  [Close]  [Deliver & Send Email]         |
+------------------------------------------+
```

### 4. Workflow Integration
When I process your chat uploads:
1. Receive the audio file you send
2. Upload it to the songs bucket
3. Update the order record with the new URL
4. Trigger the delivery email
5. Confirm completion

---

## Technical Details

### Database Migration (SQL)
```sql
-- Create songs storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('songs', 'songs', true);

-- Allow anyone to download songs (public read)
CREATE POLICY "Anyone can download songs"
ON storage.objects FOR SELECT
USING (bucket_id = 'songs');

-- Only service role can upload (admin via edge function)
CREATE POLICY "Service role can upload songs"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'songs');

CREATE POLICY "Service role can update songs"
ON storage.objects FOR UPDATE
USING (bucket_id = 'songs');

CREATE POLICY "Service role can delete songs"
ON storage.objects FOR DELETE
USING (bucket_id = 'songs');
```

### New Edge Function
`supabase/functions/upload-song/index.ts`
- Authenticates via admin password (same as admin-orders)
- Accepts multipart form data with audio file
- Extracts order ID from form or filename
- Uploads to storage using service role
- Updates order's `song_url` with public URL
- Returns success/error response

### Admin Page Changes
`src/pages/Admin.tsx`
- Add file input state and upload handler
- New "Upload Song" button in Order Details dialog
- Progress indicator during upload
- Auto-populate song URL field on success
- Keep existing "Deliver & Send Email" button

### Files Changed

| File | Change |
|------|--------|
| New migration | Create `songs` storage bucket + policies |
| `supabase/functions/upload-song/index.ts` | New edge function |
| `src/pages/Admin.tsx` | Add upload UI to Order Details |

---

## Workflow After Implementation

### From Admin Panel
1. Open Order Details for an order
2. Click "Choose File" and select the MP3
3. Click "Upload" - file uploads and URL auto-populates
4. Click "Deliver & Send Email" - customer gets the song

### From Chat (with me)
1. You: "Here's the song for order C015D00C" + attach file
2. I upload the file, update the database, send the email
3. I confirm: "Done! Delivery email sent to jimmy@..."

---

## Cost Summary
- Storage: ~5MB per song = 200 songs per 1GB free tier
- Beyond free tier: $0.021/GB/month (~$0.0001 per song)
- Bandwidth: First 2GB free, then $0.09/GB
- Effectively free for your volume
