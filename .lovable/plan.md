

## Audit Result + Two New Bugs Found

### Audit: False Converted Leads

**Zero remaining false time-based conversions.** All 103 previously identified records are clean.

Note: 102 converted leads have minor detail mismatches (e.g. user typed "Shakiethia (Keke)" as lead then "Keke" at checkout). These are legitimate same-session conversions where the user tweaked details — not false attributions. No action needed.

---

### Bug 1: Lead Overwrite Destroys Generated Songs

**Severity: High — 218 active records affected**

**Problem:** When a returning user with the same email submits a new lead for a *different* song, `capture-lead` overwrites the creative fields (recipient, occasion, genre, etc.) on the existing lead row. But it does NOT reset:
- `preview_song_url`, `full_song_url`, `song_title`, `cover_image_url` (old song stays)
- `automation_status`, `automation_lyrics` (old generation data stays)
- `preview_sent_at`, `preview_token`, `status` (old delivery state stays)
- `inputs_hash`, `lyrics_language_code`

And it does NOT re-trigger automation (that only runs for new inserts).

**Result:** The lead now has Song B's details with Song A's audio attached. If they receive a preview email, they hear the wrong song. No new song is ever generated.

**Fix (in `capture-lead/index.ts`):** When updating an existing lead, detect if creative fields actually changed (compare `inputs_hash`). If they did:
1. Reset all generated content fields to NULL (`preview_song_url`, `full_song_url`, `automation_lyrics`, `song_title`, `cover_image_url`, `automation_status`, `automation_task_id`)
2. Reset delivery state (`preview_sent_at`, `preview_played_at`, `preview_play_count`, `follow_up_sent_at`, `sent_at`, `generated_at`, `status` back to `'lead'`)
3. Recompute `inputs_hash` and `lyrics_language_code`
4. Re-trigger `triggerAutomationIfQualified` so a new song generates

**Files:** `supabase/functions/capture-lead/index.ts`

---

### Bug 2: Lead Preview Emails Ignore Email Suppressions

**Severity: Medium — CAN-SPAM compliance risk**

**Problem:** The `email_suppressions` table (122 entries) is checked before sending follow-up emails and remarketing, but NOT before sending:
- Automated lead preview emails (in `process-scheduled-deliveries` section 6, line 934)
- Manual lead preview emails (in `send-lead-preview`)

If a user unsubscribes and later a preview email is queued for them, it sends anyway.

**Fix:** Add a suppression check before sending in both locations:
1. In `process-scheduled-deliveries` section 6: query `email_suppressions` and skip any lead whose email is in the suppressed set (same pattern already used in section 8 for follow-ups)
2. In `send-lead-preview`: check `email_suppressions` for the target email before sending

**Files:**
- `supabase/functions/process-scheduled-deliveries/index.ts`
- `supabase/functions/send-lead-preview/index.ts`

---

### Summary of Changes

| File | Change |
|------|--------|
| `supabase/functions/capture-lead/index.ts` | Detect creative field changes on update; reset generated content and re-trigger automation |
| `supabase/functions/process-scheduled-deliveries/index.ts` | Add suppression check before lead preview emails |
| `supabase/functions/send-lead-preview/index.ts` | Add suppression check before sending |

