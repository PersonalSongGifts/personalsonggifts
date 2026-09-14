// Tests for the two release-blocking defects:
//   (1) provider idempotency key handling across crashes / lease expiry / TTL,
//   (2) immutable revision identity captured BEFORE provider submission, with the
//       callback only ever VERIFYING it and final writes fenced to it.
// Run with:
//   deno test supabase/functions/_shared/revision-identity_test.ts
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  PROVIDER_KEY_TTL_SECONDS,
  classifyReclaim,
  classifySendOutcome,
  customerFacingSendStatus,
} from "./email-outbox.ts";
import { deliverLeadPreview } from "./revision-orchestration.ts";
import {
  attachRevisionTask,
  reserveRevisionGeneration,
  revisionFinalWriteFence,
  revisionSubmissionGate,
  stopDownstream,
  verifyRevisionTask,
} from "./revision-binding.ts";

// --------------------------------------------------------------------------
// (1) Provider idempotency key: accepted-then-crash, TTL boundary, stale worker
// --------------------------------------------------------------------------

Deno.test("accepted-then-crash inside the provider window reuses the SAME key", () => {
  assertEquals(
    classifyReclaim({
      state: "claimed",
      attemptCount: 1,
      maxAttempts: 3,
      leaseExpired: true,
      providerKeyAgeSeconds: 60,
    }),
    "claim_reuse_key",
  );
});

Deno.test("TTL boundary: inside reuses, at/after the TTL is unresolved, never a fresh send", () => {
  const row = { state: "claimed" as const, attemptCount: 1, maxAttempts: 3, leaseExpired: true };
  assertEquals(classifyReclaim({ ...row, providerKeyAgeSeconds: PROVIDER_KEY_TTL_SECONDS - 1 }), "claim_reuse_key");
  assertEquals(classifyReclaim({ ...row, providerKeyAgeSeconds: PROVIDER_KEY_TTL_SECONDS }), "unresolved_ambiguous");
  assertEquals(classifyReclaim({ ...row, providerKeyAgeSeconds: PROVIDER_KEY_TTL_SECONDS + 600 }), "unresolved_ambiguous");
  // A custom (shorter) provider TTL is respected rather than assumed.
  assertEquals(
    classifyReclaim({ ...row, providerKeyAgeSeconds: 400, providerTtlSeconds: 300 }),
    "unresolved_ambiguous",
  );
});

Deno.test("only a DEFINITE rejection earns a fresh key, and only while attempts remain", () => {
  assertEquals(
    classifyReclaim({ state: "failed", attemptCount: 1, maxAttempts: 3, leaseExpired: true, providerKeyAgeSeconds: 9999 }),
    "claim_fresh_key",
  );
  assertEquals(
    classifyReclaim({ state: "failed", attemptCount: 3, maxAttempts: 3, leaseExpired: true, providerKeyAgeSeconds: 10 }),
    "not_claimable",
  );
  // Accepted and ambiguous rows are never reclaimed automatically.
  for (const state of ["accepted", "ambiguous"] as const) {
    assertEquals(
      classifyReclaim({ state, attemptCount: 1, maxAttempts: 3, leaseExpired: true, providerKeyAgeSeconds: 10 }),
      "not_claimable",
    );
  }
  // A live lease is not reclaimable either: a duplicate scheduler pass must wait.
  assertEquals(
    classifyReclaim({ state: "claimed", attemptCount: 1, maxAttempts: 3, leaseExpired: false, providerKeyAgeSeconds: 10 }),
    "not_claimable",
  );
});

Deno.test("provider duplicate_parameter is EVIDENCE of acceptance, not a failure", () => {
  const outcome = classifySendOutcome({
    kind: "response",
    ok: false,
    status: 400,
    body: '{"code":"duplicate_parameter","message":"idempotencyKey already used"}',
  });
  assertEquals(outcome.state, "accepted");
});

function outboxDb(row: Record<string, unknown> | null, opts: { settleStaleLease?: boolean } = {}) {
  const calls: string[] = [];
  return {
    calls,
    db: {
      rpc: async (fn: string, _args: Record<string, unknown>) => {
        calls.push(fn);
        if (fn === "claim_email_send") {
          return { data: row ? [row] : [], error: null };
        }
        if (fn === "settle_email_send") {
          return { data: [{ settled: !opts.settleStaleLease, state: "accepted", stale_lease: !!opts.settleStaleLease }], error: null };
        }
        return { data: null, error: { message: `unexpected rpc ${fn}` } };
      },
    },
  };
}

