

# Brevo SMS Integration -- Quiet Hours, Timezone-Aware, with Admin KPIs

## Overview

This adds SMS as a **companion delivery channel** alongside existing email. When a song is delivered or a lead preview is sent, an SMS with the link is also sent -- but only if the customer opted in, has a valid phone number, and it's not during quiet hours. SMS never blocks or replaces email.

## What the Customer Will See

**Checkout page**: Below the "Complete Payment" button area, a compact opt-in checkbox appears (only visible if a phone number was entered on the song creation form):

```
[ ] Text me my song link (optional)
    Msg & data rates may apply.
```

**SMS messages** (when opted in):
- After order delivery: a short text with the full song link
- After lead preview email: a short text with the 45-second snippet link only

## What the Admin Will See

- SMS status badge on each order and lead (Sent / Failed / Scheduled / Not opted-in)
- Error details on failure
- "Resend SMS" button per entity
- Two new KPI cards: "SMS Sent" and "SMS Failed"

---

## Phase 1: Database Migration

Add 7 new columns to both `orders` and `leads` tables:

**orders table**
| Column | Type | Default |
|--------|------|---------|
| phone_e164 | text, nullable | null |
| sms_opt_in | boolean | false |
| sms_status | text, nullable | null |
| sms_last_error | text, nullable | null |
| sms_sent_at | timestamptz, nullable | null |
| sms_scheduled_for | timestamptz, nullable | null |
| timezone | text, nullable | null |

**leads table** -- same 7 columns.

No existing columns are changed. Existing rows get safe defaults (false / null).

---

## Phase 2: Phone Normalization Utility

**New file: `src/lib/phoneUtils.ts`**

A small utility that:
- Strips non-digit characters (except leading `+`)
- Prepends `+1` if exactly 10 digits (US default for MVP)
- Returns `null` if the result does not match `/^\+\d{10,15}$/`
- Invalid phone = silently skip SMS; checkout is never blocked

---

## Phase 3: Frontend -- SMS Opt-In on Checkout

**File: `src/pages/Checkout.tsx`**

1. **New state**: `smsOptIn` (boolean, default false)
2. **Auto-detect timezone**: `Intl.DateTimeFormat().resolvedOptions().timeZone` on mount
3. **Normalize phone**: Call `normalizeToE164(formData.phoneNumber)` -- if null, skip SMS entirely
4. **Opt-in checkbox**: Appears between the reassurance icons and the Pay button, only if `formData.phoneNumber` is non-empty:

```
[ ] Text me my song link (optional)
    Msg & data rates may apply.
```

5. **Payload update**: Pass `smsOptIn`, `phoneE164`, and `timezone` in the `create-checkout` request body

**File: `src/pages/CreateSong.tsx`**

Pass `timezone` (auto-detected) in the `captureLeadAsync` payload so leads also get timezone stored. No UI changes to the song creation form.

---

## Phase 4: Backend -- Stripe Checkout Flow

**File: `supabase/functions/create-checkout/index.ts`**

- Add `smsOptIn`, `phoneE164`, `timezone` to the `CheckoutInput.formData` interface
- Forward as Stripe metadata: `smsOptIn` ("true"/"false"), `phoneE164`, `timezone`

**File: `supabase/functions/stripe-webhook/index.ts`**

- Map new metadata to order columns on insert:
  - `phone_e164`, `sms_opt_in` (parse "true"/"false"), `timezone`

**File: `supabase/functions/capture-lead/index.ts`**

- Accept `timezone` in `LeadInput` interface
- Store `timezone` on lead insert/update
- Note: leads do NOT get SMS opt-in during capture (checkout only per requirement)

---

## Phase 5: Shared SMS Helper

**New file: `supabase/functions/_shared/brevo-sms.ts`**

Core function:

```text
sendSms({ to, text, tag, timezone }) -> { sent, scheduled, scheduledFor?, error?, brevoMessageId? }
```

**Quiet hours logic**:
1. Determine recipient local time using their timezone (IANA format via `Intl.DateTimeFormat`)
2. Fallback chain: user timezone -> infer from phone country code -> `America/New_York`
3. If local hour >= 21 (9 PM) or < 9 (9 AM): return `{ scheduled: true, scheduledFor: <next 9 AM local> }`
4. Otherwise: call Brevo transactional SMS API immediately

**Brevo API call**:
```text
POST https://api.brevo.com/v3/transactionalSMS/send
{
  "sender": "SongGifts",
  "recipient": "+1XXXXXXXXXX",
  "content": "...",
  "type": "transactional",
  "tag": "order_delivery" | "lead_preview"
}
```

**Safety guarantees**:
- Never throws -- always returns a structured result
- Uses existing `BREVO_API_KEY` (same key works for email and SMS)
- If Brevo rejects (e.g. US number without toll-free), logs the error, email still succeeds
- Stores Brevo response message ID when available

---

## Phase 6: SMS in Delivery Edge Functions

### File: `supabase/functions/send-song-delivery/index.ts`

After the email sends successfully (around line 192):

1. Accept new optional fields in request: `phoneE164`, `smsOptIn`, `timezone`, `smsStatus`
2. Guard: skip if `smsOptIn !== true` or `phoneE164` is missing or `smsStatus === "sent"`
3. **Assertion**: SMS body must contain `/song/` path (order link), never `/preview/`
4. Call `sendSms()` from shared helper
5. Return SMS result alongside email result in response (caller updates DB)

**SMS copy**:
```
Your custom song is ready!
Listen here: https://personalsonggifts.lovable.app/song/{shortId}
Reply STOP to opt out.
```

### File: `supabase/functions/send-lead-preview/index.ts`

After the email sends successfully (around line 241):

