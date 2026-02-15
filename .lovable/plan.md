

## Regenerate Song with Admin-Edited Lyrics

### Additional Pitfalls Identified

**1. Suno callback overwrites `song_title`**
The `automation-suno-callback` function likely sets `song_title` from the Suno response metadata. If the admin has a custom title they want to keep, the callback could overwrite it. However, the current `automation-generate-audio` sends `entity.song_title` as the `title` parameter to Suno, so Suno should echo it back. Low risk but worth noting -- the callback should preserve the existing title if one is set.

**2. The "Regenerate with Current Lyrics" button needs clear visibility rules**
It should only appear when `automation_lyrics` is non-empty AND a song already exists. If lyrics are empty (e.g., song was manually uploaded without AI lyrics), clicking this button would fail at the audio generation step.

**3. Admin expectation management: the song WILL sound completely different**
This is the biggest customer-facing risk. An admin might think "fix two words in the lyrics" means the song stays mostly the same. It won't. The melody, tempo, vocal style, and instrumentation will all change. The tooltip/hover text must make this crystal clear.

### Technical Changes

**File 1: `supabase/functions/automation-trigger/index.ts`**
- Add `skipLyrics` parameter (default `false`) to the request body
- When `skipLyrics` is true: validate `automation_lyrics` exists on the entity, then skip Step 1 (lyrics generation) and go straight to Step 2 (audio generation)
- Return response indicating lyrics were preserved

**File 2: `supabase/functions/admin-orders/index.ts`**
- Add `action === "regenerate_with_lyrics"` handler near the existing `regenerate_song` handler
- Validate that `automation_lyrics` is non-empty before proceeding
- Clear only audio artifacts: `song_url`/`preview_song_url`, `cover_image_url`, `automation_task_id`, `automation_audio_url_source`, `automation_raw_callback`, `automation_style_id`, `automation_status`, `automation_started_at`, `automation_retry_count`, `automation_last_error`, `generated_at`, `next_attempt_at`, `sent_at`/`preview_sent_at`
- Clear `automation_manual_override_at` (required -- the `automation-generate-audio` function blocks on line 94 if this is set)
- Preserve: `automation_lyrics`, `lyrics_language_qa`, `lyrics_raw_attempt_1`, `lyrics_raw_attempt_2`, `song_title`, `inputs_hash`
- Set `target_send_at` and `earliest_generate_at` based on `sendOption`
- Call `automation-trigger` with `skipLyrics: true` and `forceRun: true`
- Log activity as `"song_regenerated_with_lyrics"`

**File 3: `src/pages/Admin.tsx` (Order detail dialog)**
- Rename existing "Regenerate Song" button label to **"Regenerate New Song"**
- Add tooltip on hover: "Generates brand new lyrics AND a new melody from scratch. The entire song will be replaced."
- Add new **"Regenerate with Current Lyrics"** button (visible only when `automation_lyrics` is non-empty AND `song_url` exists)
- Add tooltip on hover: "Keeps the current lyrics but generates a completely new melody, tempo, and vocals. Use this after editing lyrics to fix mistakes."
- Both buttons open the same delivery option dialog but pass a flag indicating which mode
- Add a warning banner inside the dialog when in "current lyrics" mode: "The melody will be completely different from the original. Only the lyrics text will be preserved."

**File 4: `src/components/admin/LeadsTable.tsx` (Lead detail dialog)**
- Same two-button pattern as Admin.tsx
- Rename existing button to **"Regenerate New Song"** with tooltip: "Generates brand new lyrics AND a new melody from scratch."
- Add **"Regenerate with Current Lyrics"** button with tooltip: "Keeps current lyrics, generates new melody. Use after editing lyrics."
- Both visible only when a song already exists; the "with current lyrics" button additionally requires `automation_lyrics` to be non-empty

### No Database Changes Required

All fields already exist on both the `orders` and `leads` tables.

### Race Condition Safety

Between clearing `automation_manual_override_at` and the Suno callback completing (~1-3 min), the background cron could theoretically pick up the record. This is safe because `automation_status` will be set to `audio_generating` by the audio function, which the cron skips.

