// Tests that execute the PRODUCTION orchestration functions with injected
// dependencies. Run with:
//   deno test --allow-net supabase/functions/_shared/revision-orchestration_test.ts
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { submitRevisionRequest, deliverLeadPreview, purchaseGuard } from "./revision-orchestration.ts";
import { fetchBoundBriefForGeneration, mergeSenderContext, mustAbortForUnboundBrief, revisionInFlight } from "./revision-binding.ts";
import { buildPronunciationBlock, parsePronunciation, safeDisplayName } from "./pronunciation.ts";
import { buildVersionView } from "./previous-version.ts";
import { classifySendOutcome, customerFacingSendStatus, shouldAutoRetry } from "./email-outbox.ts";

// --------------------------------------------------------------------------
// Fake database that models the ATOMIC rpc semantics of the migration.
// --------------------------------------------------------------------------
function makeDb(state: {
  revision_status?: string | null;
  revision_count?: number | null;
  max_revisions?: number | null;
  order_id?: string | null;
  status?: string;
  rpcError?: string | null;
}) {
  const rows: Record<string, { state: string; attempt_count: number; max_attempts: number }> = {};
  const calls: string[] = [];
  const db = {
    state,
    outbox: rows,
    calls,
    rpc: async (fn: string, args: Record<string, unknown>) => {
      calls.push(fn);
      if (state.rpcError) return { data: null, error: { message: state.rpcError } };

      if (fn === "claim_revision_binding") {
        if (state.order_id || state.status === "converted") {
          return { data: [{ result: "purchased", bound_request_id: null, revision_count: state.revision_count ?? 0 }], error: null };
        }
        const s = String(state.revision_status ?? "").toLowerCase();
        if (s === "processing" || s === "pending") {
          return { data: [{ result: "already_bound", bound_request_id: "existing", revision_count: state.revision_count ?? 0 }], error: null };
        }
        if ((state.revision_count ?? 0) >= (state.max_revisions ?? 1)) {
          return { data: [{ result: "no_allowance", bound_request_id: null, revision_count: state.revision_count ?? 0 }], error: null };
        }
        // Atomic: the record flips to processing inside the same call.
        state.revision_status = "processing";
        state.revision_count = (state.revision_count ?? 0) + 1;
        return { data: [{ result: "claimed", bound_request_id: args.p_request_id, revision_count: state.revision_count }], error: null };
      }

      if (fn === "claim_email_send") {
        const key = String(args.p_idempotency_key);
        const existing = rows[key];
        if (!existing) {
          rows[key] = { state: "claimed", attempt_count: 1, max_attempts: Number(args.p_max_attempts ?? 3) };
          return { data: [{ outbox_id: key, state: "claimed", attempt_count: 1, claimed: true }], error: null };
        }
        if (existing.state === "failed" && existing.attempt_count < existing.max_attempts) {
          existing.state = "claimed";
          existing.attempt_count += 1;
          return { data: [{ outbox_id: key, state: "claimed", attempt_count: existing.attempt_count, claimed: true }], error: null };
        }
        return { data: [{ outbox_id: key, state: existing.state, attempt_count: existing.attempt_count, claimed: false }], error: null };
      }

      if (fn === "settle_email_send") {
        const row = rows[String(args.p_outbox_id)];
        if (row && row.state === "claimed") row.state = String(args.p_state);
        return { data: null, error: null };
      }

      return { data: null, error: { message: `unexpected rpc ${fn}` } };
    },
  };
  return db;
}

function submitDeps(db: ReturnType<typeof makeDb>, overrides: Partial<{
  insertId: string | null;
  triggerStarted: boolean;
  triggerError: string | null;
}> = {}) {
  const log: string[] = [];
  return {
    log,
    deps: {
      db,
      insertRequest: async () => ({ id: overrides.insertId === undefined ? "req-1" : overrides.insertId, error: null }),
      rejectRequest: async (id: string, reason: string) => { log.push(`reject:${id}:${reason}`); },
      recordAttentionState: async (reason: string) => { log.push(`attention:${reason}`); },
      triggerGeneration: async () => ({
        started: overrides.triggerStarted ?? true,
        error: overrides.triggerError ?? null,
      }),
    },
  };
}

