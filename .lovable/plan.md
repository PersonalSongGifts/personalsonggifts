

# Auto-Generate Lyrics on Manual Song Upload

## What Just Happened
I triggered lyrics generation for Jim's anniversary song (order 350B2B5B) -- it's done and the customer can now unlock the lyrics on their song page.

## The Permanent Fix

When a song is manually uploaded via the `upload-song` edge function and the order has no lyrics yet (`automation_lyrics` is null), automatically trigger lyrics generation in the background.

### Changes to `supabase/functions/upload-song/index.ts`

After the order update succeeds (around line 291-299), add a background call to the `automation-generate-lyrics` function:

```text
1. Check if the order has no automation_lyrics
2. If missing, fire a non-blocking fetch to automation-generate-lyrics with the orderId
3. Log the result but don't block the upload response -- lyrics generation is a nice-to-have, not critical
```

The call will be fire-and-forget style (using `fetch` without `await` on the response body) so it doesn't slow down the upload flow. If it fails for any reason, the admin can still manually trigger it later.

### Technical Detail

- After line ~299 (after the order update), add:
  - Query the order for `automation_lyrics`
  - If null, call the lyrics generation endpoint
  - Log success/failure but don't block the response
- No database migrations needed
- No frontend changes needed

