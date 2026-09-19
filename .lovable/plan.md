# Meta "4 purchases" after the Sep 18 relaunch — audit findings and minimal fixes

Read-only investigation. No code, data, payments, or messages were changed.

## What the records show

- No order has been created since 2026-09-18 13:19 UTC (before the 13:30 PT relaunch). Since 20:30 UTC: 0 orders, 0 package/lyrics/download/bonus unlocks, 0 tips, 5 leads.
- Backend request logs for the last 24 hours contain only scheduled jobs and promo lookups: `get-active-promo` (47), `process-scheduled-deliveries` (4), `brevo-prune-new-leads` (1). There is **no** invocation of `process-payment`, `process-lead-payment`, `capture-paypal-payment`, or `stripe-webhook`.
- No server-side Meta (CAPI) purchase log lines exist in that window, because the functions that emit them never ran.

Consequence: since the relaunch, no code path of ours produced a real paid purchase, and the receipt page was never successfully loaded after a Stripe session. The four purchases reported in Meta therefore do not correspond to any purchase event our system sent for a new payment. The remaining explanations are (a) Meta-side attribution/modelled or aggregated reporting, (b) purchase events fired by a **revisit of an older receipt link**, or (c) a second data source feeding that ad account. Only (b) is something our code controls, and it is a genuine defect (below). Nothing here can be proven from counts alone — the verification steps at the end are what would settle it.

## Real defects found in the tracking code (independent of this incident)

1. **Every server-side add-on/tip event is reported as a standard "Purchase".** All eight server calls pass only an event id and a content name; none passes an event name, so the shared helper falls back to `"Purchase"`. That covers tips, lyrics unlock, download unlock, bonus track, Forever Memory package and rush upgrade. The receipt page deliberately sends these as the custom event `AddOnPurchase`, so the server contradicts the front end and inflates standard purchase counts. The ids also differ (`pkg_<session>` server vs `addon_pkg_<session>` browser), so the two are never deduplicated.
2. **The song page fires a standard "Purchase" for the package with no event id.** In the song page, the package-unlock confirmation sends a standard purchase with no event id at all, so it can never be deduplicated against the server event or the receipt page's own event. A customer who buys the package on the song page can generate two or three counted purchases.
3. **Purchase de-duplication in the browser is per-tab only.** The receipt page guards with a ref plus `sessionStorage`. Reopening an old receipt link in a new tab, new session, or another device re-fires the purchase event. Meta's own id-based deduplication only covers a limited window, so an old receipt revisit can be counted again as a new purchase. This is the one plausible way a purchase could appear with no new order.

## Payment gating (no unpaid conversion found)

- `process-payment` and `verify-package-purchase` both require `payment_status === "paid"`, or a genuinely $0 session with `status === "complete"`.
- The PayPal capture requires the capture status to be `COMPLETED` and returns an explicit declined response otherwise.
- $0 (free-code) orders do reach the receipt page, but the front end suppresses tracking when the computed value is 0.

So an unpaid session cannot pass verification; the exposure is duplicate/replayed reporting, not fake paid conversions.

## Latest code vs what is running

The working tree is clean at commit `973a453`. Backend functions auto-deploy on save, so the server-side behaviour described above is live. The front-end files (receipt page, song page) are only live where the site has been published; the most recent front-end work was intentionally not published, so the published pages may lag the repo. Any fix below needs an explicit publish to take effect for customers.

## Proposed minimal, compatible fixes

1. Pass an explicit event name on the six add-on/tip server calls so they send `AddOnPurchase`, not `Purchase`, and align their event ids with the browser ids (`addon_pkg_…`, `addon_rush_…`, etc.). Base-song purchases (Stripe order, lead conversion, PayPal) keep `Purchase` with `purchase_<orderId>` unchanged.
2. Change the song page's package confirmation to the same custom `AddOnPurchase` event with the matching event id, reusing the receipt page's helper shape.
3. Make purchase de-duplication durable: key the guard on the order id in `localStorage` as well as `sessionStorage`, so revisiting an old receipt link never re-fires a purchase.
4. No changes to prices, payment math, webhooks, schema, promotions, or customer records.

## Tests worth having

- Unit test of the shared server helper: asserts the outgoing event name and id per call site, so an add-on can never silently send `Purchase` again.
- Unit tests for the de-duplication guard: first receipt visit fires once; a second visit with a fresh `sessionStorage` but existing `localStorage` marker fires nothing; a $0 order fires nothing.
- Song-page test: package confirmation fires exactly one custom add-on event with a stable id.
- A parity test asserting the browser and server ids for the same add-on session are identical.

## Verification steps to settle the Meta question

- Read Meta Events Manager for the four events: event name, event id, and whether they are browser, server, or modelled.
- Compare their event ids against the `purchase_<orderId>` / add-on id formats; an id pointing at an old order confirms the revisit-replay path.
- Confirm no other tool or offline upload feeds that pixel.

Nothing will be edited, deployed, or published without your go-ahead.
