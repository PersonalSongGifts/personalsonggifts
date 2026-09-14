import { describe, expect, it } from "vitest";
import {
  applyAudioStyleBrief,
  buildLyricsBriefBlock,
  isEmptyBrief,
  normalizeRevisionBrief,
  fetchBoundRevisionBrief,
  mustAbortForUnknownBrief,
  BRIEF_LIMITS,
} from "../../supabase/functions/_shared/revision-brief.ts";
import { leadPreviewSendReadiness } from "../../supabase/functions/_shared/revision-gates.ts";

// ---------------------------------------------------------------------------
// Revision brief propagation (customer notes actually reaching generation)
// ---------------------------------------------------------------------------

describe("revision brief", () => {
  it("sanitizes, bounds and strips links", () => {
    const brief = normalizeRevisionBrief({
      style_notes: "make it softer\nsee https://evil.test/x",
      tempo: "slow",
      anything_else: "y".repeat(900),
    });
    expect(brief.style_notes).toBe("make it softer see");
    expect(brief.tempo).toBe("slow");
    expect(brief.anything_else!.length).toBe(BRIEF_LIMITS.anything_else);
  });

  it("treats blank/missing fields as an empty brief that adds nothing", () => {
    const brief = normalizeRevisionBrief({ style_notes: "   ", tempo: null });
    expect(isEmptyBrief(brief)).toBe(true);
    expect(buildLyricsBriefBlock(brief)).toBe("");
    expect(applyAudioStyleBrief("pop ballad", brief, 1000)).toEqual({ style: "pop ballad", dropped: [] });
  });

  it("sends style/tempo/anything_else to the lyrics stage without promising melody retention", () => {
    const block = buildLyricsBriefBlock(
      normalizeRevisionBrief({ style_notes: "warmer piano", tempo: "slower", anything_else: "say Di-on" }),
    );
    expect(block).toContain("warmer piano");
    expect(block).toContain("slower");
    expect(block).toContain("Di-on");
    expect(block).toContain("brand-new recording");
  });

  it("respects the provider's TOTAL style budget and reports anything that did not fit", () => {
    const brief = normalizeRevisionBrief({ tempo: "slower", style_notes: "s".repeat(400) });
    const res = applyAudioStyleBrief("pop ballad", brief, 200);
    expect(res.style.length).toBeLessThanOrEqual(200);
    expect(res.style).toContain("tempo: slower");
    // The long free-text note cannot fit and is REPORTED, not silently truncated.
    expect(res.dropped).toEqual(["style_notes"]);

    const roomy = applyAudioStyleBrief("pop ballad", brief, 1000);
    expect(roomy.dropped).toEqual([]);
    expect(roomy.style.length).toBeLessThanOrEqual(1000);
  });

  it("reads ONLY the approved request bound to the right entity column", async () => {
    const calls: Record<string, unknown> = {};
    const db = {
      from: () => ({
        select: () => ({
          eq: (col: string, val: unknown) => {
            calls.col = col;
            calls.val = val;
            return {
              eq: (statusCol: string, statusVal: unknown) => {
                calls.statusCol = statusCol;
                calls.statusVal = statusVal;
                return {
                  order: () => ({
                    limit: async () => ({ data: [{ id: "r9", tempo: "upbeat" }], error: null }),
                  }),
                };
              },
            };
          },
        }),
      }),
    };
    const leadBrief = await fetchBoundRevisionBrief(db as never, "lead", "L1");
    expect(calls.col).toBe("lead_id");
    expect([calls.statusCol, calls.statusVal]).toEqual(["status", "approved"]);
    expect(leadBrief.ok).toBe(true);
    expect(leadBrief.revisionRequestId).toBe("r9");
    expect(leadBrief.brief.tempo).toBe("upbeat");

    await fetchBoundRevisionBrief(db as never, "order", "O1");
    expect(calls.col).toBe("order_id");
  });

  it("fails CLOSED when the lookup breaks and a revision is in flight", async () => {
    const thrower = { from: () => { throw new Error("db down"); } };
    const res = await fetchBoundRevisionBrief(thrower as never, "lead", "L1");
    expect(res.ok).toBe(false);
    expect(res.error).toBe("db down");
    expect(mustAbortForUnknownBrief(res, { revision_status: "processing" })).toBe(true);
    // No open revision: a missing brief is genuinely "no brief", generation may run.
    expect(mustAbortForUnknownBrief(res, { revision_status: null })).toBe(false);
  });

  it("reports a returned DB error instead of pretending there is no brief", async () => {
    const db = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({ order: () => ({ limit: async () => ({ data: null, error: { message: "permission denied" } }) }) }),
          }),
        }),
      }),
    };
    const res = await fetchBoundRevisionBrief(db as never, "lead", "L1");
    expect(res).toEqual({ ok: false, brief: { style_notes: null, tempo: null, anything_else: null }, revisionRequestId: null, error: "permission denied" });
  });
});

// ---------------------------------------------------------------------------
// Explicit send readiness (replaces the ambiguous "manual hold")
// ---------------------------------------------------------------------------

const readyLead = {
  automation_status: "completed",
  preview_song_url: "p.mp3",
  full_song_url: "f.mp3",
  preview_token: "tok",
  preview_sent_at: null,
  status: "song_ready",
  next_attempt_at: null,
};

