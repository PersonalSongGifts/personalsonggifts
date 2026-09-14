// Pure decision helpers for the revision lifecycle. Kept side-effect free so they can be
// unit-tested without any network, database or provider access.

export function revisionAllowanceRemaining(
  revisionCount: number | null | undefined,
  maxRevisions: number | null | undefined,
): number {
  const used = revisionCount ?? 0;
  // ?? not || — an explicit allowance of 0 must stay 0 (|| 1 silently granted a revision).
  const allowed = maxRevisions ?? 1;
  return Math.max(0, allowed - used);
}

export function hasRevisionRemaining(
  revisionCount: number | null | undefined,
  maxRevisions: number | null | undefined,
): boolean {
  return revisionAllowanceRemaining(revisionCount, maxRevisions) > 0;
}

export function isRevisionInFlight(revisionStatus: string | null | undefined): boolean {
  const s = String(revisionStatus ?? "").toLowerCase();
  return s === "processing" || s === "pending";
}

/** Payment is always kept; this decides only whether fulfilment must be held back. */
export function shouldHoldLeadFulfillment(lead: {
  revision_status?: string | null;
  preview_song_url?: string | null;
  full_song_url?: string | null;
}): { hold: boolean; reason: string | null } {
  if (isRevisionInFlight(lead.revision_status)) {
    return { hold: true, reason: "revision_in_progress" };
  }
  if (!lead.full_song_url || !lead.preview_song_url) {
    return { hold: true, reason: "no_usable_current_asset" };
  }
  return { hold: false, reason: null };
}

/**
 * A conditional final write (`.eq(id).eq(task_id)`) that touches zero rows means the
 * callback belongs to a superseded task: nothing was written, so all downstream side
 * effects (emails, scheduling, delivery) must be suppressed.
 */
export function isStaleConditionalWrite(rows: unknown[] | null | undefined): boolean {
  return !rows || rows.length === 0;
}

/**
 * prev_* is a single backup slot. Only overwrite it when there is a current asset worth
 * saving — on an already-broken row the existing prev_* values are the last good copy.
 */
export function buildPrevSlotPatch(lead: {
  preview_song_url?: string | null;
  automation_lyrics?: string | null;
  cover_image_url?: string | null;
}): Record<string, string | null> {
  if (!lead.preview_song_url) return {};
  return {
    prev_song_url: lead.preview_song_url,
    prev_automation_lyrics: lead.automation_lyrics || null,
    prev_cover_image_url: lead.cover_image_url || null,
  };
}
