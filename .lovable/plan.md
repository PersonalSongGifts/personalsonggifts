## Two-Wave Mother's Day Campaign — Final Plan v4 (APPROVED, ready to build)

### Decisions Locked
- **Audience:** Global, all 11,852 eligible at q≥70.
- **Subject lines:** Keep MD variant for wife/mom/grandma → `${name}'s Mother's Day song is still waiting`. Non-MD recipients → `Hey wanted to show you this song for ${name}`.
- **Eligibility:** Block leads without `full_song_url` (they can't checkout anyway).
- **Test email:** `Ryan@hyperdrivelab.com` with admin-supplied carrier lead ID.

### Pricing Anchor Decision
Email body will say **"$24.99 instead of $29.99"** (Wave 1) and **"$19.99 instead of $29.99"** (Wave 2). Drop the `$99.99` anchor — it's not a real price the lead has ever seen and reads as fake.

### Implementation Steps

**Step 1 — Refactor `send-flash20-remarketing/index.ts`**
- Accept `promoSlug` param (default `flash20` for backwards compat).
- `SETTINGS_KEY` stays `flash20_remarketing` (single shared settings row), but `activated_at` becomes `activated_at_${slug}` keyed inside the settings JSON.
- Drop the `last_promo_email_sent_at <30d` filter from `baseQuery`. Replace with NOT-EXISTS subquery on `order_activity_log` for `${promoSlug}_sent`. Keep `last_promo_email_sent_at` CAS as race lock only.
- Add `.not("full_song_url", "is", null)` to baseQuery.
- Add `.gte("quality_score", 70)` to baseQuery.
- Parameterize `buildEmail()`: `priceLabel`, `originalLabel`, `mothersDayDate`, `subjectGeneric`. Use new generic subject `Hey wanted to show you this song for ${recipientName}`. Keep MD subject as-is. Update MD date to **May 10**.
- Test mode: accept `testCarrierLeadId`. If provided, write a real `${promoSlug}_sent` log entry for that lead (so preview page renders correctly). Add a follow-up admin button "Revert Test Carrier" that deletes that one log row + clears `last_promo_email_sent_at` so the carrier doesn't get double-emailed in production.
- Activity log writes use `${promoSlug}_sent`.
- Slug-aware `stats`: count `${promoSlug}_sent` events; conversions = leads with that event whose `converted_at >= activated_at_${slug}`; per-slug revenue.

**Step 2 — Refactor `get-lead-preview/index.ts`**
- Look up active targeted promos this lead has a `*_sent` log entry for. If multiple, pick the one with the latest `activated_at`.
- Return new generic fields: `targetedPromoSlug`, `targetedPromoPriceCents`, `targetedPromoEndsAt`, `targetedPromoEligible`, `targetedPromoExpired`.
- Keep `flash20*` aliases populated (for any cached frontend) — read from the same generic resolution.

**Step 3 — Refactor `SongPreview.tsx`**
- Read `targetedPromo*` fields with `flash20*` fallback.
- Drop the hardcoded `?? 1999` price fallback (use server-provided cents only).
- Send dynamic `promoSlug` to `create-lead-checkout`.

**Step 4 — Update `Flash20RemarketingPanel.tsx`**
- Wave selector dropdown: Wave 1 = `flash25` ($24.99) / Wave 2 = `flash20` ($19.99). All API calls include the chosen `promoSlug`.
- Per-wave stats display (sent/conversions/revenue).
- Test panel: text input for `testCarrierLeadId` next to email input; "Revert Test Carrier" button.
- "Send Next Hour Batch" manual-fire button (cron fallback).
- "Enable Cron / Disable Cron" toggle.

**Step 5 — Database setup (insert tool)**
- `UPDATE promotions SET is_active=false, ends_at='2026-04-01' WHERE slug='flash20';`
- `INSERT INTO promotions (slug='flash25', name='Flash $24.99', lead_price_cents=2499, standard_price_cents=2999, priority_price_cents=3999, targeted=true, is_active=false, starts_at/ends_at=past placeholders, show_banner=false);`
- Reset `admin_settings.flash20_remarketing` to defaults (paused=true, counters zeroed).

**Step 6 — Cron setup (insert tool)**
- Try to enable `pg_cron` + `pg_net` via migration.
- Schedule hourly job calling send fn with `{send: true, promoSlug: "flash25"}`. Created in **disabled** state; admin panel toggle controls it.
- If extensions can't be enabled, fall back to admin "Send Next Hour Batch" button.

**Step 7 — Verification (sequential, gated by you)**
1. Deploy edge functions, wait 30s.
2. Run `dryRun: true, promoSlug: "flash25"` → confirm count after `full_song_url` + `quality_score>=70` filters and timezone breakdown.
3. I pick the most recent qualified lead from the DB as test carrier. Send test to `Ryan@hyperdrivelab.com` with that `testCarrierLeadId`.
4. **You verify:**
   - Email arrives. Non-MD subject reads "Hey wanted to show you this song for [name]" (or MD variant if carrier is wife/mom).
   - Body says "$24.99 instead of $29.99", date "May 10".
   - Click link → preview page shows "$24.99" badge.
   - Click checkout → Stripe shows $24.99 → cancel.
5. Click "Revert Test Carrier" — carrier's `flash25_sent` log + `last_promo_email_sent_at` cleared.
6. **You give thumbs up.** Unpause campaign. Fire one canary (100 leads). Wait 30 min.
7. Check Brevo + activity log + errors. If clean → enable cron toggle. Wave 1 drains over ~36-48 hours.

**Step 8 — Wave 2 handoff (~May 7)**
- I come back. Disable cron. Reset settings (clears `activated_at_flash25`). Update `flash20` promo dates to fresh window. Reactivate `flash20`. Update cron body to `promoSlug: "flash20"`. Re-enable.
- May 9 23:59 PST: `flash20` auto-expires.
- May 10: Mother's Day.

### Risk Summary (acknowledged, not blocking)
- **Brevo throttling at peak hours:** mitigated by `batch_size: 500` per cron run; errors will surface in run output, can lower if needed.
- **419 unknown-tz leads** default to NY — acceptable.
- **80 EU leads** will get Wave 1 even though their MD already passed. Acceptable noise.

Starting now.