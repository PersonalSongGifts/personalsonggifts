

# Phase 1: Self-Service Revision — Database + Edge Functions + Customer Form

## Summary
Database migration for revision columns and table, two new edge functions for the revision page, a new customer-facing SongRevision page, and updates to existing edge functions and SongPlayer to link everything together.

---

## 1. Database Migration

**Add columns to `orders` table:**
- `revision_token` UUID DEFAULT gen_random_uuid()
- `revision_count` INTEGER DEFAULT 0
- `max_revisions` INTEGER DEFAULT 1
- `revision_requested_at` TIMESTAMPTZ nullable
- `revision_status` TEXT nullable (pending, approved, modified_and_approved, processing, completed, rejected, failed)
- `revision_reason` TEXT nullable
- `pending_revision` BOOLEAN DEFAULT false

**Create `revision_requests` table** with RLS denying all public access (service role only):
- id, order_id (FK to orders), submitted_at, status, reviewed_by, reviewed_at, admin_modifications (jsonb), rejection_reason, is_pre_delivery (boolean), changes_summary, original_values (jsonb), fields_changed (jsonb)
- All editable fields: recipient_name, customer_name, delivery_email, recipient_type, occasion, genre, singer_preference, language, recipient_name_pronunciation, special_qualities, favorite_memory, special_message, style_notes, tempo, anything_else

**Insert admin_settings defaults** (via insert tool):
- self_service_revisions_enabled = true
- max_revisions_per_order = 1
- auto_process_revisions = false
- revision_delivery_delay_hours = 12
- revision_delivery_delay_hours_rush = 6
- revision_link_expiry_days = 90

---

## 2. Update `create-order/index.ts`

Read `max_revisions_per_order` from `admin_settings` after creating the Supabase client. Set `max_revisions` on the inserted order row. The `revision_token` auto-generates via the column default.

---

## 3. New Edge Function: `get-revision-page/index.ts`

Public endpoint (no auth), accepts `?token=UUID`.

**Validation flow:**
1. Read `self_service_revisions_enabled` from admin_settings -- if false, return "not available"
2. Look up order by `revision_token` -- no match = 404
3. Check `price_cents` exists (Stripe payment confirmed) -- if null, "order not found"
4. Read `revision_link_expiry_days` from admin_settings, check if token expired
5. Status `failed`/`needs_review` -- "under review" message
6. `revision_status = 'pending'` -- return order data + existing pending revision_request for editing
7. `revision_status = 'processing'` -- "being created" message with ETA
8. `revision_count >= max_revisions` AND `sent_at` not null -- "used all revisions"
9. `sent_at` not null -- return `form_type: "post_delivery_redo"` with order data
10. Otherwise -- return `form_type: "pre_delivery_update"` with order data

Returns all editable order fields for form pre-fill plus metadata (form_type, revisions_remaining, existing pending revision if any).

---

## 4. New Edge Function: `submit-revision/index.ts`

Public endpoint, POST only. Accepts revision_token + all form fields.

**Server-side validation:**
- Token validity (same checks as get-revision-page)
- No previously-filled field now empty (return warning)
- Strip URLs from text fields
- 1-hour cooldown on new submissions (allow edits to pending)
- Text field length limits (500 char for style_notes, anything_else; 250 for others)

**On valid submission:**
1. Diff submitted values against current order values to compute `fields_changed` and auto-generate `changes_summary`
2. Snapshot current order values into `original_values`
3. If editing an existing pending revision: update that revision_request record
4. Otherwise: create new revision_request record
5. Update order: `revision_status = 'pending'`, `revision_requested_at = now()`
6. If post-delivery redo: increment `revision_count`
7. Reset `unplayed_resend_sent_at` to null
8. Send plain-text confirmation email via Brevo
9. Send alert email to support@personalsonggifts.com with summary

---

## 5. Update `get-song-page/index.ts`

Add `revision_token` and revision availability info to the response. Also read `self_service_revisions_enabled` from admin_settings.

Return new fields:
- `revision_token` (the order's token)
- `revision_available` (boolean: feature enabled AND (has revisions remaining OR is pre-delivery))
- `revision_status` (current status if any)

---

## 6. New Page: `src/pages/SongRevision.tsx`

Route: `/song/revision/:token` (added to App.tsx)

**Page states:**
- Loading spinner while fetching
- Error/status messages for all validation cases (expired, under review, processing, no revisions left, feature disabled)
- Edit form for valid cases

**Form layout (mobile-first):**
- Each field shows current value with "Edit" button to expand
- Dropdowns imported from `adminDropdownOptions.ts` (occasion, genre, language)
- Recipient type options matching RecipientStep.tsx (husband, wife, partner, parent, child, friend, pet, myself, other)
- Singer preference as radio buttons (Male / Female / No preference)
- Pronunciation field with helper text ("Spell it out how it should be pronounced")
- Text areas for special_qualities, favorite_memory, special_message (pre-filled)
- Style/vibe changes and "Anything else" with 500-char counters
- Tempo selector (Faster / Keep the same / Slower)

**Disclaimers (checkbox groups):**
- Post-delivery: 6 checkboxes (original replaced, uses free revision, uniquely generated, shared link updated, content may be trimmed, agree to ToS)
- Pre-delivery: 3 checkboxes (may affect timeline, content may be trimmed, agree to ToS)

**After submission:**
- Confirmation message (different for post-delivery vs pre-delivery)
- Remaining redo count shown for post-delivery forms

---

## 7. Update `src/pages/SongPlayer.tsx`

Add "Need changes? Request a revision" button below the action buttons (Download/Share/Copy Link section), above the Lyrics section. Only rendered when `songData.revision_available` is true.

Links to `/song/revision/${songData.revision_token}`.

Update the `SongData` interface to include `revision_token`, `revision_available`, `revision_status`.

---

## 8. Update `src/App.tsx`

Add route: `<Route path="/song/revision/:token" element={<SongRevision />} />`

---

## 9. Register Edge Functions in `supabase/config.toml`

Add entries for `get-revision-page` and `submit-revision` with `verify_jwt = false`.

---

## Files Summary

| File | Action |
|------|--------|
| Database migration | Add columns to orders + create revision_requests table |
| admin_settings | Insert 6 default settings |
| `supabase/functions/create-order/index.ts` | Read max_revisions_per_order, set on new orders |
| `supabase/functions/get-revision-page/index.ts` | Create -- server-side validation + data fetch |
| `supabase/functions/submit-revision/index.ts` | Create -- form submission handler |
| `supabase/functions/get-song-page/index.ts` | Add revision_token + revision_available to response |
| `src/pages/SongRevision.tsx` | Create -- customer-facing revision form |
| `src/pages/SongPlayer.tsx` | Add revision button |
| `src/App.tsx` | Add /song/revision/:token route |
| `supabase/config.toml` | Register 2 new functions |

---

## Notes for Future Phases
- **Phase 2E (Gemini revision prompt)**: Will be stored as a single `REVISION_SYSTEM_PROMPT` string constant at the top of `automation-generate-lyrics/index.ts` for easy refinement.
- **Phase 3D (pending_revision flag)**: Will be checked in BOTH `automation-suno-callback` AND `automation-generate-lyrics` callback, so stale lyrics are discarded before triggering audio generation.

