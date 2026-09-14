// Isolated SQL test harness for the (still unapplied) revision-hardening
// migration. Runs the EXACT migration text against an in-process PostgreSQL
// engine (PGlite) over a minimal synthetic fixture.
//
//   bunx --bun node docs/revision-hardening/sql-tests/run-sql-tests.mjs
//   (or: node docs/revision-hardening/sql-tests/run-sql-tests.mjs)
//
// LIMITATION, stated explicitly: PGlite executes real PostgreSQL SQL/PL/pgSQL
// but is a SINGLE-SESSION engine. Passing here is NOT proof of multi-session
// FOR UPDATE / row-lock concurrency behaviour. A real Postgres run remains the
// deployment gate.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

const here = dirname(fileURLToPath(import.meta.url));
const fixtureSql = readFileSync(join(here, "fixture.sql"), "utf8");
const migrationSql = readFileSync(
  join(here, "..", "001_revision_binding_and_email_outbox.sql.txt"),
  "utf8",
);

let pass = 0;
const failures = [];
const check = (name, ok, detail) => {
  if (ok) {
    pass += 1;
    console.log(`  ok   ${name}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
};

const db = new PGlite();
await db.exec(fixtureSql);
await db.exec(migrationSql);
console.log("migration applied");

const one = async (sql, params) => (await db.query(sql, params)).rows[0];

// ---------------------------------------------------------------------------
// Binding: claim / replay / allowance / eligibility
// ---------------------------------------------------------------------------
const lead = await one(
  `INSERT INTO public.leads (recipient_name, genre, revision_count, max_revisions)
   VALUES ('Dionne', 'rnb', 0, 1) RETURNING id`,
);
const req = await one(
  `INSERT INTO public.revision_requests (lead_id, status, style_notes, tempo)
   VALUES ($1, 'pending', 'slower, warmer', 'slow') RETURNING id`,
  [lead.id],
);

let r = await one(
  `SELECT * FROM public.claim_revision_binding('lead', $1, $2, 0, '{}'::jsonb)`,
  [lead.id, req.id],
);
check("first claim succeeds (no ambiguous column error)", r?.result === "claimed", JSON.stringify(r));
check("claim consumes exactly one allowance", r?.revision_count === 1, JSON.stringify(r));

r = await one(
  `SELECT * FROM public.claim_revision_binding('lead', $1, $2, 1, '{}'::jsonb)`,
  [lead.id, req.id],
);
check("duplicate submission of same request is an idempotent replay", r?.result === "claimed", JSON.stringify(r));

const req2 = await one(
  `INSERT INTO public.revision_requests (lead_id, status) VALUES ($1, 'pending') RETURNING id`,
  [lead.id],
);
r = await one(
  `SELECT * FROM public.claim_revision_binding('lead', $1, $2, 1, '{}'::jsonb)`,
  [lead.id, req2.id],
);
check("second request while one is in flight is rejected", r?.result === "already_bound", JSON.stringify(r));

// NULL revision_status first-timer must NOT be treated as concurrent.
const fresh = await one(
  `INSERT INTO public.leads (recipient_name, revision_status, revision_count, max_revisions)
   VALUES ('Rene', NULL, NULL, 1) RETURNING id`,
);
const freshReq = await one(
  `INSERT INTO public.revision_requests (lead_id, status) VALUES ($1, 'pending') RETURNING id`,
  [fresh.id],
);
r = await one(
  `SELECT * FROM public.claim_revision_binding('lead', $1, $2, 0, '{}'::jsonb)`,
  [fresh.id, freshReq.id],
);
check("SQL NULL revision_status / NULL count first-timer can claim", r?.result === "claimed", JSON.stringify(r));

// Entity patch lands in the same transaction as the binding.
const patched = await one(
  `SELECT recipient_name, recipient_name_pronunciation, genre, bound_revision_request_id
     FROM public.leads WHERE id = $1`,
  [fresh.id],
);
check("binding row is written", patched?.bound_revision_request_id === freshReq.id, JSON.stringify(patched));

const patchLead = await one(
  `INSERT INTO public.leads (recipient_name, revision_count, max_revisions)
   VALUES ('Dionne', 0, 1) RETURNING id`,
);
const patchReq = await one(
  `INSERT INTO public.revision_requests (lead_id, status) VALUES ($1, 'pending') RETURNING id`,
  [patchLead.id],
);
r = await one(
  `SELECT * FROM public.claim_revision_binding('lead', $1, $2, 0, $3::jsonb)`,
  [patchLead.id, patchReq.id, JSON.stringify({ recipient_name_pronunciation: "Di-on", genre: "rnb", preview_song_url: null })],
);
const afterPatch = await one(
  `SELECT recipient_name, recipient_name_pronunciation, genre, preview_song_url FROM public.leads WHERE id = $1`,
  [patchLead.id],
);
check("customer edits apply atomically with the claim", r?.result === "claimed"
  && afterPatch?.recipient_name === "Dionne"
  && afterPatch?.recipient_name_pronunciation === "Di-on"
  && afterPatch?.preview_song_url === null, JSON.stringify({ r, afterPatch }));

let threw = null;
try {
  await db.query(`SELECT * FROM public.claim_revision_binding('lead', $1, $2, 0, $3::jsonb)`, [
    patchLead.id, patchReq.id, JSON.stringify({ "drop_me; --": 1 }),
  ]);
} catch (e) { threw = String(e?.message ?? e); }
check("unknown patch column is rejected (no injection)", !!threw && /unknown column/i.test(threw), threw ?? "no error");

// Allowance exhausted.
const spent = await one(
  `INSERT INTO public.leads (recipient_name, revision_count, max_revisions, revision_status)
   VALUES ('Spent', 1, 1, 'completed') RETURNING id`,
);
const spentReq = await one(
  `INSERT INTO public.revision_requests (lead_id, status) VALUES ($1, 'pending') RETURNING id`,
  [spent.id],
);
r = await one(`SELECT * FROM public.claim_revision_binding('lead', $1, $2, 1, '{}'::jsonb)`, [spent.id, spentReq.id]);
check("exhausted allowance returns no_allowance", r?.result === "no_allowance", JSON.stringify(r));

// Purchased / converted lead: keep the payment, never remake behind it.
const bought = await one(
  `INSERT INTO public.leads (recipient_name, status, order_id, revision_count, max_revisions)
   VALUES ('Bought', 'converted', gen_random_uuid(), 0, 1) RETURNING id`,
);
const boughtReq = await one(
  `INSERT INTO public.revision_requests (lead_id, status) VALUES ($1, 'pending') RETURNING id`,
  [bought.id],
);
r = await one(`SELECT * FROM public.claim_revision_binding('lead', $1, $2, 0, '{}'::jsonb)`, [bought.id, boughtReq.id]);
check("purchase in flight blocks a lead claim", r?.result === "purchased", JSON.stringify(r));

// Foreign request / stale expected count.
const other = await one(`INSERT INTO public.leads (recipient_name) VALUES ('Other') RETURNING id`);
r = await one(`SELECT * FROM public.claim_revision_binding('lead', $1, $2, 0, '{}'::jsonb)`, [other.id, boughtReq.id]);
check("request belonging to another record is missing_request", r?.result === "missing_request", JSON.stringify(r));

const raced = await one(
  `INSERT INTO public.leads (recipient_name, revision_count, max_revisions) VALUES ('Raced', 1, 3) RETURNING id`,
);
const racedReq = await one(
  `INSERT INTO public.revision_requests (lead_id, status) VALUES ($1, 'pending') RETURNING id`,
  [raced.id],
);
r = await one(`SELECT * FROM public.claim_revision_binding('lead', $1, $2, 0, '{}'::jsonb)`, [raced.id, racedReq.id]);
check("stale expected revision_count loses the claim", r?.result === "not_eligible", JSON.stringify(r));

// ---------------------------------------------------------------------------
// Generation / task identity
// ---------------------------------------------------------------------------
const genId = (await one(`SELECT gen_random_uuid() AS id`)).id;
r = await one(`SELECT * FROM public.reserve_revision_generation('lead', $1, $2, $3)`, [fresh.id, freshReq.id, genId]);
check("generation reserved before provider submission", r?.result === "reserved", JSON.stringify(r));
r = await one(`SELECT * FROM public.reserve_revision_generation('lead', $1, $2, $3)`, [fresh.id, freshReq.id, genId]);
check("reserving the same generation twice is idempotent", r?.result === "reserved", JSON.stringify(r));
const wrongGen = (await one(`SELECT gen_random_uuid() AS id`)).id;
r = await one(`SELECT * FROM public.reserve_revision_generation('lead', $1, $2, $3)`, [fresh.id, freshReq.id, wrongGen]);
check("a different generation cannot steal the reservation", r?.result !== "reserved", JSON.stringify(r));

r = await one(`SELECT * FROM public.attach_revision_task('lead', $1, $2, $3, 'task-A', 'primary')`, [fresh.id, freshReq.id, genId]);
check("primary task attaches once", r?.result === "attached" || r?.result === "already_attached", JSON.stringify(r));
r = await one(`SELECT * FROM public.attach_revision_task('lead', $1, $2, $3, 'task-B', 'primary')`, [fresh.id, freshReq.id, genId]);
check("a second primary task cannot overwrite the binding", r?.result !== "attached" || r?.bound_task_id === "task-A", JSON.stringify(r));
r = await one(`SELECT * FROM public.attach_revision_task('lead', $1, $2, $3, 'bonus-A', 'bonus')`, [fresh.id, freshReq.id, genId]);
check("bonus lane has its own task identity", r?.result === "attached" || r?.result === "already_attached", JSON.stringify(r));

r = await one(`SELECT * FROM public.verify_revision_task('lead', $1, 'task-A', 'primary')`, [fresh.id]);
check("callback verifies the bound primary task", r?.result === "verified", JSON.stringify(r));
r = await one(`SELECT * FROM public.verify_revision_task('lead', $1, 'task-OLD', 'primary')`, [fresh.id]);
check("an old task is rejected, never allowed to bind", r?.result === "other_task", JSON.stringify(r));
r = await one(`SELECT * FROM public.verify_revision_task('lead', $1, 'bonus-A', 'bonus')`, [fresh.id]);
check("callback verifies the bound bonus task", r?.result === "verified", JSON.stringify(r));
r = await one(`SELECT * FROM public.verify_revision_task('lead', $1, 'bonus-A', 'primary')`, [fresh.id]);
check("bonus task cannot pass as the primary lane", r?.result !== "verified", JSON.stringify(r));

// Release: never release a revision whose provider task exists.
const relBefore = await one(`SELECT revision_count FROM public.leads WHERE id = $1`, [fresh.id]);
let rel = (await one(`SELECT public.release_revision_binding('lead', $1, $2, 'test') AS out`, [fresh.id, freshReq.id])).out;
const relAfter = await one(`SELECT revision_count FROM public.leads WHERE id = $1`, [fresh.id]);
check("in-flight task is not released", rel === "task_in_flight" && relAfter.revision_count === relBefore.revision_count, String(rel));

const never = await one(
  `INSERT INTO public.leads (recipient_name, revision_count, max_revisions) VALUES ('NeverStarted', 0, 1) RETURNING id`,
);
const neverReq = await one(
  `INSERT INTO public.revision_requests (lead_id, status) VALUES ($1, 'pending') RETURNING id`, [never.id]);
await db.query(`SELECT * FROM public.claim_revision_binding('lead', $1, $2, 0, '{}'::jsonb)`, [never.id, neverReq.id]);
rel = (await one(`SELECT public.release_revision_binding('lead', $1, $2, 'never started') AS out`, [never.id, neverReq.id])).out;
const neverAfter = await one(`SELECT revision_count, revision_status, bound_revision_request_id FROM public.leads WHERE id = $1`, [never.id]);
check("a revision that never started gives the allowance back", rel === "released"
  && neverAfter.revision_count === 0
  && neverAfter.revision_status === null
  && neverAfter.bound_revision_request_id === null, JSON.stringify({ rel, neverAfter }));

// ---------------------------------------------------------------------------
// Email outbox: claim / settle / lease / provider key TTL
// ---------------------------------------------------------------------------
const claim = async (key, opts = {}) => one(
  `SELECT * FROM public.claim_email_send($1, 'lead', $2, 'revised_preview', $3, NULL, $4, $5, $6)`,
  [key, lead.id, opts.generationKey ?? genId, opts.maxAttempts ?? 3, opts.leaseSeconds ?? 600, opts.ttl ?? 1800],
);

let c1 = await claim("k1");
check("first email claim inserts and claims", c1?.claimed === true && c1?.state === "claimed", JSON.stringify(c1));
let c2 = await claim("k1");
check("duplicate scheduler pass does not double-claim", c2?.claimed === false, JSON.stringify(c2));

let s = await one(`SELECT * FROM public.settle_email_send($1, $2, 'accepted', 'msg-1', NULL)`, [c1.outbox_id, c1.lease_token]);
check("settle by the lease owner succeeds", s?.settled === true && s?.state === "accepted", JSON.stringify(s));
s = await one(`SELECT * FROM public.settle_email_send($1, $2, 'failed', NULL, 'late')`, [c1.outbox_id, c1.lease_token]);
check("stale worker cannot re-settle an accepted send", s?.settled === false && s?.state === "accepted", JSON.stringify(s));
c2 = await claim("k1");
check("accepted send is never re-sent", c2?.claimed === false && c2?.state === "accepted", JSON.stringify(c2));

let bad = null;
try { await db.query(`SELECT * FROM public.settle_email_send($1, $2, 'sent', NULL, NULL)`, [c1.outbox_id, c1.lease_token]); }
catch (e) { bad = String(e?.message ?? e); }
check("invalid settle state is rejected", !!bad && /invalid outbox state/i.test(bad), bad ?? "no error");

// Definite provider failure -> retry with a FRESH provider key.
const f1 = await claim("k2");
await db.query(`SELECT * FROM public.settle_email_send($1, $2, 'failed', NULL, 'provider 400')`, [f1.outbox_id, f1.lease_token]);
const f2 = await claim("k2");
check("definite failure retries", f2?.claimed === true && f2?.attempt_count === 2, JSON.stringify(f2));
check("definite failure rotates the provider key", f2?.provider_key !== f1.provider_key && f2?.provider_key_reused === false, JSON.stringify(f2));

// Accepted-then-crash INSIDE the provider dedupe window -> SAME provider key.
const x1 = await claim("k3");
await db.query(`UPDATE public.email_outbox SET lease_expires_at = now() - interval '1 minute' WHERE id = $1`, [x1.outbox_id]);
const x2 = await claim("k3");
check("expired claim inside provider TTL reuses the same provider key",
  x2?.claimed === true && x2?.provider_key === x1.provider_key && x2?.provider_key_reused === true, JSON.stringify(x2));
check("crashed attempt keeps its first_attempt_at", x2?.first_attempt_at && new Date(x2.first_attempt_at).getTime() === new Date(x1.first_attempt_at).getTime(),
  JSON.stringify({ a: x1.first_attempt_at, b: x2.first_attempt_at }));
check("takeover invalidates the crashed worker's lease token", x2?.lease_token !== x1.lease_token, JSON.stringify(x2));
s = await one(`SELECT * FROM public.settle_email_send($1, $2, 'accepted', 'msg-late', NULL)`, [x1.outbox_id, x1.lease_token]);
check("the crashed worker's late settle is fenced out", s?.settled === false && s?.stale_lease === true, JSON.stringify(s));

// Expired claim AT/AFTER the provider TTL boundary -> unresolved, never resent.
const y1 = await claim("k4", { ttl: 1800 });
await db.query(
  `UPDATE public.email_outbox
      SET lease_expires_at = now() - interval '1 minute',
          provider_key_issued_at = now() - interval '31 minutes'
    WHERE id = $1`, [y1.outbox_id]);
const y2 = await claim("k4");
check("past the provider dedupe window the send becomes unresolved, not resent",
  y2?.claimed === false && y2?.state === "ambiguous" && y2?.unresolved === true, JSON.stringify(y2));
const y3 = await claim("k4");
check("an unresolved send is not automatically resent on the next pass",
  y3?.claimed === false && y3?.unresolved === true, JSON.stringify(y3));

// Attempts exhausted.
const z1 = await claim("k5", { maxAttempts: 1 });
await db.query(`SELECT * FROM public.settle_email_send($1, $2, 'failed', NULL, 'provider 400')`, [z1.outbox_id, z1.lease_token]);
const z2 = await claim("k5", { maxAttempts: 1 });
check("exhausted attempts stop retrying", z2?.claimed === false, JSON.stringify(z2));

// ---------------------------------------------------------------------------
console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("\nFailures:");
  for (const f of failures) console.log(` - ${f}`);
}
console.log(
  "\nLIMITATION: PGlite is a single-session PostgreSQL engine. These results do NOT\n" +
  "prove multi-session row-lock / FOR UPDATE concurrency behaviour. Validation on a\n" +
  "real Postgres server remains the deployment gate.",
);
await db.close();
process.exit(failures.length ? 1 : 0);
