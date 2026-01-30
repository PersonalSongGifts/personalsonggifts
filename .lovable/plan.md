

# Implementation Plan: Auto-Extract Cover Art & Song Title from MP3

## Summary

When you upload an MP3 file, the system will automatically:
1. **Extract the embedded cover art** from the MP3's ID3 metadata and save it as the album artwork
2. **Use the filename as the song title** (e.g., "Soft_lights_Valentine's_night-2.mp3" → "Soft lights Valentine's night 2")
3. Remove the manual "Song Title" input from the Admin panel since it's now automatic

Plus security hardening for the reaction video upload.

---

## How MP3 Cover Art Works

MP3 files store metadata using ID3v2 tags. The cover art is stored in a frame called **APIC (Attached Picture)**:

```text
MP3 File Structure
├── ID3v2 Header
│   ├── Title (TIT2 frame)
│   ├── Artist (TPE1 frame)
│   ├── Album (TALB frame)
│   └── Picture (APIC frame) ← Cover art lives here
│       ├── format: "image/jpeg" or "image/png"
│       └── data: [array of image bytes]
└── Audio Data
```

The uploaded file "Soft_lights_Valentine's_night-2.mp3" contains embedded cover art in this APIC frame.

---

## Changes Overview

| Component | Change |
|-----------|--------|
| Song Upload Function | Parse MP3 for cover art, extract and save to storage, auto-set title from filename |
| Admin Panel | Remove manual "Song Title" input (now automatic) |
| Reaction Upload Function | Add 100MB limit and file type validation for security |
| Reaction Submit Page | Update client-side limit to match server (100MB) |

---

## Technical Implementation

### 1. Upload Song Function (`supabase/functions/upload-song/index.ts`)

**Add ID3 parsing using `mp3tag.js`:**

```typescript
import MP3Tag from "https://esm.sh/mp3tag.js@3.11.0";

// After reading the file buffer...
const arrayBuffer = await file.arrayBuffer();
const uint8Array = new Uint8Array(arrayBuffer);

// Parse ID3 tags for cover art
let coverImageUrl: string | null = null;
let extractedTitle: string | null = null;

try {
  const mp3tag = new MP3Tag(arrayBuffer);
  mp3tag.read();
  
  if (!mp3tag.error) {
    // Extract cover art if present
    const picture = mp3tag.tags.v2?.APIC?.[0];
    if (picture && picture.data) {
      const coverBytes = new Uint8Array(picture.data);
      const format = picture.format || "image/jpeg";
      const ext = format.includes("png") ? "png" : "jpg";
      const coverPath = `${shortOrderId}-cover.${ext}`;
      
      await supabase.storage.from("songs").upload(coverPath, coverBytes, {
        contentType: format,
        upsert: true,
      });
      
      coverImageUrl = supabase.storage.from("songs")
        .getPublicUrl(coverPath).data.publicUrl;
    }
  }
} catch (e) {
  console.log("ID3 parsing skipped:", e);
}

// Extract title from filename
const songTitle = file.name.replace(/\.[^/.]+$/, "")  // Remove extension
  .replace(/[-_]/g, " ")  // Replace dashes/underscores with spaces
  .replace(/\s+/g, " ")   // Normalize spaces
  .trim();

// Update order with song URL, title, AND cover
await supabase.from("orders").update({ 
  song_url: publicUrl,
  song_title: songTitle,
  cover_image_url: coverImageUrl,
}).eq("id", orderId);
```

### 2. Admin Panel (`src/pages/Admin.tsx`)

**Remove the manual Song Title section:**

- Remove `songTitle` state and `setSongTitle` setter
- Remove `handleSaveSongTitle` function
- Remove the "Song Title" label, input field, and Save button (lines ~625-645)
- The title will now appear automatically after upload

### 3. Reaction Upload Security (`supabase/functions/upload-reaction/index.ts`)

**Add server-side validation:**

```typescript
// File size limit (100MB)
const MAX_VIDEO_SIZE = 100 * 1024 * 1024;
if (video.size > MAX_VIDEO_SIZE) {
  return new Response(
    JSON.stringify({ error: "Video must be under 100MB" }),
    { status: 400, ... }
  );
}

// Allowed video types only
const ALLOWED_TYPES = ["video/mp4", "video/quicktime", "video/webm", "video/x-msvideo"];
if (!ALLOWED_TYPES.includes(video.type)) {
  return new Response(
    JSON.stringify({ error: "Only MP4, MOV, WebM, and AVI videos are allowed" }),
    { status: 400, ... }
  );
}

// Extension validation
const ALLOWED_EXT = [".mp4", ".mov", ".webm", ".avi"];
const ext = "." + video.name.split(".").pop()?.toLowerCase();
if (!ALLOWED_EXT.includes(ext)) {
  return new Response(
    JSON.stringify({ error: "Invalid video file extension" }),
    { status: 400, ... }
  );
}
```

### 4. React Upload Page (`src/pages/SubmitReaction.tsx`)

**Update client-side limit to match:**

```typescript
// Line ~67: Change 500MB to 100MB
if (file.size > 100 * 1024 * 1024) {
  toast.error("Video must be under 100MB");
  return;
}
```

---

## Files Modified

1. `supabase/functions/upload-song/index.ts` - Add ID3 parsing, cover extraction, auto-title
2. `src/pages/Admin.tsx` - Remove manual song title input section
3. `supabase/functions/upload-reaction/index.ts` - Add security validation (size + type)
4. `src/pages/SubmitReaction.tsx` - Update client-side file size limit

---

## Where Reaction Videos Are Stored

**Storage location:** `reactions` bucket in Lovable Cloud storage

**How to view them:**
- Click "View Backend" in Lovable to access your storage
- Navigate to the `reactions` bucket
- Files are named `{orderId}-reaction.mp4` (or .mov, etc.)

**Database reference:** The `orders` table has these columns:
- `reaction_video_url` - Public URL to the video
- `reaction_submitted_at` - Timestamp when submitted

---

## Testing After Implementation

1. **Upload MP3 with cover art** → Cover should appear on song player page automatically
2. **Check song title** → Should show "Soft lights Valentine's night 2" (from filename)
3. **Try uploading 150MB reaction video** → Should get "under 100MB" error
4. **Try uploading a .txt file renamed to .mp4** → Should be rejected

