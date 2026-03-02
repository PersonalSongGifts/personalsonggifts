

## Fix: Orders/Leads With Songs But Missing Lyrics

### Problem

Some orders and leads have audio files (`song_url` / `full_song_url`) but no `automation_lyrics`. The lyrics section in the admin panel shows empty for these entries, even though the songs are clearly playable.

### Root Cause

Two guards in `automation-generate-lyrics` block lyrics generation when audio already exists:

1. **Line 242**: Manual override guard -- `upload-song` sets `automation_manual_override_at` before triggering lyrics, so the lyrics function immediately aborts
2. **Line 268**: Audio guard -- `song_url` / `full_song_url` exists, so lyrics are "locked" to prevent mismatch

These guards serve a valid purpose (preventing lyrics/audio mismatch during normal pipeline flow), but they also block legitimate cases where we need lyrics generated *after* a song is manually uploaded or already exists.

### Solution

Add a `force` parameter to `automation-generate-lyrics` that bypasses both guards. Use it in the two callers that need it.

### Detailed Changes

#### 1. `supabase/functions/automation-generate-lyrics/index.ts` (3 changes)

- **Parse `force` from request body** (line ~198): Add `force` alongside `leadId` and `orderId` in the destructured body, defaulting to `false`
- **Skip manual override guard when forced** (line ~242): Wrap the existing check with `if (!force)`
- **Skip audio guard when forced** (line ~268): Wrap the existing check with `if (!force)`
- **Prevent status regression** (line ~480): When `force` is true AND the entity already has audio, do NOT set `automation_status` to `"lyrics_ready"` -- instead keep it as `"completed"` (or current value). This prevents delivered/completed orders from regressing to an active pipeline state, which would confuse the admin dashboard and potentially trigger unwanted audio generation
- Add console log noting when force flag is used for audit trail

#### 2. `supabase/functions/upload-song/index.ts` (1 change)

- **Line ~312**: Add `force: true` to the JSON body of the fire-and-forget lyrics generation call, so the lyrics function won't be blocked by the manual override that `upload-song` just set

#### 3. `supabase/functions/process-lead-payment/index.ts` (1 change)

- **Line ~210**: Change condition from `if (!lead.automation_lyrics && !lead.full_song_url)` to `if (!lead.automation_lyrics)` -- trigger lyrics generation even when audio exists. Add `force: true` to the request body

#### 4. New: `supabase/functions/backfill-missing-lyrics/index.ts`

A one-time backfill function that:
- Queries both `orders` and `leads` where `song_url IS NOT NULL AND automation_lyrics IS NULL` (orders) / `full_song_url IS NOT NULL AND automation_lyrics IS NULL` (leads)
- For each record, calls `automation-generate-lyrics` with `force: true`
- Processes records sequentially with a short delay to avoid rate limits
- Returns a summary of how many records were processed
- Requires admin password authentication

#### 5. `supabase/config.toml`

- Add `[functions.backfill-missing-lyrics]` with `verify_jwt = false`

### Critical Safety Consideration: Status Regression

The most important detail is preventing `automation_status` from being set to `"lyrics_ready"` on orders/leads that already have audio and are in a terminal state (`"completed"`, `"delivered"`). When `force` is used:

- Lyrics are saved to `automation_lyrics`
- `song_title` is updated if one was extracted
- `automation_status` is set to `"completed"` (not `"lyrics_ready"`) since audio already exists
- `lyrics_raw_attempt_*` and QA results are saved normally

This prevents the cron job or admin dashboard from treating these records as needing audio generation.

### What Won't Break

- **Normal pipeline flow**: Without `force`, all existing guards remain unchanged -- the pairing integrity between lyrics and audio is preserved
- **Song player page** (`get-song-page`): Already handles `automation_lyrics` being present or absent independently of `song_url`; adding lyrics only improves the experience
- **Admin dashboard**: Orders/leads with both audio and lyrics will now show lyrics in the detail view instead of "No lyrics yet"
- **Delivery emails** (`send-song-delivery`): Already sent based on `song_url` existence, not lyrics
- **Revision flow**: Not affected -- revisions explicitly clear artifacts before regeneration, and the `pending_revision` guard (line 251) runs before the `force` check

### Files Modified

| File | Change |
|------|--------|
| `supabase/functions/automation-generate-lyrics/index.ts` | Add `force` parameter; skip guards when forced; prevent status regression |
| `supabase/functions/upload-song/index.ts` | Pass `force: true` in lyrics generation call |
| `supabase/functions/process-lead-payment/index.ts` | Trigger lyrics gen when audio exists but lyrics missing |
| `supabase/functions/backfill-missing-lyrics/index.ts` | New one-time function to fix existing records |
| `supabase/config.toml` | Register backfill function |