1. Read `phone_e164`, `sms_opt_in`, `timezone`, `sms_status` from lead record (already fetched)
2. Same guards as above
3. **Assertion**: SMS body must contain `/preview/` path, never `/song/`
4. Call `sendSms()` from shared helper
5. Update lead's `sms_status`, `sms_sent_at`, `sms_last_error`, `sms_scheduled_for` directly

**SMS copy**:
```
We made your song preview!
Listen here: https://personalsonggifts.lovable.app/preview/{token}
Reply STOP to opt out.
```

---

## Phase 7: Scheduled Deliveries Integration

### File: `supabase/functions/process-scheduled-deliveries/index.ts`

**Section 3 (Order Delivery Queue, ~line 276-293)**:
- Pass the new SMS fields when calling `send-song-delivery`
- After the call returns, update the order's SMS columns based on the response

**Section 5 (Scheduled Resends, ~line 388-420)**:
- Pass SMS fields for resends too (allows SMS to re-fire on resend)

**Section 6 (Lead Preview Queue, ~line 454-601)**:
- After email sends successfully, add inline SMS call using the shared helper
- Update lead's SMS columns

**New Section 7: Scheduled SMS Queue**:
- Query orders and leads where `sms_scheduled_for <= now` and `sms_status = 'scheduled'`
- Send each SMS via the shared helper
- Update status to `sent` or `failed`

---

## Phase 8: Admin Dashboard Visibility

### File: `src/pages/Admin.tsx`

**Order interface** (line 32-102): Add 7 new fields:
```
phone_e164, sms_opt_in, sms_status, sms_last_error, sms_sent_at, sms_scheduled_for, timezone
```

**Order detail dialog**: Add an "SMS" row in the customer info section:
- Status badge: "Sent" (green) / "Failed" (red) / "Scheduled" (amber) / "Not opted-in" (gray)
- Masked phone: `***-***-1234`
- Timezone display
- Error message if failed
- "Resend SMS" button (only when opted-in + phone exists)

### File: `src/components/admin/LeadsTable.tsx`

**Lead interface** (line 21-74): Add same 7 SMS fields.

**Lead detail dialog**: Same SMS status display as orders.

### File: `src/components/admin/StatsCards.tsx`

Add 2 new KPI cards at the end of the stats grid:

| Card | Value | Description |
|------|-------|-------------|
| SMS Sent | Count where sms_status="sent" | "of {opted-in} opted in" |
| SMS Failed | Count where sms_status="failed" | "{count} errors" |

---

## Phase 9: Admin Actions for SMS

### File: `supabase/functions/admin-orders/index.ts`

**`update_order_fields` handler** (~line 698): Add SMS fields to the whitelist:
- `sms_opt_in` (for admin "Disable SMS" toggle)

**New action: `resend_sms`**: 
- Accepts `orderId` or `leadId`
- Validates opt-in + phone exists
- Calls the shared SMS helper directly
- Updates `sms_status`, `sms_sent_at`, `sms_last_error`
- Returns result

---

## Secrets & Configuration

No new secrets needed:
- `BREVO_API_KEY` (already configured) -- works for both email and SMS in Brevo
- Sender name `SongGifts` is hardcoded in the shared helper
- Adding a toll-free number later = just change the `sender` field in `brevo-sms.ts` (or read from an env var `BREVO_SMS_SENDER`)

---

## File Change Summary

| File | Action | Description |
|------|--------|-------------|
| **Database migration** | SQL | Add 7 columns to `orders` + 7 to `leads` |
| `src/lib/phoneUtils.ts` | **CREATE** | E.164 phone normalizer |
| `supabase/functions/_shared/brevo-sms.ts` | **CREATE** | Shared SMS sender with quiet hours |
| `src/pages/Checkout.tsx` | EDIT | SMS opt-in checkbox, timezone capture, pass new fields |
| `src/pages/CreateSong.tsx` | EDIT | Pass timezone in lead capture payload |
| `supabase/functions/create-checkout/index.ts` | EDIT | Accept + forward smsOptIn, phoneE164, timezone |
| `supabase/functions/stripe-webhook/index.ts` | EDIT | Map new metadata to order columns |
| `supabase/functions/capture-lead/index.ts` | EDIT | Accept + store timezone |
| `supabase/functions/send-song-delivery/index.ts` | EDIT | Add SMS after email with assertion guard |
| `supabase/functions/send-lead-preview/index.ts` | EDIT | Add SMS after email with assertion guard |
| `supabase/functions/process-scheduled-deliveries/index.ts` | EDIT | Pass SMS fields, add scheduled SMS queue |
| `supabase/functions/admin-orders/index.ts` | EDIT | Whitelist SMS fields, add resend_sms action |
| `src/pages/Admin.tsx` | EDIT | SMS status in order detail, resend button |
| `src/components/admin/LeadsTable.tsx` | EDIT | SMS status in lead detail |
| `src/components/admin/StatsCards.tsx` | EDIT | 2 new KPI cards |

---

## Safety Guarantees (Acceptance Criteria)

1. **Email always sends** -- all SMS logic runs after email success, wrapped in try/catch
2. **No duplicate sends** -- skip if `sms_status === "sent"`; no retry loops
3. **Quiet hours enforced** -- 9 PM to 9 AM recipient local time; SMS queued for next 9 AM
4. **Lead safety** -- assertion guard prevents full song URL in lead SMS
5. **Order safety** -- assertion guard prevents snippet URL in order SMS
6. **Opt-in required** -- SMS only when `sms_opt_in === true`
7. **STOP language** -- every SMS includes "Reply STOP to opt out."
8. **Invalid phone = silent skip** -- never blocks checkout or delivery
9. **Toll-free ready** -- sender name can be swapped for a number via config change only
10. **Admin visibility** -- status, errors, timestamps, and KPIs all surfaced in dashboard

