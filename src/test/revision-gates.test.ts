import { describe, expect, it } from "vitest";
import {
  buildPrevSlotPatch,
  hasRevisionRemaining,
  isRevisionInFlight,
  isStaleConditionalWrite,
  revisionAllowanceRemaining,
  shouldHoldLeadFulfillment,
} from "../../supabase/functions/_shared/revision-gates.ts";

describe("revision allowance", () => {
  it("treats an explicit allowance of zero as zero (no || 1 fallback)", () => {
    expect(revisionAllowanceRemaining(0, 0)).toBe(0);
    expect(hasRevisionRemaining(0, 0)).toBe(false);
  });
  it("defaults a missing allowance to one", () => {
    expect(revisionAllowanceRemaining(0, null)).toBe(1);
    expect(hasRevisionRemaining(1, undefined)).toBe(false);
  });
  it("never goes negative", () => {
    expect(revisionAllowanceRemaining(5, 1)).toBe(0);
  });
});

describe("in-flight detection", () => {
  it("flags processing and pending, case-insensitively", () => {
    expect(isRevisionInFlight("processing")).toBe(true);
    expect(isRevisionInFlight("Pending")).toBe(true);
  });
  it("does not flag settled or absent states", () => {
    for (const s of [null, undefined, "", "completed", "approved", "rejected"]) {
      expect(isRevisionInFlight(s as string | null)).toBe(false);
    }
  });
});

describe("payment during revision", () => {
  const ready = { revision_status: null, preview_song_url: "p", full_song_url: "f" };
  it("holds fulfilment while a revision is in flight", () => {
    expect(shouldHoldLeadFulfillment({ ...ready, revision_status: "processing" })).toEqual({
      hold: true,
      reason: "revision_in_progress",
    });
  });
  it("holds fulfilment when the current asset is missing", () => {
    expect(shouldHoldLeadFulfillment({ ...ready, preview_song_url: null }).hold).toBe(true);
    expect(shouldHoldLeadFulfillment({ ...ready, full_song_url: null }).reason).toBe("no_usable_current_asset");
  });
  it("delivers normally when the current song is intact", () => {
    expect(shouldHoldLeadFulfillment(ready)).toEqual({ hold: false, reason: null });
  });
});

describe("stale callback writes", () => {
  it("treats a zero-row conditional write as stale", () => {
    expect(isStaleConditionalWrite([])).toBe(true);
    expect(isStaleConditionalWrite(null)).toBe(true);
    expect(isStaleConditionalWrite(undefined)).toBe(true);
  });
  it("accepts a write that matched the current task", () => {
    expect(isStaleConditionalWrite([{ id: "x" }])).toBe(false);
  });
});

describe("prev_* single-slot backup", () => {
  it("backs up the current preview when one exists", () => {
    expect(buildPrevSlotPatch({ preview_song_url: "p", automation_lyrics: "l", cover_image_url: "c" })).toEqual({
      prev_song_url: "p",
      prev_automation_lyrics: "l",
      prev_cover_image_url: "c",
    });
  });
  it("leaves prev_* untouched on an already-broken row", () => {
    expect(buildPrevSlotPatch({ preview_song_url: null, automation_lyrics: "l" })).toEqual({});
  });
});
