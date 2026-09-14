// Durable, transactional binding between an accepted revision request and the
// generation that fulfils it.
//
// Why this exists (review blocker: "binding is still not transactional or
// immutable"): claim -> supersede -> approve used to be three separate writes,
// the supersede error was unchecked, and generation read "the latest approved
// request for this entity". A crash between writes, or two submissions racing,
// could leave either no approved row (generation spends money with no notes) or
// the wrong row bound.
//
// Now: ONE database call (`claim_revision_binding`, see
// docs/revision-hardening/001_revision_binding_and_email_outbox.sql.txt) locks
// the record, re-checks purchase/converted status and the revision allowance,
// supersedes any older approved request, approves this one and writes
// `bound_revision_request_id` — atomically. Generation reads the brief BY THAT
// ID only, and fails closed whenever the bound row is missing, mismatched, or
// unreadable.

import {
  EMPTY_BRIEF,
  normalizeRevisionBrief,
  type RevisionBrief,
  type RevisionBriefResult,
} from "./revision-brief.ts";

export type ClaimResult =
  | "claimed"
  | "not_eligible"
  | "no_allowance"
  | "purchased"
  | "already_bound"
  | "missing_request"
  | "error";

export interface ClaimOutcome {
  result: ClaimResult;
  boundRequestId: string | null;
  revisionCount: number | null;
  error: string | null;
}

interface RpcDb {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{
    data: unknown;
    error: { message: string } | null;
  }>;
}

/** HTTP status + customer-safe copy for every claim outcome (no silent paths). */
export const CLAIM_RESPONSES: Record<Exclude<ClaimResult, "claimed">, { status: number; message: string }> = {
  not_eligible: {
    status: 409,
    message: "This song isn't eligible for a change request right now. Please contact support@personalsonggifts.com.",
  },
  no_allowance: {
    status: 409,
    message: "You've already used the free change for this song. Contact support@personalsonggifts.com and we'll help.",
  },
  purchased: {
    status: 409,
    message: "This song has just been purchased, so we've kept it exactly as it is. Contact support@personalsonggifts.com to request a change.",
  },
  already_bound: {
    status: 409,
    message: "Your change request is already being made. We'll email you when the new version is ready.",
  },
  missing_request: {
    status: 500,
    message: "Could not save your request. Please try again or contact support@personalsonggifts.com.",
  },
  error: {
    status: 500,
    message: "Could not save your request. Please try again or contact support@personalsonggifts.com.",
  },
};

export async function claimRevisionBinding(
  db: RpcDb,
  params: {
    entityType: "lead" | "order";
    entityId: string;
    requestId: string;
    expectedRevisionCount: number | null;
  },
): Promise<ClaimOutcome> {
  try {
    const { data, error } = await db.rpc("claim_revision_binding", {
      p_entity_type: params.entityType,
      p_entity_id: params.entityId,
      p_request_id: params.requestId,
      p_expected_revision_count: params.expectedRevisionCount ?? 0,
    });
    if (error) {
      return { result: "error", boundRequestId: null, revisionCount: null, error: error.message };
    }
    const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
    if (!row || typeof row.result !== "string") {
      return { result: "error", boundRequestId: null, revisionCount: null, error: "claim returned no row" };
    }
    return {
      result: row.result as ClaimResult,
      boundRequestId: (row.bound_request_id as string | null) ?? null,
      revisionCount: (row.revision_count as number | null) ?? null,
      error: null,
    };
  } catch (e) {
    return {
      result: "error",
      boundRequestId: null,
      revisionCount: null,
      error: e instanceof Error ? e.message : "claim threw",
    };
  }
}

interface BriefRowDb {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: unknown) => {
        maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
      };
    };
  };
}

export interface BoundBriefEntity {
  id: string;
  revision_status?: string | null;
  bound_revision_request_id?: string | null;
}

/**
 * The brief for THIS generation, read by bound request id only.
 *
 * `ok: false` means the brief is UNKNOWN — the caller must not spend on a
 * generation that would ignore the customer's instructions. Cases:
 *  - a revision is in flight but no request is bound (crash between writes)
 *  - the bound row does not exist or is not in an accepted state
 *  - the lookup itself errored or threw
 */
export async function fetchBoundBriefForGeneration(
  db: BriefRowDb,
  entityType: "lead" | "order",
  entity: BoundBriefEntity,
): Promise<RevisionBriefResult> {
  const inFlight = revisionInFlight(entity.revision_status);
  const boundId = entity.bound_revision_request_id ?? null;

  if (!boundId) {
    // No binding: fine only when no revision is open. Otherwise fail closed.
    return {
      ok: !inFlight,
      brief: EMPTY_BRIEF,
      revisionRequestId: null,
      error: inFlight ? "revision in flight with no bound request" : null,
    };
  }

  try {
    const { data, error } = await db
      .from("revision_requests")
      .select("id, status, lead_id, order_id, style_notes, tempo, anything_else, sender_context, recipient_name_pronunciation")
      .eq("id", boundId)
      .maybeSingle();
    if (error) {
      return { ok: false, brief: EMPTY_BRIEF, revisionRequestId: boundId, error: error.message };
    }
    if (!data) {
      return { ok: false, brief: EMPTY_BRIEF, revisionRequestId: boundId, error: "bound revision request not found" };
    }
    const ownerCol = entityType === "order" ? "order_id" : "lead_id";
    if (data[ownerCol] !== entity.id) {
      return { ok: false, brief: EMPTY_BRIEF, revisionRequestId: boundId, error: "bound revision request belongs to another record" };
    }
    if (String(data.status ?? "") !== "approved") {
      return { ok: false, brief: EMPTY_BRIEF, revisionRequestId: boundId, error: `bound revision request status is ${data.status}` };
    }
    return { ok: true, brief: normalizeRevisionBrief(data), revisionRequestId: boundId, error: null };
  } catch (e) {
    return {
      ok: false,
      brief: EMPTY_BRIEF,
      revisionRequestId: boundId,
      error: e instanceof Error ? e.message : "bound brief lookup threw",
    };
  }
}

export function revisionInFlight(status: unknown): boolean {
  const s = String(status ?? "").toLowerCase();
  return s === "processing" || s === "pending";
}

/**
 * Fail-closed decision that applies to BOTH the lead and the paid order path
 * (the paid path previously bypassed this entirely).
 */
export function mustAbortForUnboundBrief(result: RevisionBriefResult): boolean {
  return !result.ok;
}

/**
 * `sender_context` is captured on the revision request but leads have no
 * dedicated column for it, so it never reached lead generation. Fold it into the
 * lead's stored context text explicitly, bounded, and only when it adds
 * something.
 */
export function mergeSenderContext(existing: string | null | undefined, fromRequest: string | null | undefined, max = 600): string | null {
  const base = (existing ?? "").trim();
  const extra = (fromRequest ?? "").trim();
  if (!extra) return base || null;
  if (base.toLowerCase().includes(extra.toLowerCase())) return base;
  const merged = base ? `${base}\nFrom the sender: ${extra}` : `From the sender: ${extra}`;
  return merged.slice(0, max);
}

export type { RevisionBrief, RevisionBriefResult };