const baseInput = {
  entityType: "lead" as const,
  entityId: "L1",
  expectedRevisionCount: 0,
  fieldsChanged: ["recipient_name_pronunciation"],
  requestRow: { lead_id: "L1" },
};

// --------------------------------------------------------------------------
// Submission: no-op, races, allowance, purchase in flight, failure states
// --------------------------------------------------------------------------

Deno.test("no-op request consumes no allowance and destroys nothing", async () => {
  const db = makeDb({ revision_count: 0 });
  const { deps } = submitDeps(db);
  const res = await submitRevisionRequest(deps, { ...baseInput, fieldsChanged: [] });
  assertEquals(res.status, 400);
  assertEquals(res.body.error, "no_changes");
  assertEquals(db.calls.length, 0); // nothing was claimed
  assertEquals(db.state.revision_count, 0);
});

Deno.test("no-op on the PAID order path behaves identically", async () => {
  const db = makeDb({ revision_count: 0 });
  const { deps } = submitDeps(db);
  const res = await submitRevisionRequest(deps, { ...baseInput, entityType: "order", entityId: "O1", fieldsChanged: [] });
  assertEquals(res.status, 400);
  assertEquals(db.calls.length, 0);
});

Deno.test("first-time requester with NULL revision_status is accepted (not treated as concurrent)", async () => {
  const db = makeDb({ revision_status: null, revision_count: null });
  const { deps } = submitDeps(db);
  const res = await submitRevisionRequest(deps, { ...baseInput, expectedRevisionCount: null });
  assertEquals(res.status, 200);
  assertEquals(res.claim?.result, "claimed");
  assertEquals(res.claim?.boundRequestId, "req-1");
});

Deno.test("duplicate simultaneous submissions: exactly one wins, the loser consumes nothing", async () => {
  const db = makeDb({ revision_status: null, revision_count: 0 });
  const a = submitDeps(db);
  const b = submitDeps(db);
  const [first, second] = await Promise.all([
    submitRevisionRequest(a.deps, baseInput),
    submitRevisionRequest(b.deps, baseInput),
  ]);
  const results = [first.status, second.status].sort();
  assertEquals(results, [200, 409]);
  assertEquals(db.state.revision_count, 1); // allowance consumed exactly once
  const loser = first.status === 409 ? a.log : b.log;
  assert(loser.some((l) => l.startsWith("reject:req-1:claim result: already_bound")));
});

Deno.test("zero allowance is refused, and explicit zero is not treated as missing", async () => {
  const db = makeDb({ revision_status: null, revision_count: 0, max_revisions: 0 });
  const { deps } = submitDeps(db);
  const res = await submitRevisionRequest(deps, baseInput);
  assertEquals(res.status, 409);
  assertEquals(res.body.error, "no_allowance");
});

Deno.test("purchase in flight keeps the payment and refuses the remake", async () => {
  const db = makeDb({ revision_status: null, revision_count: 0, order_id: "O9" });
  const { deps } = submitDeps(db);
  const res = await submitRevisionRequest(deps, baseInput);
  assertEquals(res.status, 409);
  assertEquals(res.body.error, "purchased");
});

Deno.test("crash BETWEEN writes cannot half-bind: a failed request insert stops everything", async () => {
  const db = makeDb({ revision_status: null, revision_count: 0 });
  const { deps } = submitDeps(db, { insertId: null });
  const res = await submitRevisionRequest(deps, baseInput);
  assertEquals(res.status, 500);
  assertEquals(db.calls.length, 0);
  assertEquals(db.state.revision_status, null);
});

Deno.test("claim RPC error fails closed with no allowance consumed", async () => {
  const db = makeDb({ revision_status: null, revision_count: 0, rpcError: "deadlock detected" });
  const { deps, log } = submitDeps(db);
  const res = await submitRevisionRequest(deps, baseInput);
  assertEquals(res.status, 500);
  assertEquals(res.claim?.result, "error");
  assertEquals(db.state.revision_count, 0);
  assert(log.some((l) => l.includes("deadlock detected")));
});

Deno.test("provider accepted-but-timeout on the trigger reports honestly, never 'started'", async () => {
  const db = makeDb({ revision_status: null, revision_count: 0 });
  const { deps, log } = submitDeps(db, { triggerStarted: false, triggerError: "fetch timeout" });
  const res = await submitRevisionRequest(deps, baseInput);
  assertEquals(res.status, 202);
  assertEquals(res.body.started, false);
  assert(log.some((l) => l.startsWith("attention:revision trigger did not start: fetch timeout")));
});

