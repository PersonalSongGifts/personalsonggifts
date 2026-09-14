// Previous version availability + purchase gating during a revision.
//
// Review blocker: the old preview was cleared on submission, so a customer had
// nothing to play while the remake ran, and checkout could still sell whichever
// assets happened to be on the row.
//
// Rules:
//  - the previous song stays playable, labelled explicitly as the PREVIOUS
//    version (never presented as the requested change);
//  - purchase is gated until the CURRENT accepted generation is ready, so nobody
//    can pay for the version they just asked us to change.

export interface VersionView {
  /** Playable now, if anything is. */
  currentPreviewUrl: string | null;
  previousPreviewUrl: string | null;
  previousLabel: string | null;
  /** True while the requested change is still being made. */
  revisionInFlight: boolean;
  canPurchase: boolean;
  purchaseBlockReason: "revision_in_flight" | "no_current_song" | null;
  customerNote: string | null;
}

export interface VersionRecord {
  preview_song_url?: string | null;
  full_song_url?: string | null;
  prev_song_url?: string | null;
  revision_status?: string | null;
  revision_requested_at?: string | null;
  generated_at?: string | null;
}

function inFlight(status: unknown): boolean {
  const s = String(status ?? "").toLowerCase();
  return s === "processing" || s === "pending";
}

/** True when the assets on the row were produced FOR the open revision. */
export function generationBoundToRevision(record: VersionRecord): boolean {
  if (!inFlight(record.revision_status)) return true;
  const requested = Date.parse(record.revision_requested_at ?? "");
  const generated = Date.parse(record.generated_at ?? "");
  if (!Number.isFinite(requested) || !Number.isFinite(generated)) return false;
  return generated > requested;
}

export function buildVersionView(record: VersionRecord): VersionView {
  const bound = generationBoundToRevision(record);
  const revising = inFlight(record.revision_status) && !bound;

  // While revising, whatever is on the row is the PREVIOUS song, not the remake.
  const previous = revising ? (record.preview_song_url ?? record.prev_song_url ?? null) : (record.prev_song_url ?? null);
  const current = revising ? null : (record.preview_song_url ?? null);

  let purchaseBlockReason: VersionView["purchaseBlockReason"] = null;
  if (revising) purchaseBlockReason = "revision_in_flight";
  else if (!current) purchaseBlockReason = "no_current_song";

  return {
    currentPreviewUrl: current,
    previousPreviewUrl: previous,
    previousLabel: previous ? "Previous version (before your change request)" : null,
    revisionInFlight: revising,
    canPurchase: purchaseBlockReason === null,
    purchaseBlockReason,
    customerNote: revising
      ? "We're making your new version now. You can still play the previous version below — the new one replaces it when it's ready."
      : null,
  };
}

/** Server-side guard used by checkout/payment paths. */
export function assertPurchasableVersion(record: VersionRecord): { ok: boolean; reason: string | null } {
  const view = buildVersionView(record);
  if (view.canPurchase) return { ok: true, reason: null };
  return { ok: false, reason: view.purchaseBlockReason };
}
