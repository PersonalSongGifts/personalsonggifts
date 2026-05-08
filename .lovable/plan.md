
## What I found

There are **two** customer-facing emails in the revision flow:

1. **Confirmation email** (sent immediately by `submit-revision`) — "Thanks, we got your revision request, you'll receive your updated song within 12-24 hours."
2. **Updated song email** — the regenerated song goes out via the normal `send-song-delivery` path from `process-scheduled-deliveries` once `target_send_at` has passed.

There is no separate "your revision is ready" email — it reuses the standard delivery template.

## The likely root cause of the complaints

When admin (or auto-approve) approves a revision in `admin-orders/index.ts`, it sets:

```
orderUpdate.target_send_at = now + 12 hours
```

Querying recent revisions confirms the symptom: dozens of orders today have `revision_status='approved'`, `automation_status='completed'`, `song_url` populated, `generated_at` set within ~2 minutes of the request — but `sent_at` is still `NULL` because `target_send_at` is hard-coded 12 hours in the future. The song is finished, sitting on the shelf, and customers wait up to 12h for the revised version they already paid for / requested.

So customers are getting a confirmation email saying "12–24 hours", then nothing for ~12h, and assuming the revision was lost.

## Secondary issues worth noting

- The confirmation email goes via Brevo directly with no suppression-list check (other flows skip suppressed emails). Any customer on the suppression list silently gets no confirmation.
- The confirmation email is sent to `order.customer_email` *before* the in-memory copy is refreshed — if the customer changed their `delivery_email` in the same revision, the confirmation goes to the OLD address.
- There is no dedicated "Your revised song is ready" subject line — it looks identical to the original delivery email, which can also confuse customers ("I already got this").

## Proposed fix

Two small changes, both in edge functions only:

### 1. Stop holding revised songs for 12h
In `supabase/functions/admin-orders/index.ts` (revision approval) and `supabase/functions/submit-revision/index.ts` (auto-approve path), change `target_send_at` for revisions to a short delay (e.g. **15 minutes** after the song is generated, not 12h after approval). Concretely: set `target_send_at = now + 15 minutes` so the delivery cron picks it up as soon as the regen finishes (regen typically completes in 2–5 min, so the song goes out ~10 minutes after it's ready, which matches normal "deliver shortly after generation" behavior).

Optionally, gate it by tier: rush/priority customers get an immediate target_send_at; standard gets ~30 min.

### 2. Update the confirmation email copy
Change the "12–24 hours" language in `submit-revision/index.ts` to reflect the new SLA (e.g. "within a couple of hours" or "shortly").

### 3. Make the revised-song delivery email distinguishable (small UX win)
In `send-song-delivery/index.ts`, accept an optional `isRevision` flag from the delivery cron when `revision_count > 0` and `sent_at` was previously set. Use a subject like "Your revised song for {recipient} is ready" instead of the original subject. No template overhaul — just a subject swap.

### 4. Suppression + email-update fixes (small correctness wins)
- In `submit-revision/index.ts`, check `email_suppressions` before sending the confirmation, and use the freshly-updated `customer_email` (post-update) so the confirmation lands in the right inbox.

## Out of scope

No DB schema changes, no UI changes, no changes to the revision form or admin panel.

## Files I'll touch

- `supabase/functions/admin-orders/index.ts` (approve-revision target_send_at)
- `supabase/functions/submit-revision/index.ts` (auto-approve target_send_at, copy update, suppression check, fresh email)
- `supabase/functions/send-song-delivery/index.ts` (optional revised-subject support)
- `supabase/functions/process-scheduled-deliveries/index.ts` (pass `isRevision` flag to send-song-delivery when applicable)

## Question for you before I build

Do you want me to also **backfill the ~25 currently-stuck approved revisions** by setting their `target_send_at` to now so they go out on the next cron run (next ~1 minute), or leave them on the original 12h schedule and only fix it going forward?
