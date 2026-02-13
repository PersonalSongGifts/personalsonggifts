

## Implement Proactive Fixes 1-6

Six targeted changes to prevent future customer service issues. All are safe, additive fixes.

---

### Fix 1: Admin GET endpoint -- add `.limit(1000)`

**File**: `supabase/functions/admin-orders/index.ts` (line 92)

Add `.limit(1000)` to the GET query. This endpoint is a legacy fallback (the POST `action: "list"` with pagination is the primary path), so capping it prevents memory crashes if anything still hits it.

---

### Fix 2: Resend queue -- add `.limit(10)`

**File**: `supabase/functions/process-scheduled-deliveries/index.ts` (line 815-821)

Add `.limit(10)` to the resend orders query, matching the pattern already used by other delivery queues in the same function. Prevents bulk resend from overwhelming the cron run.

---

### Fix 3: `capture-lead` -- `.single()` to `.maybeSingle()`

**File**: `supabase/functions/capture-lead/index.ts` (line 366-370)

Change `.single()` to `.maybeSingle()` on the existing-lead email lookup. The downstream code already handles `existingLead` being null, so no other changes needed.

---

### Fix 4: `automation-suno-callback` -- `.single()` to `.maybeSingle()`

**File**: `supabase/functions/automation-suno-callback/index.ts` (lines 269-284)

Change both `.single()` calls (lead lookup and order lookup) to `.maybeSingle()`. The existing null-check logic (`if (lead && !leadError)`) already handles the no-match case correctly.

---

### Fix 5: `automation-generate-lyrics` -- `.single()` to `.maybeSingle()`

**File**: `supabase/functions/automation-generate-lyrics/index.ts` (line 189-193)

Change `.single()` to `.maybeSingle()`. The existing `if (fetchError || !rawEntity)` guard already returns a clean 404.

---

### Fix 6: SongPlayer error state -- add support contact info

**File**: `src/pages/SongPlayer.tsx` (lines 417-433)

Enhance the "Song Not Found" error screen to include the short order ID and a support email link, so customers can self-serve when contacting support instead of just seeing a dead end.

Change from:
- Generic "Song Not Found" with "Go Home" button

To:
- Show the order ID reference code
- Add "Contact support at [email] with reference code XXXXXXXX" message
- Keep the "Go Home" button

---

### Deployment

All three edge functions (`admin-orders`, `process-scheduled-deliveries`, `capture-lead`, `automation-suno-callback`, `automation-generate-lyrics`) will be redeployed after changes.

