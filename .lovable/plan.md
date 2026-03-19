

## Monitoring Edge Function: `monitoring-status`

### Overview
Create a read-only edge function that returns aggregate counts of system health metrics, polled by OpenClaw every 15 minutes. No PII exposed, secured by a static API key header.

### Schema Issue: `input_edit_conflicts`
The `orders` table has **no `updated_at` column**, so query #4 as specified won't work. Alternative: count orders where `pending_revision = true` AND `automation_status` IN active states — this captures the real conflict scenario (customer edited after generation started). Will also check `revision_requested_at > automation_started_at` as a proxy.

### Implementation

**New file:** `supabase/functions/monitoring-status/index.ts`

**Security:** Validate `X-Monitor-Key` header against a stored secret (`MONITOR_API_KEY`). Will add this secret and have you set the value to `psg-monitor-2026-secure` (or whatever you prefer).

**Config:** Add `[functions.monitoring-status]` with `verify_jwt = false` to config.toml.

**Six queries (all COUNT-only, both `orders` + `leads` tables combined where applicable):**

| Metric | Query Logic |
|--------|-------------|
| `stuck_orders` | `automation_status IN ('lyrics_generating','audio_generating')` AND `automation_started_at < NOW() - 45 min` — both orders + leads |
| `failed_generations` | `automation_status IN ('failed','permanently_failed')` AND `automation_retry_count >= 3` — both tables |
| `rate_limited_jobs` | `automation_status = 'rate_limited'` — both tables |
| `input_edit_conflicts` | `pending_revision = true` AND `automation_status IN ('lyrics_generating','audio_generating','completed')` — orders only |
| `pending_delivery` | `target_send_at < NOW() + 1 hour` AND `sent_at IS NULL` AND `dismissed_at IS NULL` — both tables |
| `unconverted_leads_24h` | `status = 'lead'` AND `captured_at < NOW() - 24 hours` AND `follow_up_sent_at IS NULL` AND `dismissed_at IS NULL` — leads only |

**Error handling:** Each query wrapped in try/catch; returns `-1` for failed metrics plus an `errors` array.

**Response format:** Exact JSON shape requested, plus an `errors` field if any query fails.

### Steps
1. Add `MONITOR_API_KEY` secret (you set value)
2. Create the edge function
3. Deploy and test

### Technical Details
- Uses service role key internally for queries (all tables have RLS blocking public access)
- CORS wide open as requested
- No mutations — pure SELECT counts