// --------------------------------------------------------------------------
// Bound brief: nulls, missing, wrong owner, wrong status, errors
// --------------------------------------------------------------------------

function briefDb(row: Record<string, unknown> | null, error: string | null = null) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: row, error: error ? { message: error } : null }) }),
      }),
    }),
  };
}

Deno.test("in-flight revision with NO bound request fails closed", async () => {
  const res = await fetchBoundBriefForGeneration(briefDb(null) as never, "lead", {
    id: "L1",
    revision_status: "processing",
    bound_revision_request_id: null,
  });
  assertEquals(res.ok, false);
  assertEquals(res.error, "revision in flight with no bound request");
});

Deno.test("no revision and no binding is genuinely 'no brief'", async () => {
  const res = await fetchBoundBriefForGeneration(briefDb(null) as never, "lead", { id: "L1", revision_status: null });
  assertEquals(res.ok, true);
  assertEquals(res.brief.tempo, null);
});

Deno.test("bound row that is missing, foreign or not approved fails closed", async () => {
  const missing = await fetchBoundBriefForGeneration(briefDb(null) as never, "lead", { id: "L1", revision_status: "processing", bound_revision_request_id: "r1" });
  assertEquals(missing.ok, false);

  const foreign = await fetchBoundBriefForGeneration(
    briefDb({ id: "r1", status: "approved", lead_id: "OTHER" }) as never,
    "lead",
    { id: "L1", revision_status: "processing", bound_revision_request_id: "r1" },
  );
  assertEquals(foreign.error, "bound revision request belongs to another record");

  const pending = await fetchBoundBriefForGeneration(
    briefDb({ id: "r1", status: "pending", lead_id: "L1" }) as never,
    "lead",
    { id: "L1", revision_status: "processing", bound_revision_request_id: "r1" },
  );
  assertEquals(pending.ok, false);
});

Deno.test("bound approved row is read by ID and normalized", async () => {
  const res = await fetchBoundBriefForGeneration(
    briefDb({ id: "r1", status: "approved", lead_id: "L1", tempo: "slower", style_notes: "warm  piano", anything_else: null }) as never,
    "lead",
    { id: "L1", revision_status: "processing", bound_revision_request_id: "r1" },
  );
  assertEquals(res.ok, true);
  assertEquals(res.revisionRequestId, "r1");
  assertEquals(res.brief.style_notes, "warm piano");
});

Deno.test("bound brief lookup DB error is reported, never downgraded to empty", async () => {
  const res = await fetchBoundBriefForGeneration(briefDb(null, "permission denied") as never, "order", {
    id: "O1",
    revision_status: "processing",
    bound_revision_request_id: "r1",
  });
  assertEquals(res, { ok: false, brief: { style_notes: null, tempo: null, anything_else: null }, revisionRequestId: "r1", error: "permission denied" });
});

Deno.test("lead sender_context from the request is merged, bounded, and never duplicated", () => {
  assertEquals(mergeSenderContext(null, "they met in 1979"), "From the sender: they met in 1979");
  assertEquals(mergeSenderContext("From the sender: they met in 1979", "they met in 1979"), "From the sender: they met in 1979");
  assertEquals(mergeSenderContext(null, "x".repeat(900))!.length, 600);
  assertEquals(mergeSenderContext("kept", null), "kept");
});

// --------------------------------------------------------------------------
// Pronunciation: typed, never becomes the sung/display name
// --------------------------------------------------------------------------

Deno.test("prose pronunciation is parsed into a typed hint, display spelling untouched", () => {
  const hint = parsePronunciation("Dionne", "Dionne, pronounced Di-on not Dee-ahn");
  assertEquals(hint.displayName, "Dionne");
  assertEquals(hint.phonetic, "Di-on");
  assertEquals(hint.parsedFromProse, true);

  const bare = parsePronunciation("Dionne", "Di-on");
  assertEquals(bare.phonetic, "Di-on");
  assertEquals(bare.parsedFromProse, false);

  const block = buildPronunciationBlock(hint);
  assert(block.includes('Write the name as "Dionne"'));
  assert(block.includes('pronounced "Di-on"'));
  assertEquals(safeDisplayName("Dionne", "Di-on"), "Dionne");
  assertEquals(buildPronunciationBlock(parsePronunciation("Dionne", "   ")), "");
});

