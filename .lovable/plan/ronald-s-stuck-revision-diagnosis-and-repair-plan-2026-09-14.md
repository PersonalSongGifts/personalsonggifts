# Ronald's stuck revision — diagnosis and repair plan

## What happened (evidence)

Ronald Mahabir's preview (lead `c98bfc06…`, recipient renamed to Dionne) is in this exact state:

- Revision auto-approved Sep 8 16:48 UTC ("recipient name updated; genre updated; pronunciation updated"), `revision_status = processing` ever since.
- The revision reset wiped the preview (`preview_song_url` null, lyrics null, task null) but intentionally kept the **old** finished song in `full_song_url`.
- One recovery cycle ran (Sep 8: "Auto-recovered from stuck pending"), then a second (Sep 9: "Auto-recovered never-started lead"). Nothing since — no lyrics, no audio, 6 days of silence.
- Win-back email 3 still went out Sep 14 13:05 UTC, pointing at a preview page that has no song.
- Nothing is dismissed, no manual override, quality score 60 is above the current threshold of 20, and there is **no already-generated corrected song anywhere** (song history empty, no newer file).

### Cause 1 — the rewrite is blocked by a guard meant for finished songs

The lyrics step refuses to run whenever a song file already exists (`automation-generate-lyrics`, "Audio already generated, lyrics locked" → 409). After a preview revision the lead still holds its *old* song file, so every regeneration attempt is rejected instantly. The record then sits in `pending`, gets auto-reset to empty 15 minutes later, and the loop repeats. The revision can never complete. This is not specific to Ronald: **31 previews are stuck this way**, the oldest requested Sep 7.

### Cause 2 — the queue never gets back to him

The generation queue takes the oldest waiting previews first and only runs a few at a time. Seven equally-stuck records sit ahead of Ronald, so his retry slot never comes around, which is why the record went completely quiet after Sep 9 instead of visibly failing.

### Cause 3 — win-back emails ignore readiness

The stage-2/stage-3 win-back queries only require that *some* song file exists. They do not check `revision_status` or whether the current preview is actually present, so a customer waiting on a rewrite gets marketing mail for a broken link. One such send has already happened (Ronald's).

## Repair plan (smallest safe set)

**1. Stop the bad emails first (no generation, no cost).**
In `process-scheduled-deliveries` `runFollowupStage`, exclude leads that are mid-revision or have no live preview: skip when `revision_status` is `processing`/`pending`, or when `preview_song_url` is null. Same guard added to the stage-1 follow-up query.

**2. Let a revision actually regenerate.**
Make the audio-exists lock ignore the stale file when a revision is in flight: in `automation-generate-lyrics`, treat the lock as satisfied only when the *current* asset exists — for leads use `preview_song_url` (not `full_song_url`) when `revision_status = 'processing'`. Orders keep today's behaviour unchanged.

**3. Make the failure loud instead of silent.**
When the lyrics step returns 409, `automation-trigger` should record the reason on the record and stop looping into `pending`, so these land in the attention queue instead of vanishing.

**4. Then, and only then, one controlled regeneration for Ronald.**
After 1–3 are deployed, trigger his lead alone and watch it through lyrics → audio → preview email. No other lead is touched in this step.

**5. Backlog decision — yours, separately.**
The other 30 stuck previews are the same bug. Once Ronald's path is proven, we drain them in small batches. Nothing about them changes in this plan.

## Cost and risks

- **Cost:** there is no salvageable corrected asset, so Ronald needs one fresh generation: one lyrics pass plus one song render — the standard cost of a single preview, no extra. Draining the remaining 30 later is 30 more single generations; that is a separate approval.
- **Risk — wrong song delivered:** the old song is for the old name/genre. It must never be presented as the revised version. Restoring it is explicitly excluded.
- **Risk — mass regeneration:** relaxing the lock frees 31 records at once, which could flood the queue and its spend. Mitigation: the queue's concurrency cap stays untouched, and I keep the backlog paused (leaving those records as they are) until you approve a drain.
- **Risk — double-charging generation:** the lock relaxation is scoped to `revision_status = 'processing'` only, so finished songs still can never be re-written.
- **Testing boundary:** verification is Ronald's single lead plus read-only queries. No emails to anyone else, no bulk triggers, no data rewrites beyond the one regeneration.

## Files touched

- `supabase/functions/process-scheduled-deliveries/index.ts` — readiness guard in follow-up stages 1–3.
- `supabase/functions/automation-generate-lyrics/index.ts` — revision-aware asset lock.
- `supabase/functions/automation-trigger/index.ts` — record the 409 reason, stop the silent retry loop.

Deploy scope: those three functions only. No site publish, no migrations, no other leads.