function deliverDeps(db: unknown, record: Record<string, unknown> | null) {
  const notes: string[] = [];
  const marked: string[] = [];
  const providerKeys: (string | null)[] = [];
  return {
    notes,
    marked,
    providerKeys,
    deps: {
      db,
      reloadRecord: async () => record,
      readiness: () => ({ ready: true, reason: null }),
      send: async (providerIdempotencyKey: string | null) => {
        providerKeys.push(providerIdempotencyKey);
        return { kind: "response" as const, ok: true, status: 200, providerMessageId: "m1", body: "{}" };
      },
      markAttempted: async (id: string) => {
        marked.push(id);
        return { error: null, fenced: true };
      },
      note: async (_id: string, message: string) => { notes.push(message); },
    },
  };
}

const readyRecord = { id: "L1", preview_song_url: "p.mp3", generated_at: "2026-09-14T19:03:42Z" };

Deno.test("a past-TTL expired claim is reported unresolved and is NOT resent", async () => {
  const { db, calls } = outboxDb({
    outbox_id: "o1",
    state: "ambiguous",
    attempt_count: 1,
    claimed: false,
    unresolved: true,
    first_attempt_at: "2026-09-14T18:00:00Z",
  });
  const d = deliverDeps(db, readyRecord);
  const res = await deliverLeadPreview(d.deps as never, "L1");
  assertEquals(res.state, "unresolved");
  assertEquals(d.providerKeys.length, 0, "nothing may be handed to the provider");
  assertEquals(d.marked.length, 0);
  assert(d.notes.some((n) => n.includes("unresolved")));
  assertEquals(calls.includes("settle_email_send"), false);
  assert(customerFacingSendStatus("ambiguous").includes("couldn't confirm"));
});

Deno.test("a reclaimed attempt reuses the provider key, so the provider dedupes it", async () => {
  const { db } = outboxDb({
    outbox_id: "o1",
    state: "claimed",
    attempt_count: 2,
    claimed: true,
    provider_key: "11111111-1111-1111-1111-111111111111",
    provider_key_reused: true,
    lease_token: "lease-2",
    first_attempt_at: "2026-09-14T19:00:00Z",
  });
  const d = deliverDeps(db, readyRecord);
  const res = await deliverLeadPreview(d.deps as never, "L1");
  assertEquals(res.state, "accepted");
  assertEquals(d.providerKeys, ["11111111-1111-1111-1111-111111111111"]);
  assert(d.notes.some((n) => n.includes("deduplication")));
});

Deno.test("a stale worker cannot settle a lease it no longer owns, and stamps nothing", async () => {
  const { db } = outboxDb({
    outbox_id: "o1",
    state: "claimed",
    attempt_count: 1,
    claimed: true,
    provider_key: "22222222-2222-2222-2222-222222222222",
    lease_token: "lease-old",
  }, { settleStaleLease: true });
  const d = deliverDeps(db, readyRecord);
  const res = await deliverLeadPreview(d.deps as never, "L1");
  assertEquals(res.reason, "stale_lease");
  assertEquals(d.marked.length, 0, "a superseded worker must not stamp the record");
  assert(d.notes.some((n) => n.includes("superseded")));
});

Deno.test("duplicate scheduler passes: the second pass claims nothing and sends nothing", async () => {
  const { db } = outboxDb({ outbox_id: "o1", state: "claimed", attempt_count: 1, claimed: false });
  const d = deliverDeps(db, readyRecord);
  const res = await deliverLeadPreview(d.deps as never, "L1");
  assertEquals(res.state, "not_claimed");
  assertEquals(d.providerKeys.length, 0);
  assertEquals(d.marked.length, 0);
});

// --------------------------------------------------------------------------
// (2) Immutable revision identity: reserved before submission, verified after
// --------------------------------------------------------------------------

function identityDb(state: {
  boundRequest?: string | null;
  generation?: string | null;
  task?: string | null;
  error?: string;
}) {
  return {
    state,
    rpc: async (fn: string, args: Record<string, unknown>) => {
      if (state.error) return { data: null, error: { message: state.error } };
      if (fn === "reserve_revision_generation") {
        if (!state.boundRequest) return { data: [{ result: "no_revision", generation_id: null }], error: null };
        if (state.boundRequest !== args.p_request_id) return { data: [{ result: "not_bound", generation_id: null }], error: null };
        if (state.generation) {
          return {
            data: [{
              result: state.generation === args.p_generation_id ? "reserved" : "other_generation",
              generation_id: state.generation,
            }],
            error: null,
          };
        }
        state.generation = String(args.p_generation_id);
        return { data: [{ result: "reserved", generation_id: state.generation }], error: null };
      }
      if (fn === "attach_revision_task") {
        if (state.boundRequest !== args.p_request_id || state.generation !== args.p_generation_id) {
          return { data: [{ attach_revision_task: "identity_mismatch" }], error: null };
        }
        if (!state.task) {
          state.task = String(args.p_task_id);
          return { data: [{ attach_revision_task: "attached" }], error: null };
        }
        return {
          data: [{ attach_revision_task: state.task === args.p_task_id ? "attached" : "other_task" }],
          error: null,
        };
      }
      if (fn === "verify_revision_task") {
        if (!state.boundRequest) return { data: [{ result: "no_revision" }], error: null };
        if (!state.task) return { data: [{ result: "unattached", request_id: state.boundRequest }], error: null };
        return {
          data: [{
            result: state.task === args.p_task_id ? "verified" : "other_task",
            request_id: state.boundRequest,
            generation_id: state.generation,
            bound_task_id: state.task,
          }],
          error: null,
        };
      }
      return { data: null, error: { message: `unexpected rpc ${fn}` } };
    },
  };
}