// --------------------------------------------------------------------------
// Previous version + purchase guard
// --------------------------------------------------------------------------

Deno.test("old preview stays playable as PREVIOUS while the remake runs, and purchase is blocked", () => {
  const view = buildVersionView({
    preview_song_url: "old.mp3",
    revision_status: "processing",
    revision_requested_at: "2026-09-08T16:48:00Z",
    generated_at: "2026-04-01T00:00:00Z",
  });
  assertEquals(view.previousPreviewUrl, "old.mp3");
  assertEquals(view.currentPreviewUrl, null);
  assertEquals(view.canPurchase, false);
  assertEquals(view.purchaseBlockReason, "revision_in_flight");
  assert(view.previousLabel!.startsWith("Previous version"));
});

Deno.test("purchase reopens once the generation is bound to the accepted revision", () => {
  const record = {
    preview_song_url: "new.mp3",
    revision_status: "processing",
    revision_requested_at: "2026-09-08T16:48:00Z",
    generated_at: "2026-09-14T19:03:42Z",
  };
  assertEquals(buildVersionView(record).currentPreviewUrl, "new.mp3");
  assertEquals(purchaseGuard(record), { ok: true, reason: null });
  assertEquals(purchaseGuard({ revision_status: null, preview_song_url: null }), { ok: false, reason: "no_current_song" });
});

// --------------------------------------------------------------------------
// Delivery: claim states, thrown send, retries, stale generation
// --------------------------------------------------------------------------

function deliverDeps(db: ReturnType<typeof makeDb>, record: Record<string, unknown> | null, sendOutcome: Parameters<typeof classifySendOutcome>[0]) {
  const notes: string[] = [];
  const marked: string[] = [];
  return {
    notes,
    marked,
    deps: {
      db,
      reloadRecord: async () => record,
      readiness: (r: Record<string, unknown>) =>
        r.preview_song_url ? { ready: true, reason: null } : { ready: false, reason: "generation_incomplete" },
      send: async () => sendOutcome,
      markAttempted: async (id: string, _providerMessageId: string | null, expectedGenerationKey: string | null) => {
        // Fenced: a stale generation key must never stamp "sent" on a newer row.
        const fenced = expectedGenerationKey === ((record?.generated_at as string | null) ?? null);
        if (fenced) marked.push(id);
        return { error: null, fenced };
      },
      note: async (_id: string, message: string) => { notes.push(message); },
    },
  };
}

const readyRecord = { id: "L1", preview_song_url: "p.mp3", generated_at: "2026-09-14T19:03:42Z" };

Deno.test("accepted send marks the attempt exactly once; a replay does not send again", async () => {
  const db = makeDb({});
  const first = deliverDeps(db, readyRecord, { kind: "response", ok: true, status: 200, providerMessageId: "m1" });
  assertEquals((await deliverLeadPreview(first.deps, "L1")).state, "accepted");
  assertEquals(first.marked, ["L1"]);

  const second = deliverDeps(db, readyRecord, { kind: "response", ok: true, status: 200 });
  const replay = await deliverLeadPreview(second.deps, "L1");
  assertEquals(replay.state, "not_claimed");
  assertEquals(second.marked.length, 0);
});

Deno.test("thrown send is AMBIGUOUS: never marked sent, never auto-resent", async () => {
  const db = makeDb({});
  const d = deliverDeps(db, readyRecord, { kind: "threw", message: "socket hang up" });
  const res = await deliverLeadPreview(d.deps, "L1");
  assertEquals(res.state, "ambiguous");
  assertEquals(d.marked.length, 0);
  assert(d.notes.some((n) => n.includes("outcome unknown")));

  // A later pass must not silently resend an ambiguous attempt.
  const again = deliverDeps(db, readyRecord, { kind: "response", ok: true, status: 200 });
  assertEquals((await deliverLeadPreview(again.deps, "L1")).state, "not_claimed");
  assertEquals(customerFacingSendStatus("ambiguous").includes("couldn't confirm"), true);
});

