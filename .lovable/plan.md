
# Fix Email Addresses & True 45-Second Audio Preview

## Summary
Two issues to fix:
1. **Wrong email address** - `hello@personalsonggifts.com` needs to change to `support@personalsonggifts.com` on all customer-facing pages
2. **Preview audio is only ~35 seconds** - The server-side byte-slicing doesn't work correctly; we need to generate the preview client-side using proper audio decoding

---

## Part 1: Email Address Updates

Replace `hello@personalsonggifts.com` with `support@personalsonggifts.com` in these files:

| File | Line | Current | Change To |
|------|------|---------|-----------|
| `src/pages/SongPreview.tsx` | 324 | `hello@personalsonggifts.com` | `support@personalsonggifts.com` |
| `src/pages/Checkout.tsx` | 420 | `hello@personalsonggifts.com` | `support@personalsonggifts.com` |
| `src/pages/Confirmation.tsx` | 93-96 | `hello@personalsonggifts.com` | `support@personalsonggifts.com` |
| `src/pages/PaymentSuccess.tsx` | 203-205 | `hello@personalsonggifts.com` | `support@personalsonggifts.com` |
| `src/components/home/FAQSection.tsx` | 71 | `hello@personalsonggifts.com` | `support@personalsonggifts.com` |
| `src/components/layout/Footer.tsx` | 28, 31 | `hello@personalsonggifts.com` | `support@personalsonggifts.com` |

---

## Part 2: Fix Audio Preview Duration

### Root Cause
The current server-side function (`upload-song`) uses byte-slicing to create previews:
```typescript
// Current broken logic - guesses bytes instead of actual time
const estimatedBytesPerSecond = 16 * 1024; // Assumes 128kbps
const previewBytes = durationSeconds * estimatedBytesPerSecond;
```
This fails because:
- Variable bitrate (VBR) audio doesn't have consistent bytes-per-second
- File headers/metadata aren't accounted for
- Result: ~35 seconds of audio in a file that says it's longer

### Solution
Generate the preview **client-side** using the Web Audio API (which correctly decodes audio by time), then send it to the server.

### Files to Modify

#### 1. `src/components/admin/LeadsTable.tsx`
Update `handleUploadSong` to:
- Import `createAudioPreview` from `@/lib/audioClipper`
- Before uploading, generate a 45-second WAV preview using `createAudioPreview()`
- Append the preview file to the form data
- Show "Generating preview..." progress state

```typescript
// New flow in handleUploadSong:
setUploadProgress(10);
setUploadProgressText("Generating 45-second preview...");

// Generate preview client-side using Web Audio API
const previewBlob = await createAudioPreview(selectedFile);
const previewFile = new File([previewBlob], "preview.wav", { type: "audio/wav" });

setUploadProgress(30);
setUploadProgressText("Uploading...");

const formData = new FormData();
formData.append("file", selectedFile);
formData.append("previewFile", previewFile); // <-- NEW
formData.append("leadId", selectedLead.id);
// ...
```

#### 2. `supabase/functions/upload-song/index.ts`
Update to accept and use the client-generated preview:
- Check if `previewFile` exists in form data
- If present, use it directly instead of calling `createPreviewClip()`
- If not present (backwards compatibility), fall back to byte-slicing

```typescript
// Check for client-generated preview
const previewFile = formData.get("previewFile") as File | null;

let previewBytes: Uint8Array;
let previewContentType: string;

if (previewFile && previewFile instanceof File) {
  // Use client-generated preview (accurate timing)
  previewBytes = new Uint8Array(await previewFile.arrayBuffer());
  previewContentType = previewFile.type || "audio/wav";
} else {
  // Fallback to byte-slicing (less accurate)
  previewBytes = createPreviewClip(uint8Array, 45);
  previewContentType = file.type || "audio/mpeg";
}
```

---

## Technical Notes

- The `createAudioPreview()` function in `src/lib/audioClipper.ts` already uses proper Web Audio API decoding and outputs a valid WAV file with correct duration metadata
- WAV files have accurate duration headers, so the player will show the correct time
- Existing 35-second previews won't change - only new uploads will get accurate 45-second previews
- To fix existing leads, re-upload the song file

---

## Affected Pages After Fix
- Preview page (`/preview/:token`) - will show `support@` email
- Checkout page - will show `support@` email
- Confirmation page - will show `support@` email
- Payment success page - will show `support@` email
- Footer (all pages) - will show `support@` email
- FAQ section (home page) - will show `support@` email
- New lead uploads - will have accurate 45-second previews