Deno.test("identity is reserved before submission; a second generation cannot take the request", async () => {
  const db = identityDb({ boundRequest: "req-1" });
  const first = await reserveRevisionGeneration(db as never, "lead", "L1", "req-1", "gen-1");
  assertEquals(first.result, "reserved");
  const second = await reserveRevisionGeneration(db as never, "lead", "L1", "req-1", "gen-2");
  assertEquals(second.result, "other_generation");
  assertEquals(second.generationId, "gen-1");
});

Deno.test("a task belonging to another request/generation is refused, never adopted", async () => {
  const db = identityDb({ boundRequest: "req-1", generation: "gen-1" });
  assertEquals(await attachRevisionTask(db as never, "lead", "L1", { requestId: "req-OLD", generationId: "gen-1", taskId: "t1" }), "identity_mismatch");
  assertEquals(await attachRevisionTask(db as never, "lead", "L1", { requestId: "req-1", generationId: "gen-OLD", taskId: "t1" }), "identity_mismatch");
  assertEquals(await attachRevisionTask(db as never, "lead", "L1", { requestId: "req-1", generationId: "gen-1", taskId: "t1" }), "attached");
  // Idempotent for the same task, refused for a different one.
  assertEquals(await attachRevisionTask(db as never, "lead", "L1", { requestId: "req-1", generationId: "gen-1", taskId: "t1" }), "attached");
  assertEquals(await attachRevisionTask(db as never, "lead", "L1", { requestId: "req-1", generationId: "gen-1", taskId: "t2" }), "other_task");
});

Deno.test("the callback VERIFIES and never claims: unattached is not permission to finalise", async () => {
  const db = identityDb({ boundRequest: "req-1", generation: "gen-1", task: null });
  const unattached = await verifyRevisionTask(db as never, "lead", "L1", "t1");
  assertEquals(unattached.result, "unattached");
  assertEquals(db.state.task, null, "verification must not write a binding");
});

Deno.test("a delayed OLD callback crossing a new acceptance is rejected on both paths", async () => {
  for (const entityType of ["lead", "order"] as const) {
    const db = identityDb({ boundRequest: "req-2", generation: "gen-2", task: "task-new" });
    const old = await verifyRevisionTask(db as never, entityType, "E1", "task-old");
    assertEquals(old.result, "other_task");
    assertEquals(old.boundTaskId, "task-new");
  }
});

Deno.test("a verification error is never treated as verified", async () => {
  const db = identityDb({ boundRequest: "req-1", error: "connection reset" });
  const res = await verifyRevisionTask(db as never, "order", "O1", "t1");
  assertEquals(res.result, "error");
  assertEquals(res.error, "connection reset");
});

Deno.test("final writes are fenced on task AND the bound request/generation", () => {
  assertEquals(revisionFinalWriteFence({ taskId: "t1", verification: null }), { automation_task_id: "t1" });
  assertEquals(
    revisionFinalWriteFence({
      taskId: "t1",
      verification: { result: "verified", requestId: "req-1", generationId: "gen-1", boundTaskId: "t1", error: null },
    }),
    {
      automation_task_id: "t1",
      bound_revision_request_id: "req-1",
      bound_revision_generation_id: "gen-1",
    },
  );
});

Deno.test("a zero-row final write stops everything downstream", () => {
  assertEquals(stopDownstream([]), true);
  assertEquals(stopDownstream(null), true);
  assertEquals(stopDownstream(undefined), true);
  assertEquals(stopDownstream([{ length: 1 }] as never), false);
});

Deno.test("rollout quiescence pauses new change requests truthfully and reversibly", () => {
  for (const on of ["1", "true", "yes", "on", "TRUE"]) {
    const gate = revisionSubmissionGate(on);
    assertEquals(gate.paused, true);
    assert(gate.message.includes("free change is still available"));
    assert(!/migration|deploy|binding/i.test(gate.message), "customer copy must stay plain");
  }
  for (const off of [null, undefined, "", "0", "false", "off"]) {
    assertEquals(revisionSubmissionGate(off).paused, false);
  }
});
