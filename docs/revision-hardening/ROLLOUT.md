# Revision hardening — rollout order (NOT YET DEPLOYED)

Rollback baseline commit: `40f6413`.

## Deployment gate

`001_revision_binding_and_email_outbox.sql.txt` has NOT been validated against a
real Postgres (no disposable Postgres available in the build sandbox: `initdb`
refuses to run as root and `su`/`useradd` are absent). Validating it on a
throwaway database is a hard gate before step 1. No production syntax
experiments.

## Order (each step is safe to stop at)

1. **Migration first.** Apply `001_revision_binding_and_email_outbox.sql.txt`
   (additive only): `bound_revision_request_id` / `bound_revision_at` on
   `leads` + `orders`, backfill from existing approved rows, `email_outbox`,
   and the functions `apply_entity_patch`, `claim_revision_binding`,
   `release_revision_binding`, `bind_revision_task`, `claim_email_send`,
   `settle_email_send`. Service-role only; no client grants.
   Old code keeps working against the new schema (nothing is required yet).
2. **Generators**: `automation-generate-lyrics`, `automation-generate-audio`.
   They read the brief by bound id and fail closed; audio also calls
   `bind_revision_task` so the first task owns the accepted revision.
3. **Callback**: `automation-suno-callback`. Refuses a superseded task
   (`other_task` → 200 "Superseded revision task") and fails loudly when
   identity cannot be verified (500).
4. **Submit**: `submit-revision`. Lead and paid paths both go through
   `submitRevisionRequest` (atomic claim + patch + binding, no-op refused,
   bounded automatic release when generation never starts).
5. **Delivery**: `process-scheduled-deliveries`. Outbox-backed lease, Brevo
   `headers.idempotencyKey` (UUID, 30-minute TTL), `preview_sent_at` written
   only after provider acceptance and fenced to the generation.
6. **Read paths**: `get-lead-preview`, `create-lead-checkout` (previous-version
   view + checkout gate). Frontend `src/pages/SongPreview.tsx` ships with the
   normal build.

## Rollback

- Functions: redeploy each function from `40f6413` in reverse order (6 → 2).
- Migration: additive only, so it can stay in place after a code rollback.
  The old code ignores `bound_revision_request_id` and `email_outbox`.
- Held incident cohort (30 leads, `next_attempt_at = 2027-01-01`) is untouched
  by every step above and stays held.

## Side-effect controls

- No paid generation is initiated by any step; generation only starts from a
  customer-submitted change request.
- Payment webhooks are never rejected: the purchase gate is at checkout
  creation only, and fulfilment holds live in the payment handlers.
- Emails: at-most-once for definite failures; an unconfirmed send is recorded
  as ambiguous, never auto-resent, and shown honestly to the customer.

## Rollout quiescence window (migration-first)

New generators require a binding that old submit code cannot create, so pause new
change requests for the few minutes between the migration and the deploy — nothing
is mutated and no allowance is consumed:

1. `admin_settings.revision_submissions_paused = 'true'` (submit-revision returns 503
   with plain customer copy; the free change stays available).
2. Apply `001_revision_binding_and_email_outbox.sql.txt` (DEPLOYMENT GATE: must first
   be run against a real disposable Postgres — never against production as an experiment).
3. Deploy in this order: `_shared` consumers — `automation-generate-audio`,
   `automation-suno-callback`, `process-scheduled-deliveries`, `submit-revision`.
4. Set `revision_submissions_paused = 'false'`.

Rollback: set the pause flag back to `'true'`, redeploy the functions from baseline
`40f6413`, and leave the additive columns/RPCs in place (they are inert to old code).
