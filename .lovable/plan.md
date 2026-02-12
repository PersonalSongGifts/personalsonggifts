

## Fix Lyrics/Audio Mismatch on Lead-to-Order Conversion

### What Happened (Hannah's Case)
Order `350B2B5B` inherited the correct audio file from lead `4FF1AABB` ("Oh Jim you treat me like a queen in a crown"), but the system then independently regenerated new lyrics ("Oh Jim you're the hero in my story"), creating a mismatch. Hannah paid $4.99 to unlock lyrics that don't match her song.

### Immediate Database Fix
Copy the correct lyrics and song title from lead `4FF1AABB` onto order `350B2B5B`:
- Set `automation_lyrics` to the lead's lyrics ("Oh, Jim, you treat me like a queen in a crown...")
- Set `song_title` to "Oh Jim you treat me like a queen in a crown"

### Systemic Fix (2 files)

**1. `supabase/functions/process-lead-payment/index.ts` (line ~207)**

Current code triggers lyrics generation whenever `lead.automation_lyrics` is missing:
```
if (!lead.automation_lyrics) { trigger automation-generate-lyrics }
```

Change to only trigger when BOTH lyrics AND audio are missing:
```
if (!lead.automation_lyrics && !lead.full_song_url) { trigger automation-generate-lyrics }
```

If the lead already has audio, its paired lyrics are the correct ones -- regenerating would create a mismatch. If the lead has audio but somehow lost its lyrics, the admin can manually trigger regeneration.

**2. `supabase/functions/automation-generate-lyrics/index.ts` (after line ~203)**

Add a safety guard after fetching entity data: if the entity already has a `song_url` (orders) or `full_song_url` (leads), skip lyrics generation entirely. This prevents any code path from overwriting lyrics that are already paired with generated audio.

```typescript
// Guard: never regenerate lyrics when audio already exists
const audioUrl = rawEntity.song_url || rawEntity.full_song_url;
if (audioUrl) {
  console.log(`[LYRICS] Audio already exists for ${entityType} ${entityId}, skipping to preserve pairing`);
  return new Response(
    JSON.stringify({ error: "Audio already generated, lyrics locked" }),
    { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}
```

This guard is placed AFTER the manual override check (line 210) so admin "Regenerate Song" flows (which clear all artifacts first) still work correctly.

### Why This Is Safe
- Admin "Regenerate Song" clears `song_url`, `automation_lyrics`, and all timestamps before triggering fresh generation -- the new guard won't block it.
- Admin "AI Generate" override sets `automation_manual_override_at` which is already checked earlier (line 210).
- The only scenario blocked is automated/fallback lyrics generation when audio already exists -- exactly the bug that caused Hannah's issue.
