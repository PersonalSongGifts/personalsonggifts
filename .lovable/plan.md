

## Fix: Bonus Track Sync, Genre Labels, and Callback Safety

### Summary

Four fixes to prevent stale bonus tracks, fragile labeling, and race conditions. Leads keep getting bonus generation (no change there per your request).

---

### Fix 1: Clear Bonus Columns on All Regeneration Paths

When the primary song is regenerated, the bonus must also be regenerated (lyrics changed, genre changed, name spelling changed, etc.). Payment fields are preserved — if someone paid $19.99, they keep that unlock.

**9 bonus columns to reset to null:**
`bonus_song_url`, `bonus_preview_url`, `bonus_song_title`, `bonus_cover_image_url`, `bonus_automation_status`, `bonus_automation_task_id`, `bonus_automation_started_at`, `bonus_automation_last_error`, `bonus_style_prompt`

**3 paths to update:**

| File | Handler | What to do |
|------|---------|------------|
| `admin-orders/index.ts` | `review_revision` approve path (~line 2488–2511) | Add 9 bonus resets into `orderUpdate` inside the `if (needsRegeneration)` block |
| `admin-orders/index.ts` | `regenerate_song` handler (~line 2162–2196) | Add 9 bonus resets into `clearUpdates` (for orders only) |
| `cs-agent-actions/index.ts` | `regenerateSong` (~line 77–87) | Add 9 bonus resets into the `update` object |

Note: `submit-revision/index.ts` does NOT do auto-approve regeneration — it only submits the request. So no changes needed there.

---

### Fix 2: Fix Genre Label Logic in `get-song-page`

**File:** `get-song-page/index.ts` (~lines 158–160)

Replace brittle `bonus_song_title.includes("(R&B")` with logic that checks `bonus_style_prompt` (the authoritative source):

```
bonus_genre_label: (() => {
  const prompt = (order.bonus_style_prompt || "").toLowerCase();
  if (prompt.includes("r&b") || prompt.includes("rnb")) return "R&B";
  if (prompt.includes("acoustic")) return "Acoustic";
  if (order.bonus_song_title?.includes("(R&B")) return "R&B";
  return "Acoustic";
})()
```

Also add `bonus_style_prompt` to the `selectFields` string so it's actually fetched from the database.

---

### Fix 3: Task ID Validation on Bonus Callbacks

**File:** `automation-suno-callback/index.ts` (~line 337–346)

After the existing bonus idempotency guards (checking `bonus_song_url` and `bonus_automation_status`), add a stale task check:

```typescript
if (entity.bonus_automation_task_id && entity.bonus_automation_task_id !== taskId) {
  console.log(`[CALLBACK] Stale bonus callback: expected ${entity.bonus_automation_task_id}, got ${taskId}`);
  return new Response("Stale bonus callback", { status: 200, headers: corsHeaders });
}
```

This prevents an old in-flight Suno task from overwriting a freshly regenerated bonus track after an admin manually triggered a new one.

---

### Files Modified

| File | Change |
|------|--------|
| `supabase/functions/admin-orders/index.ts` | Bonus resets in `review_revision` and `regenerate_song` |
| `supabase/functions/cs-agent-actions/index.ts` | Bonus resets in `regenerateSong` |
| `supabase/functions/get-song-page/index.ts` | Genre label uses `bonus_style_prompt`, add to select |
| `supabase/functions/automation-suno-callback/index.ts` | Task ID match guard for bonus callbacks |

No database migrations needed. No changes to lead bonus generation — leads continue to get bonus tracks.

