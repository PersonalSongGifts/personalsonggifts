---
name: stuck-order-diagnostic
description: Use when investigating stuck orders or leads — especially lyrics_ready records that never moved to audio generation, or jobs sitting in lyrics_generating / audio_generating past 45 min. Read-only diagnosis only, no fixes or retriggers.
---

# Stuck Order Diagnostic

Read-only flow for diagnosing why an order or lead is stuck in the automation pipeline. **Do not** call `automation-trigger`, mutate rows, or run migrations. Goal is a clean findings report the user can act on.

## When to use

- User asks "what's up with order XXXX" and the record is mid-pipeline (not `completed` / `delivered`).
- Order/lead in `lyrics_ready`, `lyrics_generating`, `audio_generating`, `rate_limited`, `failed`, or `permanently_failed`.
- Monitoring flagged `stuck_orders` / `failed_generations` / `pending_delivery`.
- Lead-converted order sitting at `lyrics_ready` with no audio task (the known dead-end — see memory `lyrics-ready-dead-end-recovery`).

## Inputs

Short order ID (first 8 chars, customer-facing) **or** full UUID. If short ID, resolve with `find_orders_by_short_id` or `id::text ILIKE 'XXXX%'`. Same pattern for `leads.id`.

## Diagnostic steps

Run these as parallel `supabase--read_query` calls where possible.

### 1. Pull the record

```sql
select id, created_at, status, automation_status, automation_task_id,
       automation_retry_count, short_retry_count, content_filter_strikes,
       automation_last_error, automation_started_at, generated_at, sent_at,
       next_attempt_at, earliest_generate_at, target_send_at,
       dismissed_at, pending_revision,
       song_url is not null as has_song,
       automation_lyrics is not null as has_lyrics,
       lyrics_word_count,
       delivery_status, delivery_last_error, delivery_retry_count,
       bonus_automation_status, bonus_automation_last_error,
       inputs_hash
from orders where id = '...';
```

Same shape for `leads` (swap `song_url` → `preview_song_url`, add `quality_score`, `converted_at`, `order_id`).

### 2. Activity log

```sql
select created_at, event_type, actor, details, metadata
from order_activity_log
where entity_id = '...' and entity_type = 'order'
order by created_at desc limit 30;
```

Look for: last successful step, last error, gaps > 5 min between expected events, repeated retries on same step.

### 3. Edge function logs

Use `supabase--edge_function_logs` filtered by the order/lead UUID (or `automation_task_id` for Suno-side issues). Check in this order based on `automation_status`:

| Status | Function to check |
|---|---|
| `pending` / never started | `automation-trigger`, `process-scheduled-deliveries` (scheduler) |
| `lyrics_generating` | `automation-generate-lyrics` |
| `lyrics_ready` (stuck — no audio) | `automation-generate-audio`, `process-scheduled-deliveries` (was it picked up?) |
| `audio_generating` | `automation-generate-audio`, `automation-suno-callback` (look for taskId) |
| `completed` but no delivery | `send-song-delivery`, `process-scheduled-deliveries` |
| `rate_limited` | check `next_attempt_at`; scheduler logs |
| `failed` / `permanently_failed` | search `automation_last_error` |

### 4. Scheduler context

```sql
-- Most recent scheduler run + concurrency window
-- (logs only; no query needed)
```
Check `process-scheduled-deliveries` logs for `[SCHEDULER] Active jobs: X (Y orders, Z leads), order slots: A, lead slots: B`. If slots = 0, scheduler couldn't admit new work — possibly capped at 9 concurrent.

### 5. Special cases to check explicitly

- **Lyrics-ready dead end** (memory `lyrics-ready-dead-end-recovery`): `automation_status='lyrics_ready'` + `automation_lyrics is not null` + `song_url is null` + lead-converted (`source='lead'` or matching lead row). Scheduler will NOT auto-pick these up — they need `automation-trigger` with `skipLyrics=true`. **Report only — do not trigger.**
- **Content filter loop**: `content_filter_strikes >= 5` → blocked, needs softening (memory `content-filter-retry-strategy`).
- **Short-song retry loop**: `short_retry_count > 0` with `automation_status='audio_generating'` (memory `short-song-quality-retries`).
- **Input edit conflict**: `pending_revision = true` while `automation_status in ('lyrics_generating','audio_generating','completed')`.
- **Permanently failed**: `automation_retry_count >= 3` + `automation_status='permanently_failed'` → requires manual `forceRun`.
- **Dismissed**: `dismissed_at is not null` → scheduler skips intentionally.
- **Restore-in-progress / version slot issue**: check `prev_song_url` and `song_history`.

## Output format

Report to user with:

1. **One-line verdict** — e.g. "Lead-converted order stuck at `lyrics_ready`; scheduler can't progress it because no audio task was ever fired."
2. **Timeline** — created → key events → current state (use PST per project timezone standard).
3. **Root cause** — which step failed/skipped and why (cite log line if possible).
4. **Recommended fix** — name the exact action (e.g. "Call `automation-trigger` with `skipLyrics=true`") but **do not execute it**. Ask the user before any mutation.

## Do not

- Do not call `automation-trigger`, `submit-revision`, or any mutating edge function.
- Do not run migrations or update rows.
- Do not regenerate lyrics or audio.
- Do not clear errors or reset counters.

All fixes are a separate, explicit follow-up after the user sees the diagnosis.