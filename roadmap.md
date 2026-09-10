# Roadmap

## In progress
- [x] Stage inert draft source for existing-song (lead preview) PayPal under `docs/checkout-staging/` — no runtime edits, no deploys, launch flag disabled.

## Open (blocked on owner decisions — see docs/checkout-staging/README.md §Blockers)
- [ ] Decide on PayPal payee merchant-id value to pin capture verification against.
- [ ] Decide whether Stripe lead fulfilment adopts the shared finalizer (additive gated path) before PayPal launch.
- [ ] Decide scheduling owner for approved-but-abandoned payment recovery (design staged, no cron installed).
- [ ] Apply attempt-table SQL and enable `lead_paypal_creation_enabled` (both deliberately not done).

## Handled elsewhere
- Cancellation-URL discount roundtrip fix — parent is implementing locally; not duplicated here.
