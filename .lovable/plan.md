

## Increase Reaction Video Upload Limit to 2GB

### The Problem
Currently the upload flows through the Edge Function (`upload-reaction`), which has a ~150MB infrastructure limit (Deno Deploy). Simply changing the constant won't work for larger files.

### Solution: Direct-to-Storage Upload
Upload the video directly to Supabase Storage from the browser (supports up to 5GB with resumable uploads), then call the edge function with just the metadata to link it to an order.

### Changes

**1. Edge Function: `upload-reaction/index.ts`**
- Update `MAX_VIDEO_SIZE` constant to `2 * 1024 * 1024 * 1024` (2GB)
- Add a new action `"link-reaction"` that accepts JSON with `{ email, name, orderId?, fileName }` — does the order-matching and DB update logic without receiving the video binary
- Keep existing `"upload"` and `"direct-upload"` actions working for smaller files as fallback

**2. Client: `src/pages/ShareReaction.tsx`**
- Update `MAX_FILE_SIZE` to 2GB
- Change upload flow:
  1. Generate a UUID filename client-side
  2. Upload video directly to `reactions` bucket via `supabase.storage.from("reactions").upload()`
  3. On success, call `upload-reaction` with action `"link-reaction"` passing email, name, orderId, and fileName
  4. Use the storage upload's progress events for real upload progress (replacing the fake interval)
- Keep validation (file type, size) on client side
- Update error message from "150MB" to "2GB"

**3. Client: `src/pages/SubmitReaction.tsx`**
- Update size references/error messages to 2GB
- Same direct-to-storage pattern for the existing upload flow

### Why This Approach
- The `reactions` bucket is already public, so no auth issues with direct uploads
- Resumable uploads handle large files reliably with real progress tracking
- The edge function still handles all the business logic (order matching, rate limiting, DB updates)
- Backward compatible — smaller files still work fine

### Security Note
- Rate limiting still enforced server-side in the `link-reaction` action
- Video type validation stays on both client and server (server validates the storage object exists)

