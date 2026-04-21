

## Add "Unlock Bonus Track for Customer" Admin Action

Give admins a one-click way to comp the full bonus track to a customer (no payment required), so when someone prefers their acoustic/R&B version we can hand it over without swapping their main song or issuing refunds.

### What the admin sees

In the existing order detail dialog (CS Assistant + admin orders panel), add a new button in the bonus track section:

- **"Unlock Bonus Track (Comp)"** — visible only when:
  - `bonus_song_url` exists (bonus is generated)
  - `bonus_unlocked_at` is null (not already unlocked)
- Click → confirm dialog: *"Give this customer free access to the full bonus track? They'll get an email with the unlock link."*
- On confirm: bonus unlocks instantly + optional delivery email is sent.

After unlock, the button is replaced by a green badge: *"Bonus unlocked (comped by admin) on {date}"*.

### What happens behind the scenes

1. New edge function `admin-unlock-bonus` (POST, admin-authenticated):
   - Sets `bonus_unlocked_at = now()`
   - Sets `bonus_unlock_session_id = 'admin_comp_{adminId}_{timestamp}'` (so we can distinguish comped unlocks from paid ones in analytics)
   - Sets `bonus_price_cents = 0`
   - Logs to `order_activity_log`: `event_type='bonus_comped'`, actor=admin, with reason field
2. Optionally triggers `send-bonus-track-email` so the customer gets the same delivery email a paid unlock would send (with the bonus song link).
3. Customer's `/song/{shortId}` page automatically shows the full bonus track (existing `get-song-page` logic already serves `bonus_song_url` when `bonus_unlocked_at` is set).

### Why not swap the main song?

Swapping `song_url` with `bonus_song_url` would break:
- The original song's revision history / `prev_song_url` backup
- Lyrics unlock state (lyrics belong to the main song)
- Reaction video associations
- Bonus analytics (play counts, etc.)

Comping the bonus is cleaner: the customer keeps both, gets the one they actually want unlocked, and our data stays consistent. If they truly never want the original, no action needed — they just won't play it.

### Files to add/edit

- **New**: `supabase/functions/admin-unlock-bonus/index.ts` — admin-authed unlock endpoint with activity log + optional email trigger
- **Edit**: `src/components/admin/CSAssistant.tsx` (and/or wherever the order detail bonus section lives) — add the comp button + confirm dialog + post-unlock badge
- **Edit**: `src/pages/Admin.tsx` if the bonus section needs the action wired into the orders table row dialog as well

### Optional toggle in confirm dialog

Checkbox: *"Also send unlock email to customer"* (default: on). Lets admins comp silently if they're handling outreach manually over email/SMS.

