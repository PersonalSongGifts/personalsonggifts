# Re-run Flash20 to a Fresh Cohort

## What's happening today

- **312 leads** already received the Flash20 email (with the broken non-`www` link).
- **5,247 fresh leads** have never been emailed and meet all eligibility criteria (US timezone, preview sent + listened-ready, not converted, not dismissed, captured 5+ days ago).
- The promo window expired April 24. The send function is built to **auto-activate a fresh 72-hour window** the moment the first email goes out (`ensurePromoActivated()`).
- Campaign is currently `paused: true`.

## What we'll do

1. **Verify the link works end-to-end** — send a test email to your inbox first. You click it, confirm the preview page loads with the $19.99 Flash20 price visible, and only then do we unleash the batch.
2. **Send a canary batch of 100** to validate deliverability on real recipients before the full push.
3. **Resume the campaign** — once canary looks good, the system will continue sending in 500-lead batches until the 5,247 pool is exhausted.

## Step-by-step (after you approve)

### Step 1 — Test send to you
- Trigger `send-flash20-remarketing` in `testEmails` mode with your email address.
- This also auto-activates the promo (fresh `starts_at` = now, `ends_at` = now + 72h).
- **You confirm**: email arrives → button works → `/preview/[token]?promo=flash20` loads → shows "$19.99 / 72 hours" badge → checkout proceeds.

### Step 2 — Canary batch (100 leads)
- Flip `paused: false` in `admin_settings.flash20_remarketing`.
- Trigger one send run. With `canary_sent: false`, it will send to exactly 100 leads, then mark `canary_sent: true`.
- Wait ~30 minutes. Check Brevo for bounces/complaints and the `order_activity_log` for `flash20_sent` entries.

### Step 3 — Full batches (500 at a time)
- Trigger send runs (manually or scheduled) until the eligible pool drains.
- Each run handles 500 leads, then exits. ~11 runs to clear all 5,247.
- The promo's 72-hour window starts at Step 1, so all sends should complete inside that window for maximum urgency.

### Step 4 — Auto-cleanup
- When `eligible = 0`, the function returns "No eligible leads remaining" and the campaign naturally ends.
- The promo's `ends_at` enforces the 72-hour deadline regardless.

## Link verification details (your main concern)

The current code already has the fix from last time:
- `SITE_URL = "https://www.personalsonggifts.com"` ✓ (with `www`)
- HTML uses a styled button with `href` set to the full `www` URL ✓
- Plain-text version uses the explicit `www` URL ✓
- Both email and `Unsubscribe` link use the same `SITE_URL` constant ✓

The `/preview/:token` route in `get-lead-preview` checks if the lead received a `flash20_sent` activity log entry AND the promo is active → returns `flash20Eligible: true` and shows the $19.99 price. This is wired correctly.

**The test send in Step 1 is your manual verification gate.** I won't proceed to the canary unless you confirm the link worked.

## Files involved (no code changes needed)

The Flash20 fix is already in place. We only need to:
- Send test/canary/batch HTTP calls to the existing `send-flash20-remarketing` function.
- Update `admin_settings.flash20_remarketing.paused` to `false` between steps.

## What I need from you to start

- Your email address for the Step 1 test send.

Once you reply with that, I'll execute Step 1 immediately and wait for your confirmation before each subsequent step.