describe("leadPreviewSendReadiness", () => {
  it("releases a finished revised preview", () => {
    expect(leadPreviewSendReadiness(readyLead)).toEqual({ ready: true, reason: null });
  });

  it("blocks an in-flight regeneration", () => {
    expect(leadPreviewSendReadiness({ ...readyLead, automation_status: "audio_generating", preview_song_url: null }).reason)
      .toBe("generation_incomplete");
  });

  it("still releases a record whose revision_status was left at processing by old code", () => {
    // The stuck-flag cohort: audio finished, revision_status never updated.
    expect(leadPreviewSendReadiness({ ...readyLead, revision_status: "processing" } as Parameters<typeof leadPreviewSendReadiness>[0]).ready).toBe(true);
  });

  it("respects the incident cohort hold without any global pause", () => {
    const r = leadPreviewSendReadiness({ ...readyLead, next_attempt_at: "2027-01-01T00:00:00Z" }, Date.parse("2026-09-14T00:00:00Z"));
    expect(r).toEqual({ ready: false, reason: "held" });
  });

  it("ignores a hold that has already elapsed", () => {
    expect(leadPreviewSendReadiness({ ...readyLead, next_attempt_at: "2026-01-01T00:00:00Z" }, Date.parse("2026-09-14T00:00:00Z")).ready).toBe(true);
  });

  it("never re-sends, never mails converted or dismissed leads", () => {
    expect(leadPreviewSendReadiness({ ...readyLead, preview_sent_at: "2026-09-01T00:00:00Z" }).reason).toBe("already_sent");
    expect(leadPreviewSendReadiness({ ...readyLead, status: "converted" }).reason).toBe("converted");
    expect(leadPreviewSendReadiness({ ...readyLead, dismissed_at: "2026-09-01T00:00:00Z" }).reason).toBe("dismissed");
  });

  it("requires every asset the email links to", () => {
    expect(leadPreviewSendReadiness({ ...readyLead, full_song_url: null }).reason).toBe("missing_full_audio");
    expect(leadPreviewSendReadiness({ ...readyLead, preview_token: null }).reason).toBe("missing_preview_token");
  });
});

// ---------------------------------------------------------------------------
// Claim-before-send semantics, exercised against a mock table that enforces the
// same conditional-update rules Postgres does.
// ---------------------------------------------------------------------------

interface Row { id: string; preview_sent_at: string | null; status: string; sent_at: string | null; revision_status?: string | null; revision_count?: number | null }

function mockTable(rows: Row[]) {
  return {
    rows,
    /** UPDATE ... WHERE id = ? AND preview_sent_at IS NULL RETURNING id */
    claim(id: string, now: string) {
      const row = rows.find((r) => r.id === id && r.preview_sent_at === null);
      if (!row) return [];
      row.preview_sent_at = now;
      row.sent_at = now;
      row.status = "preview_sent";
      return [{ id }];
    },
    release(id: string, prev: { status: string; sent_at: string | null }) {
      const row = rows.find((r) => r.id === id)!;
      row.preview_sent_at = null;
      row.status = prev.status;
      row.sent_at = prev.sent_at;
    },
  };
}

describe("preview send claim", () => {
  it("lets exactly one of two concurrent scheduler passes send", () => {
    const t = mockTable([{ id: "L1", preview_sent_at: null, status: "song_ready", sent_at: null }]);
    const a = t.claim("L1", "t1");
    const b = t.claim("L1", "t1");
    expect(a.length).toBe(1);
    expect(b.length).toBe(0);
  });

  it("rolls the claim back on a failed send so no false sent timestamp remains", () => {
    const t = mockTable([{ id: "L1", preview_sent_at: null, status: "song_ready", sent_at: "2026-04-01T00:00:00Z" }]);
    t.claim("L1", "t1");
    t.release("L1", { status: "song_ready", sent_at: "2026-04-01T00:00:00Z" });
    expect(t.rows[0].preview_sent_at).toBeNull();
    expect(t.rows[0].sent_at).toBe("2026-04-01T00:00:00Z");
    // …and the retry then succeeds exactly once
    expect(t.claim("L1", "t2").length).toBe(1);
    expect(t.claim("L1", "t2").length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Allowance reservation: WHERE revision_count = <read value> AND status <> processing
// ---------------------------------------------------------------------------

function reserve(rows: Row[], id: string, expectedCount: number | null) {
  const row = rows.find(
    (r) => r.id === id && r.revision_status !== "processing" && (r.revision_count ?? null) === expectedCount,
  );
  if (!row) return [];
  row.revision_status = "processing";
  row.revision_count = (expectedCount ?? 0) + 1;
  return [{ id }];
}

describe("revision allowance reservation", () => {
  it("only one simultaneous submission consumes the allowance", () => {
    const rows: Row[] = [{ id: "L1", preview_sent_at: null, status: "lead", sent_at: null, revision_status: "completed", revision_count: 0 }];
    expect(reserve(rows, "L1", 0).length).toBe(1);
    expect(reserve(rows, "L1", 0).length).toBe(0);
    expect(rows[0].revision_count).toBe(1);
  });

  it("refuses while a revision is already processing", () => {
    const rows: Row[] = [{ id: "L1", preview_sent_at: null, status: "lead", sent_at: null, revision_status: "processing", revision_count: 1 }];
    expect(reserve(rows, "L1", 1).length).toBe(0);
  });
});
