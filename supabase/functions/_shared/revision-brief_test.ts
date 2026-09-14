// Deno tests for the production revision-brief module (imported directly — no
// re-implementation of the algorithm in the test).
import { assertEquals, assertStrictEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  applyAudioStyleBrief,
  fetchBoundRevisionBrief,
  mustAbortForUnknownBrief,
  normalizeRevisionBrief,
} from "./revision-brief.ts";
import { leadPreviewSendReadiness } from "./revision-gates.ts";

// Minimal PostgREST-shaped stub that records the filters production code applies.
function dbStub(opts: {
  rows?: Record<string, unknown>[];
  error?: { message: string } | null;
  throwOn?: boolean;
}) {
  const calls: Record<string, unknown>[] = [];
  const db = {
    from(table: string) {
      calls.push({ from: table });
      return {
        select(cols: string) {
          calls.push({ select: cols });
          return {
            eq(c1: string, v1: unknown) {
              calls.push({ eq: [c1, v1] });
              return {
                eq(c2: string, v2: unknown) {
                  calls.push({ eq: [c2, v2] });
                  return {
                    order(col: string, o: { ascending: boolean }) {
                      calls.push({ order: [col, o.ascending] });
                      return {
                        limit(n: number) {
                          calls.push({ limit: n });
                          if (opts.throwOn) return Promise.reject(new Error("connection reset"));
                          return Promise.resolve({ data: opts.rows ?? null, error: opts.error ?? null });
                        },
                      };
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  };
  return { db: db as never, calls };
}

Deno.test("brief lookup reads ONLY approved requests, bound to the entity", async () => {
  const { db, calls } = dbStub({ rows: [{ id: "r1", tempo: "slower", style_notes: "warmer" }] });
  const res = await fetchBoundRevisionBrief(db, "lead", "lead-1");
  assertEquals(res.ok, true);
  assertEquals(res.revisionRequestId, "r1");
  assertEquals(res.brief.tempo, "slower");
  const eqCalls = calls.filter((c) => "eq" in c).map((c) => c.eq);
  assertEquals(eqCalls, [["lead_id", "lead-1"], ["status", "approved"]]);
});

Deno.test("brief lookup on an order filters by order_id", async () => {
  const { db, calls } = dbStub({ rows: [] });
  await fetchBoundRevisionBrief(db, "order", "o-1");
  assertEquals((calls.filter((c) => "eq" in c)[0] as { eq: unknown[] }).eq[0], "order_id");
});

Deno.test("DB error is reported, never swallowed as an empty brief", async () => {
  const { db } = dbStub({ error: { message: "permission denied" } });
  const res = await fetchBoundRevisionBrief(db, "lead", "lead-1");
  assertEquals(res.ok, false);
  assertEquals(res.error, "permission denied");
});

Deno.test("thrown lookup is reported, never swallowed", async () => {
  const { db } = dbStub({ throwOn: true });
  const res = await fetchBoundRevisionBrief(db, "lead", "lead-1");
  assertEquals(res.ok, false);
  assertEquals(res.error, "connection reset");
});

Deno.test("unknown brief aborts generation for a record mid-revision, not for others", async () => {
  const failed = { ok: false as const, brief: normalizeRevisionBrief(null), revisionRequestId: null, error: "x" };
  assertStrictEquals(mustAbortForUnknownBrief(failed, { revision_status: "processing" }), true);
  assertStrictEquals(mustAbortForUnknownBrief(failed, { revision_status: "pending" }), true);
  assertStrictEquals(mustAbortForUnknownBrief(failed, { revision_status: null }), false);
  assertStrictEquals(
    mustAbortForUnknownBrief({ ...failed, ok: true }, { revision_status: "processing" }),
    false,
  );
});

Deno.test("brief text is sanitized and bounded", () => {
  const b = normalizeRevisionBrief({
    style_notes: `a`.repeat(900),
    tempo: " slower  please\nnow ",
    anything_else: "see https://evil.example/x please",
  });
  assertEquals(b.style_notes?.length, 500);
  assertEquals(b.tempo, "slower please now");
  assertEquals(b.anything_else, "see please");
});

Deno.test("style budget covers base + suffix and reports what did not fit", () => {
  const base = "x".repeat(170);
  const res = applyAudioStyleBrief(base, { tempo: "slower", style_notes: "warm strings", anything_else: null }, 200);
  // Tempo has priority and fits (185 chars); the free-text notes do not, and are
  // reported instead of being truncated mid-sentence.
  assertEquals(res.style, `${base}. tempo: slower`);
  assertEquals(res.dropped, ["style_notes"]);

  // Nothing fits at all: base is preserved, both parts reported.
  const tight = applyAudioStyleBrief("y".repeat(200), { tempo: "slower", style_notes: "warm", anything_else: null }, 200);
  assertEquals(tight.style.length, 200);
  assertEquals(tight.dropped, ["tempo", "style_notes"]);

  const roomy = applyAudioStyleBrief("pop ballad", { tempo: "slower", style_notes: "warm strings", anything_else: null }, 1000);
  assertEquals(roomy.dropped, []);
  assertEquals(roomy.style, "pop ballad. tempo: slower. warm strings");
});

Deno.test("readiness requires the generation to be bound to the open revision", () => {
  const base = {
    automation_status: "completed",
    preview_song_url: "p",
    full_song_url: "f",
    preview_token: "t",
    status: "song_ready",
  };
  // Old song + open revision: must NOT be sent.
  assertEquals(
    leadPreviewSendReadiness(
      { ...base, revision_status: "processing", revision_requested_at: "2026-09-08T00:00:00Z", generated_at: "2026-04-01T00:00:00Z" },
      Date.parse("2026-09-14T00:00:00Z"),
    ),
    { ready: false, reason: "revision_in_flight" },
  );
  // Missing generated_at during an open revision: not sendable.
  assertEquals(
    leadPreviewSendReadiness(
      { ...base, revision_status: "processing", revision_requested_at: "2026-09-08T00:00:00Z", generated_at: null },
      Date.parse("2026-09-14T00:00:00Z"),
    ).reason,
    "revision_in_flight",
  );
  // Generation newer than the request: bound, sendable.
  assertEquals(
    leadPreviewSendReadiness(
      { ...base, revision_status: "processing", revision_requested_at: "2026-09-08T00:00:00Z", generated_at: "2026-09-14T19:03:42Z" },
      Date.parse("2026-09-14T20:00:00Z"),
    ),
    { ready: true, reason: null },
  );
  // Incident cohort hold still wins.
  assertEquals(
    leadPreviewSendReadiness({ ...base, next_attempt_at: "2027-01-01T00:00:00Z" }, Date.parse("2026-09-14T20:00:00Z")).reason,
    "held",
  );
});
