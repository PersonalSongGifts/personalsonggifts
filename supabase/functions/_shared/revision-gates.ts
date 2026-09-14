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

/**
 * The "already sent" callback guard must not strand an accepted revision.
 *
 * For leads, `sent_at` holds the ORIGINAL preview send timestamp and never clears, so the
 * plain guard silently dropped the completion callback of every lead revision. Finalization
 * is allowed only when ALL of these hold:
 *   - it is a lead (orders keep the original guard untouched),
 *   - a revision is genuinely in flight (processing/pending),
 *   - the CURRENT deliverable (preview_song_url) is missing, i.e. nothing can be overwritten.
 * Emails are unaffected: a revised preview is never auto-scheduled.
 */
export function shouldAllowRevisionFinalization(
  entityType: "lead" | "order",
  entity: {
    revision_status?: string | null;
    preview_song_url?: string | null;
    preview_sent_at?: string | null;
  },
): boolean {
  if (entityType !== "lead") return false;
  if (!isRevisionInFlight(entity.revision_status)) return false;
  if (entity.preview_song_url) return false;
  return true;
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

export type TriggerPreflight =
  | { action: "proceed"; classification: "fresh" | "revision_repair" }
  | { action: "refuse"; classification: "terminal_current_audio"; reason: string };

/**
 * Decided BEFORE any status mutation, so a refusal never resets the record's retry
 * history or parks it in "pending" for the recovery loop to churn on.
 *
 * - terminal_current_audio: the record already has its CURRENT deliverable audio and no
 *   revision is in flight — regenerating is not allowed and retrying is pointless. Refuse.
 *   (Refusing is not the same as declaring the record complete; the caller records a
 *   review state and leaves the existing status/asset facts alone.)
 * - revision_repair: an accepted/processing revision whose current preview is missing while
 *   a stale full song lingers — this MUST be allowed to regenerate.
 */
export function classifyTriggerPreflight(
  entityType: "lead" | "order",
  entity: {
    revision_status?: string | null;
    preview_song_url?: string | null;
    full_song_url?: string | null;
    song_url?: string | null;
  },
  opts: { forceRun?: boolean; skipLyrics?: boolean } = {},
): TriggerPreflight {
  if (opts.forceRun || opts.skipLyrics) return { action: "proceed", classification: "fresh" };

  const revisionInFlight = isRevisionInFlight(entity.revision_status);

  if (entityType === "lead") {
    if (revisionInFlight) {
      return entity.preview_song_url
        ? {
          action: "refuse",
          classification: "terminal_current_audio",
          reason: "Revision in flight but the current preview already exists — nothing to regenerate",
        }
        : { action: "proceed", classification: "revision_repair" };
    }
    if (entity.preview_song_url) {
      return {
        action: "refuse",
        classification: "terminal_current_audio",
        reason: "Lead already has its current preview audio and no revision is in flight",
      };
    }
    return { action: "proceed", classification: "fresh" };
  }

  // Orders: the current deliverable is song_url.
  if (revisionInFlight) {
    return entity.song_url
      ? {
        action: "refuse",
        classification: "terminal_current_audio",
        reason: "Revision in flight but the current song already exists — nothing to regenerate",
      }
      : { action: "proceed", classification: "revision_repair" };
  }
  if (entity.song_url) {
    return {
      action: "refuse",
      classification: "terminal_current_audio",
      reason: "Order already has its current song and no revision is in flight",
    };
  }
  return { action: "proceed", classification: "fresh" };
}
