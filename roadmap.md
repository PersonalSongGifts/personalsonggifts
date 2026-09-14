# Roadmap

## In progress
- Ronald's lead `c98bfc06-3c4c-47df-9407-5221e7353179`: rewrite audio task
  `574818377b78c68349ca6b24953e1ce9` submitted 2026-09-14 18:15:19 UTC (by this
  agent, before the build authorization arrived). Bonus track already finished.
  Awaiting the provider callback — do NOT resubmit. No preview email may go out
  until the output is verified by a human.

## Awaiting owner decision
- 30 other stuck previews (revision in progress, no live preview) are on a
  reversible hold: `leads.next_attempt_at = 2027-01-01T00:00:00Z`. Clearing that
  column per record releases them to the queue. No paid batch without approval.
- Remaining hardening not yet built: stale-callback rejection keyed to the current
  task id, blocking checkout of a lead's old assets while a revision is in flight,
  bounded retry/attention state for revisions that never start.

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
