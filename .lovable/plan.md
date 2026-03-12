

## Post-Purchase Reaction Video Email Flow

### Overview

Add a two-step automated email sequence (24h and 72h after song delivery) encouraging customers to submit reaction videos. Includes an admin kill-switch, stats, and email previews in the Emails tab. Also enhances the `/share-reaction` landing page with a "Bethany" social proof story and incentive rules.

### Safety guardrails

- **Kill-switch defaults to OFF** (`reaction_email_enabled` defaults to `"false"` — nothing sends until you explicitly turn it on)
- **Max 5 emails per cron run** per phase (same cap as unplayed resend)
- **Suppression check** against `email_suppressions` table before every send
- **One-shot columns** — `reaction_email_24h_sent_at` and `reaction_email_72h_sent_at` ensure each email fires at most once per order
- **72h email only fires if 24h was already sent** — prevents skipping ahead
- **Skips orders that already have a reaction** (`reaction_submitted_at IS NOT NULL`)
- **Activity log** entry for every send for audit trail

### Database migration

Add two nullable timestamp columns to `orders`:

```sql
ALTER TABLE orders ADD COLUMN reaction_email_24h_sent_at timestamptz;
ALTER TABLE orders ADD COLUMN reaction_email_72h_sent_at timestamptz;
```

No new tables.

### Changes

**1. `supabase/functions/process-scheduled-deliveries/index.ts`** — Add section 9 after the unplayed resend block

New section "REACTION VIDEO EMAIL FLOW" with:
- Kill-switch check: `reaction_email_enabled` in `admin_settings` (default OFF)
- Phase A (24h): Query delivered orders where `delivered_at <= now - 24h`, `reaction_email_24h_sent_at IS NULL`, `reaction_submitted_at IS NULL`, `dismissed_at IS NULL`. Check email suppressions. Send plain personal-style email via Brevo. Mark `reaction_email_24h_sent_at`. Log to `order_activity_log`.
- Phase B (72h): Same but `delivered_at <= now - 72h`, `reaction_email_72h_sent_at IS NULL`, `reaction_email_24h_sent_at IS NOT NULL`. Includes "Bethany" story. Mark `reaction_email_72h_sent_at`.
- Max 5 per phase per run.

**24h email content:**
- Subject: `Got your song? We'd love to see the reaction 🎵`
- Plain personal style (white bg, Arial, bare links)
- Short founder-style ask: greet by first name, mention the $50 incentive briefly, CTA link to `/share-reaction?utm_source=email&utm_medium=postpurchase&utm_campaign=video_24h`
- Unsubscribe link, multipart MIME

**72h email content:**
- Subject: `One more nudge (+ how Bethany earned $50 with her reaction video)`
- Short "Bethany" story paragraph
- CTA link to `/share-reaction?utm_source=email&utm_medium=postpurchase&utm_campaign=video_72h`
- Same plain style, unsubscribe, multipart MIME

**2. `src/components/admin/ReactionEmailPanel.tsx`** — New component

Following the exact pattern of `UnplayedResendPanel`:
- Toggle switch for `reaction_email_enabled` (reads/writes via `automation-get-settings`)
- Stats section showing: total 24h sent, total 72h sent, total reactions received (queried from `orders` table via `admin-orders` endpoint)
- Two collapsible iframe previews of the 24h and 72h email templates (same pattern as `EmailTemplates.tsx`)

**3. `src/pages/Admin.tsx`** — Wire into Emails tab

- Import `ReactionEmailPanel`
- Add between `ValentineRemarketingPanel` and `EmailTemplates` in the emails tab

**4. `src/pages/ShareReaction.tsx`** — Landing page enhancements

Add two new sections between existing "Why We're Asking" and form:
- **"Bethany's Story"** — Card with placeholder image (simple colored div with initials as placeholder), short paragraph about Bethany ordering a song, recording the reaction, submitting it, getting $50
- **"Incentive Rules"** — Bullet list: what qualifies, what disqualifies, payment method ($50 or song refund), not every submission guaranteed
- Update consent checkbox to add: "I confirm everyone in the video is okay with being filmed and shared"

### What does NOT change

- Stripe/PayPal checkout
- Order status machine
- Existing email flows (delivery, unplayed resend, remarketing)
- Automation queue/scheduler
- Database schema beyond the two new columns

