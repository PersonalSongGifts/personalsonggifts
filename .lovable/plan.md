# Implementation Plan: Cover Art & Reaction Flow Fixes

## Status: ✅ COMPLETED

---

## Issue 1: Remove Cover Art Upload ✅

**Changes Made:**
- `src/pages/Admin.tsx` - Removed `selectedCoverFile` state, `coverInputRef`, `handleCoverSelect`, `handleUploadCover`, `uploadingCover` state, and the entire "Album Artwork" UI section
- `supabase/functions/upload-song/index.ts` - Simplified to only handle audio files (removed cover image logic)

---

## Issue 2: Fix Email Lookup for Reaction Submission ✅

**Changes Made:**
- `supabase/functions/upload-reaction/index.ts` - Changed `.eq("customer_email", ...)` to `.ilike("customer_email", email.trim())` for case-insensitive matching

---

## Testing Checklist
1. ✅ Admin panel no longer shows cover art upload section
2. Test `/submit-reaction` with different email cases (e.g., `Ryan@example.com` vs `ryan@example.com`)
3. Verify song upload still works in admin
4. Verify deliver & send email still works
