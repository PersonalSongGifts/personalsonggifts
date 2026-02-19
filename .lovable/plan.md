
## Spam-Optimized Unplayed Song Re-send: Complete Implementation Plan

### What the User Asked For
Build a re-send system that automatically emails customers whose song was delivered but never played — using a maximally deliverable, plain-text email. The request is also to add an email whitelist notice to the confirmation page.

### What Was Already Done (Previous Approved Plan)
The previous round of email improvements updated `send-order-confirmation`, `send-song-delivery`, `send-lead-followup`, and `send-test-email`. Those are already clean.

### What's Still Broken (Discovered During Investigation)

The lead preview email **inside `process-scheduled-deliveries` section 6** (lines 957–1020) was **NOT updated** by the previous plan — it still has:
- The dark gradient header (`linear-gradient(135deg, #1E3A5F...)`)
- A large green button with `box-shadow`
- `"Special offer inside!"` language
- **`"X-Priority": "1"` header** (line 1059) — the exact spam signal we just removed from the standalone function

This is the email that actually goes to customers (it's what the cron sends), not the standalone `send-lead-preview` function. So leads are still getting the old spam-triggering template. This must be fixed as part of this work.

---

### All Changes in This Plan

#### 1. Database Migration — Add `unplayed_resend_sent_at` column

```sql
ALTER TABLE orders ADD COLUMN unplayed_resend_sent_at timestamptz;
```

One nullable timestamp. When null = eligible for re-send (after 24h). When set = never re-send again for this order.

#### 2. Fix Lead Preview Email in `process-scheduled-deliveries` (Section 6)

Replace the old HTML (dark gradient, green button, box-shadow, `X-Priority: 1`) with the same clean plain-text style used by the Valentine remarketing campaign. This is the biggest remaining deliverability issue.

The new template follows the valentine remarketing style exactly:
- White background, system font stack
- Plain `Hi [name],` opening
- 2-3 short paragraphs
- Bare hyperlink URL written out (no styled button)
- Remove `X-Priority: 1` entirely
- Clean sign-off

#### 3. New Section 8 in `process-scheduled-deliveries` — Unplayed Song Re-send Queue

Inserted just before the final `return new Response(...)` at line 1216.

**Query logic:**
```
status = 'delivered'
AND delivery_status = 'sent'  
AND song_url IS NOT NULL
AND song_played_at IS NULL          -- never played
AND sent_at <= now() - interval '24 hours'   -- been 24h since delivery
AND unplayed_resend_sent_at IS NULL  -- re-send hasn't fired yet
AND dismissed_at IS NULL
AND email NOT IN email_suppressions  -- suppression check
```

**Sends limit:** Max 5 per cron run to prevent accidental bulk behavior.

**Email template — the most spam-resistant possible:**

The email uses the exact same HTML structure as the Valentine remarketing campaign (which is the highest-deliverability template in the system). Key choices and why:

- **Subject line: `"Did you get your song for [recipient_name]?"` — why this works:**
  - No punctuation pressure ("!!!"), no urgency words ("last chance", "don't miss"), no discount mentions
  - Personalized with recipient name — personalized subjects have measurably lower spam rates
  - Reads like a genuine follow-up from a person, not a broadcast
  - Question format triggers natural curiosity without being manipulative

- **From name stays `Personal Song Gifts`** — consistent with original delivery, recipient recognizes it

- **`Precedence: transactional`** — tells mail servers this is expected mail, not bulk

- **No `X-Priority` header** — removed entirely (spam signal)

- **Plain URL written out** alongside the anchor tag — some spam filters penalize emails with only hyperlinked text and no visible URL

- **No images, no tracking pixels, no styled buttons** — every one of these adds rendering overhead that spam filters penalize for cold/marketing mail

- **Both `htmlContent` and `textContent`** — multipart MIME is required; a text-only email actually looks MORE suspicious to modern filters because it skips the standard format

The exact body text (per the user's request):

```
Hi [first_name],

We sent your song earlier, but it looks like it hasn't been played yet. We just want to make sure you have it in time for your special moment.

You can listen to your song here:
[song_link]

Thank you for letting us be part of something meaningful with you and your loved one.

We truly hope you love it.

Warmly,
Personal Song Gifts
```

**After successful send:**
- Sets `unplayed_resend_sent_at = now()` on the order row
- Logs activity via `logActivity()` so it's visible in the admin panel
- Adds result to `results.unplayedResends` in cron output

**Safety guards:**
- `unplayed_resend_sent_at IS NULL` — fires at most once per order, ever
- Suppression table check before query (join filter)
- Max 5 per run
- Skips if `dismissed_at IS NOT NULL`
- Skips if no `song_url`
- No CC email on re-sends (only primary recipient)

#### 4. Confirmation Page Email Notice (`src/pages/PaymentSuccess.tsx`)

Added below the delivery estimate card (line 322), only for non-lead-conversion orders (the `!isLeadConversion` branch). Shows a clean notice using the existing `Mail` icon already imported.

Text:
> Your song will be delivered via email from **support@personalsonggifts.com**. Be sure to add this address to your contacts so it doesn't go to your spam folder.
>
> If you have questions or concerns, reach out to us at support@personalsonggifts.com

Uses amber/yellow background styling consistent with the existing spam awareness notice on `Confirmation.tsx`.

---

### Files Changed

| File | What Changes |
|---|---|
| Migration | Add `unplayed_resend_sent_at timestamptz` column to `orders` |
| `supabase/functions/process-scheduled-deliveries/index.ts` | (1) Strip section 6 lead preview email to plain style + remove `X-Priority: 1`; (2) Add new section 8 unplayed re-send queue |
| `src/pages/PaymentSuccess.tsx` | Add email whitelist notice below delivery estimate card |

---

### What This Does NOT Do
- Does not re-send if the song has been played (`song_played_at IS NOT NULL`)
- Does not re-send more than once per order (`unplayed_resend_sent_at` lock)
- Does not send to suppressed emails
- Does not affect CC recipients on re-sends (primary delivery email only)
- Does not change the original delivery email template (already clean)

---

### Why 24 Hours (Not Less)?
Sending a "did you get it?" within a few hours looks automated and desperate to both humans and spam filters. 24 hours reads as a genuine check-in from a person who noticed. It also gives customers time to check email on their own schedule — many people don't check email immediately.
