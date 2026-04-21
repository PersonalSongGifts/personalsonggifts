

## Fix Flash20 silent send failure

The campaign reports `attempted: 100, sent: 0, failed: 0` but no emails leave Brevo and no `[FLASH20]` log lines appear. The current code has three silent failure paths and a hard-coded `attempted` value that masks what actually happened. This plan adds real telemetry, fixes the misleading counter, and surfaces the underlying cause.

### Root cause analysis

The DB confirms 5,435 eligible leads with `last_promo_email_sent_at = NULL` and zero prior `flash20_sent` activity logs — so the claim step should succeed. The fact that `sent: 0, failed: 0` happens with `eligible: 100` means one of:

1. The candidate loop is being skipped entirely (silent `continue` on every iteration)
2. `sendOneEmail` is throwing an exception that's swallowed by an outer try/catch
3. The post-fetch suppressed/paid filter is reducing 100 candidates to 0 eligible (but UI shows 100)
4. `BREVO_API_KEY` env var is empty, the fetch returns 401, but somehow not counted

The current code can't distinguish these because `attempted` is hard-coded to `eligible.length` (line 409) and per-lead `console.log` calls aren't reaching the log stream we see.

### Fixes — `supabase/functions/send-flash20-remarketing/index.ts`

1. **Fix the lying `attempted` counter.** Track a real `attemptCounter` that increments inside the loop right before `sendOneEmail` is called. Return that value, not `eligible.length`.

2. **Add a skip counter and reason buckets.** Introduce `skipped: { claim_failed: number, missing_token: number, send_threw: number }` and increment per skip path. Return it in the response.

3. **Wrap `sendOneEmail` in try/catch at the call site.** Currently a thrown fetch (network blip, DNS, etc.) would bubble up and kill the whole batch. Catch, count as `failed`, push to `errors` with the exception message.

4. **Hard-fail fast if `BREVO_API_KEY` is missing.** At the top of the `send` branch, check `if (!brevoApiKey) return 500 with { error: "BREVO_API_KEY not configured" }`. Currently it falls back to empty string and silently calls Brevo with no auth.

5. **Add a single summary log line per batch.** `console.log("[FLASH20] Batch complete: eligible=X attempted=Y sent=Z failed=W skipped=", skipped)` so the edge function logs always show the outcome even if individual lead logs get truncated.

6. **Log the first error verbatim.** If `errors.length > 0`, `console.error("[FLASH20] First error:", errors[0])` so the actual Brevo response (e.g. "401 unauthorized", "sender not verified") shows up in logs immediately.

### Fix — `src/components/admin/Flash20RemarketingPanel.tsx`

7. **Surface skipped reasons in the toast and JSON box.** When `data.skipped` is present, show it in the success toast: `${data.sent} sent, ${data.failed} failed, ${total skipped} skipped`. The raw JSON box already renders the full response so no extra UI work needed beyond the toast.

### What this changes for the user

After this ships:
- Click **Run Next Batch** → if Brevo key is missing you get an immediate clear error instead of silent zeros
- Response JSON shows real `attempted` count + a `skipped` breakdown so you can see exactly which gate is dropping leads
- Edge function logs always show `[FLASH20] Batch complete:` and `[FLASH20] First error:` lines so root-causing future issues takes seconds, not a debugging session
- If the issue was the `BREVO_API_KEY` env var, the next click will tell you so directly

### Out of scope

- Not changing eligibility filters (5+ days, US tz, preview sent, not converted, no flash20 in 30d) — those are correct
- Not changing the claim mechanism — the WHERE clause is right, we just need visibility into when it skips
- Not changing the email content, subject, or sender — those work in your existing test sends
- Not touching the Promos panel or the targeted-promo machinery — that's already shipped and working

