# Roadmap

## In progress
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
