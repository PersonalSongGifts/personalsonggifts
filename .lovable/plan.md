# Change requests are failing in production — diagnosis and repair plan

## What is happening

The live "request changes" feature is broken for every customer, and preview emails have
also stopped going out. Both have the same cause: the new revision code went live, but the
database pieces it depends on were never installed.

Confirmed read-only evidence:

- The live database has **none** of the required new pieces: no `bound_revision_*` columns on
  leads/orders, no `email_outbox` table, and only 3 functions exist
  (`calculate_lead_quality_score`, `claim_album_cover_attempt`, `find_orders_by_short_id`).
- Every change request since 2026-09-15 10:55 UTC was rejected with the same message:
  `Could not find the function public.claim_revision_binding(...) in the schema cache`.
  15 rejections across **4 customers**: `4f21b8de…` (Giz, 8 attempts), `9205162c…` (2),
  `7a849200…` (3), `eb1799ac…` (2, most recent 2026-09-17 09:54).
- Giz's lead is untouched and undamaged: `revision_count=0`, `max_revisions=1`,
  `pending_revision=false`, `revision_status` empty, both audio files intact,
  token `ef9f799e…` valid. She was never charged and no allowance was consumed.
- **Second, previously unreported outage:** preview emails now go through the missing
  `claim_email_send`, so the claim always fails and nothing is sent. Last preview email:
  2026-09-14. Songs are being generated and scheduled but not delivered — e.g.
  `f6fe53da…` due 2026-09-17 12:42, `a1657d73…` due 2026-09-14 21:46, both unsent.

## Was code deployed ahead of its migration?

Yes. The migration was deliberately kept as unapplied source
(`docs/revision-hardening/001_revision_binding_and_email_outbox.sql.txt`, rollback baseline
`40f6413`), while the functions that need it were auto-deployed on save. This is the same
failure mode as the earlier preview outage: `get-lead-preview` went live referencing
`bound_revision_request_id` and returned "Preview not found" until it was reverted.
Deployed-ahead functions: `submit-revision`, `process-scheduled-deliveries`,
`automation-generate-lyrics`, `automation-generate-audio`, `automation-suno-callback`.
The generators and callback read rows with `select("*")`, so they degrade quietly instead of
erroring; `submit-revision` and delivery fail hard.

## Everything the deployed code needs (nothing may be installed piecemeal)

Installing only `claim_revision_binding` would fail at the next step: generation would abort
on `reserve_revision_generation`, the callback on `verify_revision_task`, delivery on
`claim_email_send`. The full additive set, in dependency order:

1. Columns on `leads` **and** `orders`: `bound_revision_request_id`, `bound_revision_at`,
   `bound_revision_generation_id`, `bound_revision_task_id`, `bound_revision_bonus_task_id`
   (plus the backfill from existing approved rows).
2. `apply_entity_patch(text, uuid, jsonb)` — used inside the claim to apply the customer's
   edits atomically with the binding.
3. `claim_revision_binding(text, uuid, uuid, integer, jsonb)` — submit path.
4. `release_revision_binding(text, uuid, uuid, text)` — bounded automatic recovery when
   generation never starts.
5. `reserve_revision_generation(text, uuid, uuid, uuid)` and
   `attach_revision_task(text, uuid, uuid, uuid, text, text)` — generation identity.
6. `verify_revision_task(text, uuid, text, text)` — callback fencing; plus the drop of the
   superseded `bind_revision_task(text, uuid, text)`.
7. `email_outbox` table + unique idempotency index + state index + service-role grants +
   RLS enabled with no client policies.
8. `claim_email_send(text, text, uuid, text, text, jsonb, integer, integer, integer)` and
   `settle_email_send(uuid, uuid, text, text, text)`; plus drops of the two superseded
   earlier signatures.
9. Service-role `GRANT EXECUTE` on each function (already in the script).
10. Config: `admin_settings.revision_submissions_paused` used as the quiescence switch.

No triggers are required. Everything is additive; nothing is dropped or retyped except the
two superseded function signatures the script already handles.

## Smallest safe repair, in order

1. Set `admin_settings.revision_submissions_paused = 'true'` so customers get honest copy
   instead of a rejection while the schema changes land (their free change stays available).
