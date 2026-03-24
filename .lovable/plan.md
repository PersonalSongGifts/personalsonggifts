

## CS Agent Edge Functions

### Overview
Two new edge functions for the OpenClaw CS agent, plus a shared auth helper. Both use a dedicated `CS_AGENT_KEY` secret (not the admin password).

### Secret
- Add `CS_AGENT_KEY` via the secrets tool with value `csa_k7Qm9xR2vL4pN8wF3jB6tY1dS5hA0eG`

### New Files

**1. `supabase/functions/_shared/cs-agent-auth.ts`**
- Exports `validateCsAgentKey(req)` — reads `X-CS-Agent-Key` header, compares against `CS_AGENT_KEY` env var
- Returns `{ valid: boolean }` 

**2. `supabase/functions/cs-agent-lookup/index.ts`** — Read-only
- Auth via shared helper
- 5 actions routed by `action` field in POST body:
  - `lookup_by_email` → queries orders + leads by email, returns safe field subset (no price/payment fields)
  - `lookup_order` → finds order by short hex ID prefix (`id::text ILIKE shortId || '%'`), returns detail fields
  - `check_song` → returns song metadata + boolean `song_available` flag
  - `get_preview_link` → most recent lead for email, constructs full URL `https://www.personalsonggifts.com/preview/{token}`
  - `get_revision_requests` → all revision_requests for order (looked up by short ID)
- Returns 403 for bad key, 400 for unknown action, 404 for not found

**3. `supabase/functions/cs-agent-actions/index.ts`** — Write operations
- Same auth pattern
- 4 actions:
  - `regenerate_song` → validates order exists & is paid, backs up current song/lyrics/cover to prev_ fields, optionally sets lyrics_override and pronunciation_hints, resets automation_status to `pending`, logs to activity log with actor `cs-agent`
  - `update_lyrics` → sets `automation_lyrics` on order, logs activity
  - `resend_delivery` → internally calls `send-song-delivery` function via fetch (constructs full Supabase function URL), logs activity
  - `send_preview_link` → finds most recent lead by email, internally calls `send-lead-preview` via fetch, logs activity
- Returns 403/400/404/422 as specified
- Every action logs to `order_activity_log` with actor = `cs-agent`

### Config
- Add to `supabase/config.toml`:
  - `[functions.cs-agent-lookup]` with `verify_jwt = false`
  - `[functions.cs-agent-actions]` with `verify_jwt = false`

### Security Constraints (enforced in code)
- Lookup: no price, price_cents, stripe fields, billing fields returned
- Actions: no bulk ops, no order/lead creation, no deletion, no payment field modification, no admin_settings access
- `regenerate_song` refuses to operate on leads

### Key: `csa_k7Qm9xR2vL4pN8wF3jB6tY1dS5hA0eG`
Save this for OpenClaw configuration after deployment.

