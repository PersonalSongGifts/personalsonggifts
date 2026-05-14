## What I found

I traced the revision delivery flow end-to-end and pulled data on the last 30 days of revisions. The good news: **revised song emails are actually being sent** — every one of the 30 most recent auto-approved revisions has a `delivery_sent` row in `order_activity_log` and a fresh `sent_at` timestamp. The system isn't silently dropping them.

The bad news: the revised-song email is genuinely confusing, and the bonus side is broken. Here's what's happening:

### Issue 1 — Bonus track is regenerated but never mentioned (the big one)

When a customer submits a revision that needs regeneration, `submit-revision` clears the primary song fields and `automation-trigger` regenerates **both** the primary and the bonus track. Activity logs confirm this — every recent revision shows a fresh `bonus_audio_generated` event after `revision_auto_approved`.

But the delivery email never tells the customer the bonus was regenerated. The "P.S. We also made an acoustic version…" line in `send-song-delivery` is gated on a `bonusAvailable` flag — and **none** of the three callers in `process-scheduled-deliveries` (main / legacy / resend) ever pass it. Customers expect a new bonus along with the new main song, get an email that only references the main song, and email support asking where the bonus is.

### Issue 2 — Revised song email is too easily mistaken for the original

The subject is `"{Recipient}'s revised song is ready"` and the body says "We've created a new version… based on your feedback." That's fine in isolation, but:
- The link is the same `/song/{shortId}` URL as the original delivery
- There's no visual cue (no "Revision 1 of 1" tag, no callout banner) once they land on the page
- Some customers are scanning fast and thinking it's a duplicate of the first delivery

### Issue 3 — Legacy + Resend paths don't set `isRevision`

Only the main delivery path passes `isRevision: (revision_count > 0)`. The legacy queue and the scheduled resend queue both omit it, so any revision that lands in those paths gets the original-song subject ("song is complete and ready to share") instead of the revised-song subject. Low volume but real.

### What I'm NOT changing

- The auto-approve / regeneration pipeline itself — it works.
- Any business rules around revision count / max revisions.
- The bonus track email campaign (`send-bonus-track-email`) — that's an admin-triggered marketing flow, separate concern.

---

## The fix

### 1. Wire bonus fields through the delivery callers
In `supabase/functions/process-scheduled-deliveries/index.ts`, all three callsites that invoke `send-song-delivery` (lines ~716, ~843, ~933) need to pass:
```ts
isRevision: (order.revision_count || 0) > 0,
bonusAvailable: !!order.bonus_song_url,
bonusSongTitle: order.bonus_song_title,
```
(Currently only the main path passes `isRevision`; none pass the bonus fields.)

### 2. Strengthen the revised-song email body
In `supabase/functions/send-song-delivery/index.ts`, when `isRevision` is true:
- Keep the subject as-is (already differentiated).
- Replace the existing "We've created a new version…" line with copy that explicitly references both tracks when a bonus exists, e.g.:
  - With bonus: *"Your revised {occasion} song for {Recipient} is ready, and we also refreshed the {acoustic|R&B} bonus version to match. Both are on your song page."*
  - Without bonus: keep current copy.
- Drop the conflicting separate "P.S. acoustic version" paragraph when `isRevision` is true (it's now redundant with the new lead-in).

### 3. Add a "Revised version" badge on the song page
In `src/pages/SongPlayer.tsx` (and the order fetch in `get-song-page` if needed), when `revision_count > 0` and `revision_status === 'approved'`, render a small badge near the title: *"Revised version • Updated {date}"*. This kills the "is this the same email I already got?" confusion when they actually click through.

### 4. Sanity-pass on legacy + resend paths
With #1 done, the legacy and resend paths will correctly say "revised song" for revision orders. No additional code needed beyond #1.

---

## Verification plan

After implementation:
- Run a test revision end-to-end on a staging order, confirm the email subject says "revised", the body mentions both tracks, and the song page shows the badge.
- Spot-check `order_activity_log` for the next batch of real revisions to confirm `delivery_sent` continues to fire.
- Query `orders WHERE revision_count > 0 AND bonus_song_url IS NOT NULL AND sent_at > now() - interval '7 days'` after a week to confirm bonus-aware copy is going out.

---

## What this won't fix

If customers are not receiving the email at all (Gmail filters, typo'd address, suppression list), that's a separate deliverability issue and these changes won't help. If support tickets persist after this ships, next step would be to add a `email_send_log` table (currently this project has no per-send delivery audit) so we can prove sends are landing vs. being dropped.