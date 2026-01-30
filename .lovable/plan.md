

# Implementation Plan: Cover Art & Reaction Flow Fixes

## Summary
This plan addresses two issues: (1) removing the redundant cover art upload from Admin since MP3 files already contain embedded artwork, and (2) fixing the case-sensitive email lookup that's preventing customers from finding their orders on the reaction submission page.

---

## Issue 1: Remove Cover Art Upload

### Problem
The Admin panel currently has a separate section to upload album artwork, but the MP3 files you upload already contain embedded cover art in their ID3 metadata. This is redundant work.

### Solution
Remove the cover art upload functionality from the Admin panel entirely. The system already has occasion-based fallback images that display automatically when no custom cover is set.

### Changes Required

**File: `src/pages/Admin.tsx`**
- Remove the `selectedCoverFile` state and `coverInputRef`
- Remove the `handleCoverSelect` and `handleUploadCover` functions  
- Remove the `uploadingCover` state
- Remove the entire "Album Artwork" section from the Order Details dialog (lines 719-770)
- Remove the `Image` icon import

**File: `supabase/functions/upload-song/index.ts`**
- Remove the cover upload handling (`fileType === "cover"` logic)
- Simplify to only handle audio file uploads

---

## Issue 2: Fix Email Lookup for Reaction Submission

### Problem
When customers go to `/submit-reaction` and enter their email address, the lookup fails because of case-sensitivity. The database stores emails like `Ryan@hyperdrivelab.com`, but when a user types `ryan@hyperdrivelab.com`, the Supabase `.eq()` comparison fails.

### Root Cause
```typescript
// Current code (CASE-SENSITIVE)
.eq("customer_email", email.toLowerCase().trim())
```

This lowercases the user input but compares against the original mixed-case email in the database.

### Solution
Use PostgreSQL's case-insensitive comparison with `.ilike()`:

```typescript
// Fixed code (CASE-INSENSITIVE)
.ilike("customer_email", email.trim())
```

### Changes Required

**File: `supabase/functions/upload-reaction/index.ts`**
- Line 36: Change `.eq("customer_email", email.toLowerCase().trim())` to `.ilike("customer_email", email.trim())`
- Line 97: Change the email comparison in the upload verification to also be case-insensitive

---

## Technical Details

### Files Modified
1. `src/pages/Admin.tsx` - Remove cover art upload UI and related state/handlers
2. `supabase/functions/upload-song/index.ts` - Remove cover upload logic
3. `supabase/functions/upload-reaction/index.ts` - Fix case-insensitive email lookup

### Database
No database changes required. The `cover_image_url` column can remain (unused columns don't cause issues).

### Testing After Implementation
1. Go to `/admin` → Open an order → Verify cover art upload section is gone
2. Go to `/submit-reaction` → Enter email in any case → Should find the order
3. Upload a song and deliver → Customer receives email with branded player page
4. Player page shows occasion-based fallback image when no cover set

