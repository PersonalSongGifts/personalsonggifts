import { describe, expect, it } from "vitest";
import {
  buildPrevSlotPatch,
  classifyTriggerPreflight,
  hasRevisionRemaining,
  shouldAllowRevisionFinalization,
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

describe("classifyTriggerPreflight", () => {
  it("refuses a lead that already has its current preview (terminal, no retry)", () => {
    const r = classifyTriggerPreflight("lead", { preview_song_url: "p.mp3", full_song_url: "f.mp3", revision_status: null });
    expect(r.action).toBe("refuse");
    expect(r.classification).toBe("terminal_current_audio");
  });

  it("allows an accepted revision whose preview is missing but stale full audio lingers", () => {
    const r = classifyTriggerPreflight("lead", { preview_song_url: null, full_song_url: "old-full.mp3", revision_status: "processing" });
    expect(r).toEqual({ action: "proceed", classification: "revision_repair" });
  });

  it("refuses when a revision is in flight but the current preview already exists", () => {
    const r = classifyTriggerPreflight("lead", { preview_song_url: "new.mp3", revision_status: "processing" });
    expect(r.action).toBe("refuse");
  });

  it("proceeds for a fresh lead with no audio at all", () => {
    expect(classifyTriggerPreflight("lead", {})).toEqual({ action: "proceed", classification: "fresh" });
  });

  it("refuses an order that already has its current song", () => {
    expect(classifyTriggerPreflight("order", { song_url: "s.mp3" }).action).toBe("refuse");
  });

  it("allows an order mid-revision with no current song", () => {
    expect(classifyTriggerPreflight("order", { song_url: null, revision_status: "processing" })).toEqual({
      action: "proceed",
      classification: "revision_repair",
    });
  });

  it("never refuses when force or skipLyrics is set", () => {
    expect(classifyTriggerPreflight("lead", { preview_song_url: "p.mp3" }, { forceRun: true }).action).toBe("proceed");
    expect(classifyTriggerPreflight("order", { song_url: "s.mp3" }, { skipLyrics: true }).action).toBe("proceed");
  });
});

describe("shouldAllowRevisionFinalization", () => {
  it("allows a lead mid-revision with no current preview even though it was sent before", () => {
    expect(shouldAllowRevisionFinalization("lead", {
      revision_status: "processing",
      preview_song_url: null,
      preview_sent_at: null,
    })).toBe(true);
  });

  it("blocks when the current preview already exists (nothing to finalize)", () => {
    expect(shouldAllowRevisionFinalization("lead", {
      revision_status: "processing",
      preview_song_url: "new-preview.mp3",
    })).toBe(false);
  });

  it("blocks when no revision is in flight", () => {
    expect(shouldAllowRevisionFinalization("lead", { revision_status: null, preview_song_url: null })).toBe(false);
    expect(shouldAllowRevisionFinalization("lead", { revision_status: "completed", preview_song_url: null })).toBe(false);
  });

  it("never changes order behaviour", () => {
    expect(shouldAllowRevisionFinalization("order", { revision_status: "processing", preview_song_url: null })).toBe(false);
  });

  it("also allows a pending revision awaiting repair", () => {
    expect(shouldAllowRevisionFinalization("lead", { revision_status: "pending", preview_song_url: null })).toBe(true);
  });
});
