# $24 pricing incident — one-customer honor + permanent clarity fix

Lead d9bb7942-b0e4-4543-96ac-bcb3bc1743c7 (token mtTc9tG22QHk8bLm, acrozier.a@gmail.com).

## What the code actually does today (verified read-only)

- The preview page shows the song price from the server (`get-lead-preview`), then adds a hard-coded `+2400` when the package card is selected. `packageSelected` starts unselected, so nobody is charged $53 by default.
- The whole offer card is one big tap target: any tap anywhere on it flips the selection. On a phone that is easy to hit while scrolling, and the only price wording on the card is "+$24.00", with the total line ("Today's total") appearing **only after** selection. So a customer who taps once sees $53 and no clear statement that $24 is an optional extra on top of $29.
- Real charge amounts are already server-authoritative: `create-lead-checkout` recomputes the song price server-side and adds the package as a separate Stripe line item; the webhook/`process-lead-payment` re-splits Stripe's own total. The client cannot dictate price.
- **There is no live PayPal path for preview purchases.** PayPal exists only for the regular order checkout; the lead/preview PayPal work is inert draft under `docs/checkout-staging/`. So "$24 on PayPal" is not a live surface to fix — only a requirement for that draft if it ever ships.
- The "$24" the customer remembers is most plausibly the package's "+$24.00" line read as the song price. Two prior orders at $19 also anchor a lower expectation. No support email promising $24 was found.

## 1) Safest way to honor $24 for only this lead

Use the existing **targeted promotion** mechanism, which is already per-lead gated:

1. Create one promotion row with a unique, non-guessable slug (e.g. `honor24-d9bb7942`), `targeted = true`, `lead_price_cents = 2400`, a short window (e.g. 7 days), `is_active = true`, `show_banner = false`, `email_leads = false`.
2. Insert exactly one `order_activity_log` row: `entity_type='lead'`, `entity_id=d9bb7942…`, `event_type='honor24-d9bb7942_sent'`, with a note recording the approval.

Why this is safe as-is, no code change and no migration:
- `create-lead-checkout` refuses any targeted slug unless that lead has the matching `_sent` log row, so no other customer can use it even if the slug leaks.
- Targeted promos are excluded from the sitewide price floor and from the public banner query (`targeted = false`), so no other checkout, landing page, or email changes price.
- It is not a Stripe coupon — nothing reusable is created in Stripe, and `allow_promotion_codes` is turned off for promo-priced sessions.
- Reversal is one row update (`is_active = false`) or letting the window expire; no customer data is touched.

Two behaviours to accept deliberately:
- The preview page will show a "flash sale" urgency banner for this lead because that banner is generic to targeted promos. Acceptable for one lead, or suppress by adding a `show_banner`-aware condition later (frontend-only, out of this incident's minimum).
- If he opens his link with `?followup=true`, the follow-up floor gives him $19, not $24 — cheaper than promised, so customer-favourable. Worth knowing before we quote him.

**Alternative considered — dedicated per-lead override column/table:** cleaner semantically (no fake "promotion", no urgency banner, explicit audit field), but it needs a migration plus changes in `get-lead-preview` and `create-lead-checkout`, i.e. exactly the deploy-ahead-of-migration pattern that broke this project twice. For a single customer the targeted promo is the safer choice. Recommend the dedicated override only if honoring one-off prices becomes routine (3+ times), and then migration-first.

## 2) Paths that must agree

Live (Stripe):
- `supabase/functions/get-lead-preview/index.ts` — targeted-promo discovery → price shown.
- `src/pages/SongPreview.tsx` — displays that price, sends `promoSlug` only when the server said eligible.
- `supabase/functions/create-lead-checkout/index.ts` — validates slug + log row, sets `unitAmount`, adds the package as a separate line item.
- `supabase/functions/_shared/lead-checkout.ts` — base/package split.
- `supabase/functions/stripe-webhook/index.ts` and `process-lead-payment/index.ts` — re-split Stripe's `amount_total` into `price_cents` + `package_price_cents`, create the order, fulfil the package.

Draft only (must match if PayPal preview ever ships): `docs/checkout-staging/functions/create-paypal-lead-order`, `shared/lead-paypal-core.ts`, `capture-paypal-lead-payment`, and the `SongPreview` PayPal block — same server-side quote, same targeted-promo gate, same base/package split.

## 3) Smallest permanent UX change (frontend only)

In `src/pages/SongPreview.tsx`, inside the offer card:
- Label the song line explicitly: "Full Song — $29.00" (from the server price), so a price always has a name next to it.
- Restate the add-on as a sentence, not a bare "+$24.00": "Add Forever Memory Package — $24.00 extra (optional)".
- Always render the breakdown, not only when selected: song line, add-on line ($0.00 when unselected), and a bold "Total today" line. The number on the button always equals the Total line.
- Shrink the tap target: only a real checkbox/switch plus its label toggles selection; the surrounding card no longer captures taps. Keeps at least a 44px touch target on the control itself.
- Add a one-tap "Remove" next to the add-on line once selected.

No pricing logic changes, no backend change, no new endpoint.

## 4) Failure modes and test matrix

Failure modes to check:
- Targeted promo applied to the wrong lead (missing/extra log row) → verify exactly one log row and that a second lead's preview still shows $29.
- Slug typo → `create-lead-checkout` returns `promo_not_eligible`; page must not silently fall back to a different price than displayed.
- Promo expiry mid-session → server returns `promo_expired`; page must refresh to honest pricing, not spin.
- Displayed price ≠ charged price (the core incident) → assert button text equals Stripe's session total in every row below.
- Package paid but not fulfilled → confirm `package_price_cents` recorded and package entitlement set on the created order.
- Double-submit / replay → one order, package charged once.
- Revision in flight → purchase stays blocked regardless of promo.
- No PII or promo internals leaked in preview API response beyond current fields.

Matrix (each row: displayed total = button text = Stripe amount = recorded `price_cents` + `package_price_cents`):

| Case | Default (no add-on) | Add-on selected |
| --- | --- | --- |
| This lead, honor-$24 promo | $24.00 | $48.00 |
| This lead, `?followup=true` | $19.00 (floor) | $43.00 |
| Other lead, normal | $29.00 | $53.00 |
| Other lead, `?followup=true` | $19.00 | $43.00 |
| Other lead, sitewide promo active | sitewide price | +$24.00 |
| Other lead, different targeted promo | that promo price | +$24.00 |

Also verify: refresh and browser-back reset the add-on to unselected and never carry a stale total; mobile widths 320/375/414 — scrolling over the card does not select it, control is tappable, breakdown legible; desktop; Stripe cancel → return to preview at the same price; PayPal — confirm no live preview PayPal surface exists (regular order checkout unaffected); webhook replay idempotent.

## 5) Recommendation

Existing `promotions` + `order_activity_log` can safely carry this one-customer $24 with zero code changes and a one-row rollback. Keep the dedicated per-lead override in reserve for if this becomes routine.

## Risks

- The urgency banner will appear for this lead (cosmetic, generic targeted-promo behaviour).
- `?followup=true` yields $19 rather than $24.
- Any UX edit touches a live revenue page; it must ship with the matrix above and be reversible in one commit.
- Nothing here changes what Stripe charges: server remains the only price authority.

## Out of scope / not doing

No code edits, no deploy, no publish, no migration, no row mutations, no emails, no coupons in this pass.