2. Validate the migration SQL once more on the isolated engine harness
   (`node docs/revision-hardening/sql-tests/run-sql-tests.mjs`, 40 assertions), acknowledging
   it is single-session and not multi-session proof.
3. Apply the migration as **one** transaction, all ten items above together.
4. Read-only verification (below) before unpausing.
5. Set `revision_submissions_paused = 'false'`.
6. Re-verify preview delivery resumes for the already-scheduled unsent leads
   (`f6fe53da…`, `a1657d73…`, `e32c6c04…`) without touching the 30 intentionally held records
   (`next_attempt_at = 2027-01-01`).

No function redeploys are needed — the code that needs these objects is already live. If a
deploy is wanted for the `get-lead-preview` binding column, that is a separate, later step.

## Rollback, idempotency, in-flight safety

- **Rollback:** the migration is additive, so it can simply stay in place. If the code must be
  rolled back, redeploy the five functions from `40f6413`; old code ignores the new columns
  and `email_outbox`.
- **Idempotency:** every statement is `IF NOT EXISTS` / `CREATE OR REPLACE`, so re-running is
  safe. `email_outbox` carries a unique idempotency key, and the email claim reuses the same
  provider key inside Brevo's 30-minute window.
- **In-flight revisions:** there are none in a bound state — the binding columns do not exist
  yet. 8 old `pending` requests (all paid orders, oldest 2026-03-24) predate this work and are
  left alone; the backfill only marks already-approved rows.
- **Duplicate submits:** after the migration, the claim locks the entity row and enforces the
  allowance atomically, so Giz's repeated taps (she submitted 8 times in 15 minutes) can only
  ever consume one change; losers are rejected without consuming anything.

## Recovering Giz's request without a charge, a retype, or a second revision

Her richest submissions are `79820654-1529-44cf-b349-bca783c133fb` (pronunciation +
two extra memories in "anything else") and `833f6ebc-ab06-473c-b459-5d7a705f1a02`
(pronunciation, memory, special message, plus `style_notes = "No changes"`).
Proposed: replay `79820654…` — it has the real added content and no filler style note —
by re-submitting the **stored** payload through the normal path once the migration is in, so:

- `revision_count` goes 0 → 1 exactly once, `max_revisions` stays 1;
- the other seven rejected rows stay rejected and consume nothing;
- no payment, no refund, no re-typing by the customer;
- her existing preview and full audio are archived to history before invalidation.

Her pronunciation note is a phonetic hint ("spelt Giz, sounds like 'Jizz'"). Display spelling
stays "Giz"; the hint is passed to the sung performance only, and the prose is never sung as
the name. I will not promise the vocal will match exactly.

This recovery needs your explicit go-ahead, because it does start one paid generation for her
song.

## Preflight checks (read-only, before applying)

- Function inventory: expect the 3 existing functions only; confirm the 8 new names are absent.
- `to_regclass('public.email_outbox')` is null; no `bound_%` columns on leads/orders.
- Confirm Giz's lead is still `revision_count=0`, `pending_revision=false`, both URLs present.
- Count leads with `revision_status='processing'` and no preview (currently 29) so the number
  is unchanged afterwards.
- Confirm the 30 held records still carry `next_attempt_at = 2027-01-01`.

## Post-fix verification (no generation)

- All 8 functions present with the exact argument signatures listed above; `email_outbox`
  exists with its unique index; service-role grants present; RLS enabled with no client policy.
- Dry-run without spending: call `claim_revision_binding` for a **synthetic** lead row created
  and deleted inside a rolled-back transaction — proves the signature resolves and the
  allowance logic fires with zero effect on real records.
- Confirm PostgREST resolves the new signature (the original failure was a schema-cache miss),
  by a single change-request submission from one of the four affected customers' tokens after
  unpausing — or by the transaction dry-run above if you prefer zero live submissions first.
- Preview delivery: confirm `email_outbox` rows appear for the scheduled unsent leads and that
  `preview_sent_at` is written only after provider acceptance.
- Re-run the preflight counts and confirm the held cohort is untouched.

## Still open / honest gaps

- The migration has never run against a real multi-session Postgres; the isolated engine
  harness is preliminary evidence only. That gate is unchanged by this plan.
- Remaining callback-mutation fencing and the scheduled unresolved-send sweep are unfinished
  source work and are not part of this repair.
