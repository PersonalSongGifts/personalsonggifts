import { describe, it, expect } from "vitest";
import { leadPreviewReadyForMarketing } from "../../supabase/functions/_shared/lead-followup";

const ready = {
  preview_song_url: "https://x/preview.mp3",
  full_song_url: "https://x/full.mp3",
  revision_status: null as string | null,
};

describe("leadPreviewReadyForMarketing", () => {
  it("allows a lead with both current assets and no revision in flight", () => {
    expect(leadPreviewReadyForMarketing(ready)).toBe(true);
  });

  it("allows a lead whose revision already completed", () => {
    expect(leadPreviewReadyForMarketing({ ...ready, revision_status: "completed" })).toBe(true);
  });

  it("blocks the exact incident shape: revision processing, preview cleared, old full song left behind", () => {
    expect(
      leadPreviewReadyForMarketing({
        preview_song_url: null,
        full_song_url: "https://x/C98BFC06-full.mp3",
        revision_status: "processing",
      }),
    ).toBe(false);
  });

  it("blocks a pending revision even when both files still exist", () => {
    expect(leadPreviewReadyForMarketing({ ...ready, revision_status: "pending" })).toBe(false);
  });

  it("is case-insensitive about the revision state", () => {
    expect(leadPreviewReadyForMarketing({ ...ready, revision_status: "PROCESSING" })).toBe(false);
  });

  it("blocks when the preview file is missing for any reason", () => {
    expect(leadPreviewReadyForMarketing({ ...ready, preview_song_url: null })).toBe(false);
  });

  it("blocks when the full song is missing", () => {
    expect(leadPreviewReadyForMarketing({ ...ready, full_song_url: null })).toBe(false);
  });

  it("blocks empty-string asset values", () => {
    expect(leadPreviewReadyForMarketing({ ...ready, preview_song_url: "" })).toBe(false);
  });

  it("blocks an entirely empty record", () => {
    expect(leadPreviewReadyForMarketing({})).toBe(false);
  });
});
