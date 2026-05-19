---
name: force-regenerate
description: Use when an order's song generation is stuck (lyrics_ready, audio_generating past 45 min, permanently_failed) and the customer is waiting. Triggers automation-trigger with forceRun=true for a single order. Mutating action — ~1.2 credits per invocation.
---

# Force Regenerate

Hard-scoped recovery action: invoke the `automation-trigger` edge function with `forceRun: true` for **one** specific order. Bypasses retry caps, rate-limit timers, and "already in progress" guards.

## When to use

- Stuck-order diagnosis (see `stuck-order-diagnostic` skill) identified a recoverable stall AND customer is waiting.
- `automation_status` is `permanently_failed`, `rate_limited` (and you want to skip the timer), `lyrics_ready` (dead-end), or stuck `audio_generating` past 45 min.
- User explicitly approved the regeneration.

## When NOT to use

- Order is `dismissed_at is not null` or `status='cancelled'` → trigger refuses.
- Order is already `completed` and `sent` — use `resend_delivery` instead.
- Diagnostic hasn't been run yet — diagnose first, then ask user.
- Multiple orders — run this skill once per order, never loop.

## Inputs

- `order_id` (UUID) or short ID (resolve via `find_orders_by_short_id` first).
- Decide: `skipLyrics`?
  - **true** if `automation_lyrics` is present and good (the lyrics-ready dead-end case, or audio-only failure). Preserves lyrics, only regenerates audio. **Required** for the lyrics-ready recovery pattern (see memory `lyrics-ready-dead-end-recovery`).
  - **false** if lyrics are missing, bad, or you want a fresh take.

## Invocation

```bash
curl -X POST "$SUPABASE_URL/functions/v1/automation-trigger" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"orderId":"<uuid>","forceRun":true,"skipLyrics":<bool>}'
```

From tools, use `supabase--curl_edge_functions` or `supabase--test_edge_functions` with the same body. Method MUST be POST (memory `edge-function-method-standard`).

## Expected response

```json
{
  "success": true,
  "entityType": "order",
  "entityId": "<uuid>",
  "status": "audio_generating",
  "taskId": "<suno-task-id>",
  "lyricsTitle": "...",
  "lyricsSkipped": true|false
}
```

## Report back to user

1. Confirm trigger fired: status now `audio_generating`, taskId logged.
2. ETA: 1–3 minutes for Suno callback.
3. Cost note: ~1.2 credits consumed (lyrics + audio + bonus track if `skipLyrics=false`; ~0.6 if `skipLyrics=true`).
4. Tell user to watch the order — Suno callback will flip status to `completed` and scheduler will dispatch delivery email per `target_send_at`.

## Failure modes

- `409 Lead is dismissed` / `Order is cancelled` → cannot proceed.
- `400 Cannot skip lyrics generation: no existing lyrics found` → retry with `skipLyrics:false`.
- `500 Lyrics/Audio generation failed` → check `automation-generate-lyrics` / `automation-generate-audio` logs; do not auto-retry (Suno may be down).

## Do not

- Do not loop or batch — one order per call.
- Do not call without user approval after diagnosis.
- Do not edit rows manually before triggering — the function handles state reset.
- Do not use this for leads — same function supports `leadId`, but lead recovery has its own workflow.