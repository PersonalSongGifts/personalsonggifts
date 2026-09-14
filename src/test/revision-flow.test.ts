import { describe, expect, it } from "vitest";
import {
  buildAudioStyleSuffix,
  buildLyricsBriefBlock,
  isEmptyBrief,
  normalizeRevisionBrief,
  fetchLatestRevisionBrief,
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
    expect(buildAudioStyleSuffix(brief)).toBe("");
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

  it("sends tempo and style to the audio stage, bounded for the provider style field", () => {
    const suffix = buildAudioStyleSuffix(
      normalizeRevisionBrief({ tempo: "slower", style_notes: "s".repeat(400) }),
    );
    expect(suffix.startsWith(". tempo: slower.")).toBe(true);
    expect(suffix.length).toBeLessThanOrEqual(BRIEF_LIMITS.audio_style_suffix);
  });

  it("reads the latest approved/pending request for the right entity column", async () => {
    const calls: Record<string, unknown> = {};
    const db = {
      from: () => ({
        select: () => ({
          eq: (col: string, val: unknown) => {
            calls.col = col;
            calls.val = val;
            return {
              in: (_c: string, vals: string[]) => {
                calls.statuses = vals;
                return {
                  order: () => ({
                    limit: () => ({
                      maybeSingle: async () => ({ data: { tempo: "upbeat" } }),
                    }),
                  }),
                };
              },
            };
          },
        }),
      }),
    };
    const leadBrief = await fetchLatestRevisionBrief(db as never, "lead", "L1");
    expect(calls.col).toBe("lead_id");
    expect(calls.statuses).toEqual(["approved", "pending"]);
    expect(leadBrief.tempo).toBe("upbeat");

    await fetchLatestRevisionBrief(db as never, "order", "O1");
    expect(calls.col).toBe("order_id");
  });

  it("never throws when the lookup fails — generation must continue", async () => {
    const db = { from: () => { throw new Error("db down"); } };
    await expect(fetchLatestRevisionBrief(db as never, "lead", "L1")).resolves.toEqual({
      style_notes: null, tempo: null, anything_else: null,
    });
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
