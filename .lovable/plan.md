

## Album Art Change Feature

### Overview
Add the ability for admins to upload or change album artwork for both leads and orders directly from the admin detail dialogs. Currently, cover art is only set automatically when extracted from MP3 ID3 tags during song upload.

### Approach
Since the `admin-orders` edge function uses JSON (not multipart form data), the simplest approach is to reuse the existing `upload-song` function's storage infrastructure. The admin UI will:
1. Let the admin pick an image file
2. Upload it directly to the `songs` storage bucket via the Supabase client
3. Save the public URL to the order/lead via the existing `update_order_fields` / `update_lead_fields` actions

This avoids creating a new edge function or modifying `admin-orders` to handle multipart form data.

### Pitfalls Addressed
- **Cache busting**: Append `?v=timestamp` to the URL so browsers and CDN serve the new image immediately (matching existing pattern used for song URLs).
- **Lead-to-order sync**: If cover art is changed on a lead *after* it has already converted to an order, the order's art won't auto-update. This is acceptable since post-conversion changes are rare and can be done on the order directly.
- **File validation**: Only allow image types (JPEG, PNG, WebP) and enforce a reasonable size limit (5MB) on the client side.
- **Overwrite safety**: Use `upsert: true` in storage upload so replacing art doesn't leave orphaned files.
- **SongPlayer fallback**: No changes needed -- the existing `getCoverImage()` already checks `cover_image_url` first, falling back to occasion images only when null.
- **Storage path convention**: Use `{SHORT_ID}-cover.{ext}` for orders and `leads/{SHORT_ID}-cover.{ext}` for leads, matching the pattern already used by `upload-song`.

---

### Technical Details

#### 1. Backend: Add `cover_image_url` to Whitelists

In `supabase/functions/admin-orders/index.ts`:
- Add `"cover_image_url"` to the `allowedFields` array in **both** `update_order_fields` (line 773) and `update_lead_fields` (line 910) actions.

This allows the admin UI to save the new cover URL after uploading the image to storage.

#### 2. Frontend: Album Art Upload Component

Create a small reusable component or inline section in the order/lead detail dialogs that:
- Displays current cover art (or occasion fallback) as a thumbnail
- Shows a "Change" button that opens a file picker (accept: `image/jpeg, image/png, image/webp`)
- On file selection:
  1. Validates type and size (max 5MB)
  2. Uploads to `songs` bucket at path `{SHORT_ID}-cover.{ext}` (orders) or `leads/{SHORT_ID}-cover.{ext}` (leads)
  3. Gets public URL, appends cache buster `?v={timestamp}`
  4. Calls `update_order_fields` or `update_lead_fields` with `{ cover_image_url: newUrl }`
  5. Logs activity via the existing activity log system
- Shows a "Remove" button if art exists, which sets `cover_image_url` to `null`

#### 3. Storage Upload from Client

The `songs` bucket is public, so we can upload directly using the Supabase JS client:

```typescript
const { error } = await supabase.storage
  .from("songs")
  .upload(path, file, { contentType: file.type, upsert: true });
```

No RLS policy changes needed -- the bucket is already public for reads. For uploads, the service role key in the edge function handles writes. However, since we want to upload from the client, we need to ensure the bucket allows public uploads OR route the upload through the admin-orders edge function.

**Recommended approach**: Route the image through a new `upload_cover_art` action in `admin-orders` that accepts base64-encoded image data in JSON. This keeps the admin password protection and avoids needing storage RLS changes.

Wait -- base64 in JSON is wasteful for large images. Better approach: Add a dedicated lightweight edge function `upload-cover-art` that accepts multipart form data (like `upload-song` does), validates the admin password, uploads to storage, updates the DB, and returns the URL.

**Final approach**: Create a new `upload-cover-art` edge function that:
- Accepts multipart form data with `adminPassword`, `file` (image), `orderId` or `leadId`
- Validates admin password, file type (JPEG/PNG/WebP), and size (max 5MB)
- Uploads to `songs` bucket at the correct path
- Updates `cover_image_url` on the order or lead
- Logs activity
- Returns the new URL

#### 4. Files to Create
- `supabase/functions/upload-cover-art/index.ts` -- new edge function for secure image upload
- No new migration needed (column already exists on both tables)

#### 5. Files to Modify
- `supabase/functions/admin-orders/index.ts` -- add `cover_image_url` to both field whitelists
- `src/pages/Admin.tsx` -- add album art display + change button to order detail dialog
- `src/components/admin/LeadsTable.tsx` -- add album art display + change button to lead detail dialog
- `supabase/config.toml` -- add `upload-cover-art` function config with `verify_jwt = false`
