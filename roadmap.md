# Roadmap

## In progress
- [x] 2026-09-18 Meta tracking integrity: `fbq('set','autoConfig',false,'1231290262288040')`
  before init (blocks Meta's server-side click rule `1381950960732868`, button text
  "get my song now", which derived a standard Purchase from a click); six add-on/tip
  server CAPI calls now send `AddOnPurchase` with `addon_<kind>_<session>` ids matching
  the browser; SongPlayer package confirmation switched from standard Purchase (no
  eventID) to custom AddOnPurchase with `addon_pkg_<session>`; durable localStorage
  dedupe keyed by order id + legacy per-tab key; no silent price fallback — an absent
  or non-positive verified amount suppresses reporting only. Base purchases keep
  `purchase_<orderId>`. Reporting-only; no charging/order/price/DB/email change.
  NOT PUBLISHED (frontend). Open: cross-device old-receipt replay needs a provider
  payment-confirmation timestamp in the verify responses (`paidAt` is read if present,
  helper + tests exist, server does not yet return it); runtime confirmation that the
  click rule is blocked must be done on the live domain (sandbox sends no pixel traffic).
- [x] 2026-09-18 preview offer clarity (pricing incident, lead d9bb7942): always-visible
  Full song / Forever Memory Package / Total today line items, add-on labelled
  "Optional add-on … $24.00 extra", real 48px checkbox + label are the only toggles
  (card taps no longer select), "Remove add-on" action, urgency banner suppressed unless
  the targeted promo has show_banner=true (`targetedPromoShowBanner` added to
  get-lead-preview). Display only — no pricing/Stripe/PayPal/webhook logic changed.
  Tests: src/lib/__tests__/previewOffer.test.ts (17). Not published.
- [x] APPLIED 2026-09-17: revision binding + email_outbox migration is now live
  (drizzle/migrations/0000_revision_binding_and_email_outbox.sql). All 8 RPCs present,
  bind_revision_task dropped, email_outbox RLS on with service-role grants only.
  Change requests and preview emails work again; pause flag back to 'false'.
- [x] LIVE FIX: `get-lead-preview` no longer selects the unapplied-migration column
  `bound_revision_request_id` (PostgreSQL 42703 broke every preview link); DB errors
  now return 500 instead of a false 404. Deployed alone.
- [ ] Audit the other functions that reference unapplied migration columns/RPCs
  (`submit-revision`, `automation-generate-*`, `automation-suno-callback`,
  `process-scheduled-deliveries`) — they must not be deployed before the migration.
- [ ] Fence every callback mutation to its current task and accepted revision identity; DB errors return 500 and zero-row writes stop downstream work.

- [ ] Preserve typed pronunciation from the revision form through lyrics and both audio renditions without changing display spelling.
- [ ] Complete evidence-only preview-email reconciliation and expose honest delivery state on the preview page.
- [ ] Add and run isolated migration fixtures covering rollback, NULLs, concurrency, allowances, task identity, and expired leases.
- [ ] Verify the existing Stripe and PayPal checkout paths without adding a new PayPal feature.

## Safety holds
- 30 other stuck previews (revision in progress, no live preview) are on a
  reversible hold: `leads.next_attempt_at = 2027-01-01T00:00:00Z`. Clearing that
  column per record releases them to the queue. No paid batch without approval.
- Ronald's recovered record must not be regenerated.

## Staged, not launched — `docs/checkout-staging/`
PayPal on the existing-song preview checkout. Complete reviewable draft source +
44 offline tests. Nothing deployed, no migration applied, both flags off.
Blockers before launch (details in `docs/checkout-staging/README.md`):
- [ ] Extract lead offer pricing/eligibility out of `create-lead-checkout` into
      `_shared/lead-checkout.ts` so both rails share it (`resolveLeadOfferCents`
      is deliberately unimplemented until then).
- [ ] Owner to supply `PAYPAL_PAYEE_MERCHANT_ID`; payee verification will not pass without it.
- [ ] Diff the RPC's order insert against `buildLeadAssetPatch()`, then enable and
      verify `lead_finalizer_v2_enabled` on Stripe *before* enabling PayPal.
- [ ] Apply `sql/001_paypal_lead_attempts.sql.txt` (unapplied by design).
- [ ] Decide the reconciliation schedule (no cron installed, per instruction).
- [ ] Decide the declined-return link on the success page (no preview token in the return URL).
- [ ] Real PayPal sandbox + throwaway Postgres testing; not possible in this environment.

## Owned elsewhere
- Cancellation / promo-flag roundtrip fix (item A) — parent implementing locally,
  intentionally not duplicated here.

## SQL harness (added)
- `node docs/revision-hardening/sql-tests/run-sql-tests.mjs` — runs the exact unapplied migration against PGlite + synthetic fixture (40 assertions). Single-session: not concurrency proof; real-Postgres validation stays the deploy gate.
- Fixed reviewer-reported PL/pgSQL output-variable shadowing (`revision_count`, `attempt_count`, `state`, `provider_message_id`) by schema-qualifying table references.

## Admin > Leads reliability fix (source-only, not published)
- [x] Server-side lead search in admin-orders (optional `search`, escaped wildcards, same 12 columns + id)
- [x] 300ms debounce, abort + sequence guard for stale responses
- [x] First page usable immediately; pages 1..n commit progressively, never re-enter full-list loading
- [x] 20s per-request timeout, visible error + Retry (no infinite spinner)
- [x] Server totals for counts; CSV exports the full dataset on demand or fails loudly
- [x] Auto-open lead effect no longer refires on leads array identity change
- [x] Tests: 27 new Vitest (search races, view state, paging, export), 11 Deno (search helpers)
- [ ] Unverified: authenticated in-browser run of the leads table (needs the admin password)
