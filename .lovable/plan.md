

## Auto-Retry Short Songs Instead of Parking in `needs_review`

### Problem
When Suno returns a song under 180 seconds, the callback sets `automation_status = 'needs_review'` and stops. This requires manual admin intervention. It happens frequently enough (4+ orders currently stuck) that it needs automation.

### Solution
When the callback detects a short song (< 180s), instead of parking it in `needs_review`, automatically retry the full pipeline (new lyrics + new audio for both primary and bonus) up to 2 times. Only flag for manual review if all retries produce short songs.

### How It Works

```text
Suno callback receives audio < 180s
  ├── short_retry_count < 2?
  │     YES → increment short_retry_count
  │           set automation_status = "failed" (so cron picks it up)
  │           set automation_last_error = "Song too short (Xs), auto-retrying with new lyrics"
  │           clear automation_lyrics (forces fresh lyrics on retry)
  │           clear bonus columns (bonus will regenerate with new primary)
  │           → cron picks it up on next run, calls automation-trigger → new lyrics → new audio
  │     NO  → set automation_status = "needs_review" (current behavior, manual intervention)
  └── bonus callback short? → just mark bonus failed (it regenerates with primary)
```

### Changes

**1. Database migration** — Add `short_retry_count` column to both `orders` and `leads` tables (integer, default 0). This tracks how many times we've retried specifically for short duration, separate from the general `automation_retry_count`.

**2. `supabase/functions/automation-suno-callback/index.ts`** — In the `estimatedDurationSec < 180` block for primary songs (lines 663-682):
- Read `short_retry_count` from the entity
- If < 2: set status to `failed`, clear `automation_lyrics` and bonus columns, increment `short_retry_count`, log activity "auto-retrying due to short duration"
- If >= 2: keep current `needs_review` behavior

**3. `supabase/functions/automation-trigger/index.ts`** — When `forceRun` is true (admin retry), reset `short_retry_count` to 0 alongside existing retry count resets. No other changes needed — the trigger already handles `failed` status records and regenerates lyrics when `automation_lyrics` is cleared.

**4. `supabase/functions/process-scheduled-deliveries/index.ts`** — No changes needed. The cron already picks up `failed` records and resets them to `queued` for the trigger. The existing `MAX_AUTO_RETRIES` (3) won't interfere because `short_retry_count` is separate.

### Why This Works
- The existing retry pipeline already handles `failed` → `queued` → `automation-trigger` → new lyrics → new audio
- By clearing `automation_lyrics`, the trigger is forced to generate fresh (potentially longer) lyrics
- Bonus columns are cleared so both tracks regenerate together
- After 2 short-song retries, it falls back to manual review as a safety net
- Admin "AI Generate" button resets everything including `short_retry_count`

