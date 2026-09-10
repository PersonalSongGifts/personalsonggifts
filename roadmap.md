# Roadmap

## In progress
- (none)

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