Deno.test("definite failure is retried within bounded attempts, then stops", async () => {
  const db = makeDb({});
  for (const expected of ["failed", "failed", "failed"]) {
    const d = deliverDeps(db, readyRecord, { kind: "response", ok: false, status: 500 });
    assertEquals((await deliverLeadPreview(d.deps, "L1")).state, expected);
  }
  const exhausted = deliverDeps(db, readyRecord, { kind: "response", ok: false, status: 500 });
  assertEquals((await deliverLeadPreview(exhausted.deps, "L1")).state, "not_claimed");
  assertEquals(shouldAutoRetry({ state: "failed", attempt_count: 3, max_attempts: 3 }), false);
  assertEquals(shouldAutoRetry({ state: "ambiguous", attempt_count: 1, max_attempts: 3 }), false);
});

Deno.test("a new generation gets its own idempotency key, so the revised preview can send", async () => {
  const db = makeDb({});
  const first = deliverDeps(db, readyRecord, { kind: "response", ok: true, status: 200 });
  await deliverLeadPreview(first.deps, "L1");
  const revised = deliverDeps(db, { ...readyRecord, generated_at: "2026-09-15T10:00:00Z" }, { kind: "response", ok: true, status: 200 });
  assertEquals((await deliverLeadPreview(revised.deps, "L1")).state, "accepted");
});

Deno.test("unready records and vanished records never claim or send", async () => {
  const db = makeDb({});
  const unready = deliverDeps(db, { id: "L1", preview_song_url: null }, { kind: "response", ok: true, status: 200 });
  assertEquals((await deliverLeadPreview(unready.deps, "L1")).reason, "generation_incomplete");
  const gone = deliverDeps(db, null, { kind: "response", ok: true, status: 200 });
  assertEquals((await deliverLeadPreview(gone.deps, "L1")).reason, "record_gone");
  assertEquals(Object.keys(db.outbox).length, 0);
});

Deno.test("a claim RPC failure means we do NOT send", async () => {
  const db = makeDb({ rpcError: "outbox unavailable" });
  const d = deliverDeps(db, readyRecord, { kind: "response", ok: true, status: 200 });
  const res = await deliverLeadPreview(d.deps, "L1");
  assertEquals(res.state, "not_claimed");
  assertEquals(res.reason, "outbox unavailable");
  assertEquals(d.marked.length, 0);
});

// --------------------------------------------------------------------------
// Regression: 'approved' MUST count as in flight. An approved-but-unbound
// record previously returned ok:true and was generated with no notes.
// --------------------------------------------------------------------------
Deno.test("revisionInFlight covers every open state, including 'approved'", () => {
  for (const state of ["processing", "pending", "approved", "in_progress", "APPROVED"]) {
    assertEquals(revisionInFlight(state), true, `expected ${state} to be in flight`);
  }
  for (const state of [null, undefined, "", "completed", "rejected", "cancelled"]) {
    assertEquals(revisionInFlight(state as string | null), false, `expected ${String(state)} to be settled`);
  }
});

Deno.test("approved revision with NO bound request id fails closed on both paths", async () => {
  for (const entityType of ["lead", "order"] as const) {
    const result = await fetchBoundBriefForGeneration(
      {
        from: () => ({
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
        }),
      } as never,
      entityType,
      { id: "e1", revision_status: "approved", bound_revision_request_id: null },
    );
    assertEquals(result.ok, false);
    assert(mustAbortForUnboundBrief(result));
    void entityType;
  }
});

Deno.test("markAttempted is fenced: a stale generation key never stamps 'sent'", async () => {
  const db = makeDb({});
  const staleRecord = { id: "L1", preview_song_url: "p.mp3", generated_at: "2026-09-14T19:03:42Z" };
  const f = deliverDeps(db, staleRecord, { kind: "response", ok: true, status: 201, providerMessageId: "m1" });
  // Simulate a newer generation landing between claim and stamp.
  const original = f.deps.markAttempted;
  f.deps.markAttempted = async (id: string, mid: string | null, _key: string | null) => original(id, mid, "different-generation");
  const out = await deliverLeadPreview(f.deps as never, "L1");
  // The provider accepted, so we do not pretend it failed — but nothing is
  // stamped on the row, and the mismatch is recorded honestly.
  assertEquals(out.state, "accepted");
  assertEquals(f.marked.length, 0);
  assert(f.notes.some((n) => n.includes("generation that has since changed")));
});
