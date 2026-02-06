

# Emergency Recovery: Deploy + Fix + Resend

## Execution Order

1. Deploy 4 missing functions (restores customer access immediately)
2. Edit and redeploy `process-scheduled-deliveries` (prevents recurrence)
3. Run SQL to requeue affected orders (triggers email sends)

---

## Step 1: Deploy 4 Missing Functions

Deploy immediately with no code changes:
- `get-song-page`
- `send-song-delivery`
- `get-lead-preview`
- `send-lead-preview`

This alone restores all customer-facing song links and preview pages.

---

## Step 2: Fix `process-scheduled-deliveries/index.ts`

### Section 3 -- Order Delivery Queue (lines 297-362)

**Replace premature status update (lines 297-309) with a "delivering" claim:**
- Set only `delivery_status: "delivering"` (NOT `status: "delivered"`, NOT `sent_at`)
- Use optimistic lock: `.is("sent_at", null)` stays, preventing duplicate pickup

**After email response (lines 336-362), split into success/failure:**
- **Success (2xx):** Set `status: "delivered"`, `delivered_at`, `sent_at`, `delivery_status: "sent"`, and record `sent_to_emails` with the effective recipient email
- **Failure (non-2xx or error):** Set `delivery_status: "failed"` and `delivery_last_error` with error text. Do NOT set `sent_at`, leaving it eligible for retry

**Update pickup query (line 256) to include retryable statuses:**
- Change `.neq("delivery_status", "needs_review")` to an explicit inclusion filter that picks up rows where `delivery_status` is null, `"failed"`, or has been stuck in `"delivering"` for over 15 minutes

### Section 4 -- Legacy Delivery (lines 392-430)

**Replace premature status update (lines 394-404) with "delivering" claim:**
- Set only `delivery_status: "delivering"` (keep `status: "ready"` until confirmed)

**Add response checking after fetch (lines 406-420):**
- **Success:** Set `status: "delivered"`, `delivered_at`, `sent_at`, `delivery_status: "sent"`, `sent_to_emails`
- **Failure:** Set `delivery_status: "failed"`, `delivery_last_error`, leave status as "ready" for retry

### Section 5 -- Scheduled Resends (lines 449-486)

**Save original `resend_scheduled_at` before clearing (line 451-455).**

**Add response checking after fetch (lines 457-476):**
- **Success:** Append to `sent_to_emails` array, log success
- **Failure:** Restore `resend_scheduled_at` to original value so it retries next cron run; log the error

### Guardrail: Delivering Timeout Safety

In Section 3's pickup query, add logic to treat `delivery_status = 'delivering'` rows older than 15 minutes as retryable. This prevents permanent stuck states from cron crashes or deploy issues. Implementation: the pickup query will use an `.or()` clause that includes `delivering` rows where no `sent_at` exists and the row was last updated more than 15 minutes ago (checked via `delivered_at` being null and a separate sub-query, or by adding a `delivery_claimed_at` timestamp set during claim).

Simplest approach: during the "delivering" claim, set a `delivery_claimed_at` field. No -- we don't have that column. Instead, use the existing pattern: when claiming, we don't set `sent_at`. The pickup query already filters `sent_at IS NULL`. For the timeout, we'll query separately for stuck "delivering" rows (where `delivery_status = 'delivering'` and the row has been in that state for >15 min) and reset them to `delivery_status = 'failed'` at the top of Section 3, before the main pickup. This is the cleanest approach since it uses existing columns.

**Add at the top of Section 3 (before line 246):**
```
Reset any orders stuck in "delivering" for >15 minutes back to "failed"
so they're eligible for retry on the next run.
```

This query:
- Finds orders where `delivery_status = 'delivering'` and `sent_at IS NULL`
- Uses the `target_send_at` (which we know is set) to infer the row was claimed at least 15 min ago. Actually, better: we know `sent_at` is null and `delivered_at` is null for "delivering" rows. We can check `target_send_at <= now - 15 min` as a proxy, but that's not ideal. 

Best approach: When we set `delivery_status = 'delivering'`, also set `delivered_at = now` as a timestamp marker. Then the timeout check looks for `delivery_status = 'delivering' AND delivered_at < now - 15min`. On success, we overwrite `delivered_at` with the real value. On failure, we null it out. This reuses the existing column without schema changes.

---

## Step 3: Requeue Affected Orders (SQL)

Per the user's guardrail, the SQL should cover ALL rows missing send evidence, not just `status = 'delivered'`:

```sql
UPDATE orders
SET resend_scheduled_at = now()
WHERE sent_to_emails IS NULL
  AND dismissed_at IS NULL
  AND song_url IS NOT NULL
  AND delivery_status IN ('sent', 'failed')
  AND (status = 'delivered' OR delivery_status = 'sent')
```

This catches:
- The 110 orders marked "delivered" with no email evidence
- Any edge cases where `delivery_status = 'sent'` but the order wasn't fully marked delivered
- Failed deliveries that should retry

---

## Detailed Code Changes Summary

| Location | Change |
|----------|--------|
| Lines 242-258 (Section 3 top) | Add stuck "delivering" timeout reset (>15 min -> failed) |
| Line 256 | Update pickup to include `delivery_status` in (null, 'failed') |
| Lines 297-309 | Replace premature delivered/sent with "delivering" claim + timestamp |
| Lines 336-362 | Split into success path (delivered/sent/sent_to_emails) and failure path (failed/error) |
| Lines 394-404 | Replace premature delivered with "delivering" claim |
| Lines 406-420 | Add response checking with success/failure split |
| Lines 451-455 | Save original resend_scheduled_at before clearing |
| Lines 457-476 | Add response checking; restore resend_scheduled_at on failure |
| Database | Requeue orders with broader coverage SQL |

## Expected Outcome

- Song links work immediately after function deployment
- Affected customers receive delivery emails within 1-2 minutes of SQL execution
- Future email failures auto-retry on next cron run
- "Delivering" state can never get permanently stuck (15-min timeout)
- Lead delivery (Section 6) unchanged -- already safe

