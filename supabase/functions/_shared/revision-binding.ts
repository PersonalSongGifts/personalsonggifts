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
  | "request_not_pending"
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
  request_not_pending: {
    status: 409,
    message: "Your change request is already being made. We'll email you when the new version is ready.",
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
    /** Customer edits + generation-reset snapshot, applied inside the same transaction. */
    entityUpdates?: Record<string, unknown>;
  },
): Promise<ClaimOutcome> {
  try {
    const { data, error } = await db.rpc("claim_revision_binding", {
      p_entity_type: params.entityType,
      p_entity_id: params.entityId,
      p_request_id: params.requestId,
      p_expected_revision_count: params.expectedRevisionCount ?? 0,
      p_entity_updates: params.entityUpdates ?? {},
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

/**
 * Every state in which a change request is OPEN. "approved" was missing, which
 * meant an approved-but-unbound record was treated as having no revision at all
 * and generated with no notes.
 */
export const IN_FLIGHT_REVISION_STATES = ["processing", "pending", "approved", "in_progress"] as const;

export function revisionInFlight(status: unknown): boolean {
  return (IN_FLIGHT_REVISION_STATES as readonly string[]).includes(String(status ?? "").toLowerCase());
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

/**
 * Reconcile an ambiguous claim (RPC accepted the work but the response never
 * arrived, or the connection dropped). The claim itself is idempotent: reading
 * the request back tells us whether it was in fact bound, so we never reject a
 * request the database accepted and never consume the allowance twice.
 */
export async function reconcileClaim(
  db: BriefRowDb,
  entityType: "lead" | "order",
  entityId: string,
  requestId: string,
): Promise<{ bound: boolean; error: string | null }> {
  try {
    const { data, error } = await db
      .from("revision_requests")
      .select("id, status, lead_id, order_id")
      .eq("id", requestId)
      .maybeSingle();
    if (error) return { bound: false, error: error.message };
    if (!data) return { bound: false, error: "request row missing" };
    const ownerCol = entityType === "order" ? "order_id" : "lead_id";
    if (data[ownerCol] !== entityId) return { bound: false, error: "request belongs to another record" };
    return { bound: String(data.status ?? "") === "approved", error: null };
  } catch (e) {
    return { bound: false, error: e instanceof Error ? e.message : "reconcile threw" };
  }
}

// ---------------------------------------------------------------------------
// Immutable callback identity.
//
// The old `bindRevisionTask(entity, task)` carried no request or generation
// identity AND was called by the callback itself. If the binding had since been
// rotated to a NEW request while an OLD task was still in flight, that old task
// found an empty `bound_revision_task_id` and bound itself to the new request.
//
// Now identity is captured BEFORE anything is submitted to the provider:
//   1. reserveRevisionGeneration(request, generation)  — pre-submission
//   2. attachRevisionTask(request, generation, task)   — first task wins
//   3. verifyRevisionTask(task)                        — READ ONLY, callbacks
// ---------------------------------------------------------------------------

function firstRow(data: unknown): Record<string, unknown> | null {
  const value = Array.isArray(data) ? data[0] : data;
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

/** Reserve ONE immutable generation identity for the accepted request. Pre-submission. */
export async function reserveRevisionGeneration(
  db: RpcDb,
  entityType: "lead" | "order",
  entityId: string,
  requestId: string,
  generationId: string,
): Promise<{ result: "reserved" | "other_generation" | "not_bound" | "no_revision" | "error"; generationId: string | null; error: string | null }> {
  try {
    const { data, error } = await db.rpc("reserve_revision_generation", {
      p_entity_type: entityType,
      p_entity_id: entityId,
      p_request_id: requestId,
      p_generation_id: generationId,
    });
    if (error) return { result: "error", generationId: null, error: error.message };
    const row = firstRow(data);
    const result = String(row?.result ?? "");
    if (result === "reserved" || result === "other_generation" || result === "not_bound" || result === "no_revision") {
      return { result, generationId: (row?.generation_id as string | null) ?? null, error: null };
    }
    return { result: "error", generationId: null, error: "unexpected reserve result" };
  } catch (e) {
    return { result: "error", generationId: null, error: e instanceof Error ? e.message : "reserve threw" };
  }
}

/** Record the FIRST provider task for a reserved (request, generation) pair. */
export async function attachRevisionTask(
  db: RpcDb,
  entityType: "lead" | "order",
  entityId: string,
  params: { requestId: string; generationId: string; taskId: string },
): Promise<"attached" | "other_task" | "identity_mismatch" | "no_revision" | "error"> {
  try {
    const { data, error } = await db.rpc("attach_revision_task", {
      p_entity_type: entityType,
      p_entity_id: entityId,
      p_request_id: params.requestId,
      p_generation_id: params.generationId,
      p_task_id: params.taskId,
    });
    if (error) return "error";
    const value = Array.isArray(data) ? data[0] : data;
    const result = typeof value === "string"
      ? value
      : String((value as Record<string, unknown> | null)?.attach_revision_task ?? "");
    return result === "attached" || result === "other_task" || result === "identity_mismatch" || result === "no_revision"
      ? result
      : "error";
  } catch {
    return "error";
  }
}

export interface TaskVerification {
  result: "verified" | "other_task" | "unattached" | "no_revision" | "error";
  requestId: string | null;
  generationId: string | null;
  boundTaskId: string | null;
  error: string | null;
}

/**
 * READ ONLY verification for callbacks. `unattached` is NOT permission to adopt
 * the revision — a callback that cannot verify must not finalise anything.
 */
export async function verifyRevisionTask(
  db: RpcDb,
  entityType: "lead" | "order",
  entityId: string,
  taskId: string,
): Promise<TaskVerification> {
  try {
    const { data, error } = await db.rpc("verify_revision_task", {
      p_entity_type: entityType,
      p_entity_id: entityId,
      p_task_id: taskId,
    });
    if (error) return { result: "error", requestId: null, generationId: null, boundTaskId: null, error: error.message };
    const row = firstRow(data);
    const result = String(row?.result ?? "");
    if (result === "verified" || result === "other_task" || result === "unattached" || result === "no_revision") {
      return {
        result,
        requestId: (row?.request_id as string | null) ?? null,
        generationId: (row?.generation_id as string | null) ?? null,
        boundTaskId: (row?.bound_task_id as string | null) ?? null,
        error: null,
      };
    }
    return { result: "error", requestId: null, generationId: null, boundTaskId: null, error: "unexpected verify result" };
  } catch (e) {
    return { result: "error", requestId: null, generationId: null, boundTaskId: null, error: e instanceof Error ? e.message : "verify threw" };
  }
}

/**
 * Equality filters every FINAL write must carry, for success AND failure paths.
 * A precheck is not enough: the row can be rebound between the check and the
 * write, so the write itself must match task + request + generation.
 */
export function revisionFinalWriteFence(params: {
  taskId: string;
  verification?: TaskVerification | null;
}): Record<string, string> {
  const fence: Record<string, string> = { automation_task_id: params.taskId };
  const v = params.verification;
  if (v && v.result === "verified") {
    if (v.requestId) fence.bound_revision_request_id = v.requestId;
    if (v.generationId) fence.bound_revision_generation_id = v.generationId;
  }
  return fence;
}

/**
 * A final write that matched no rows means this callback is stale. Everything
 * downstream — status, emails, bonus handling — must stop.
 */
export function stopDownstream(rows: { length: number } | null | undefined): boolean {
  return !rows || rows.length === 0;
}

/**
 * Migration-first rollout window.
 *
 * Between applying the migration and deploying the new submit handler, an old
 * copy of submit code could still accept a request that the new generators would
 * refuse (no binding). The quiescence control is an `admin_settings` row,
 * `revision_submissions_paused`; while it is on, submissions are refused with an
 * honest message and no allowance is consumed. Absent row = open, so nothing has
 * to be mutated in production for the current behaviour to continue.
 */
export function revisionSubmissionGate(settingValue: string | null | undefined): { paused: boolean; message: string } {
  const paused = ["1", "true", "yes", "on"].includes(String(settingValue ?? "").trim().toLowerCase());
  return {
    paused,
    message:
      "Change requests are paused for a few minutes while we finish an update. Your song is safe and your free change is still available — please try again shortly.",
  };
}

/** Bounded automatic recovery for a claimed revision that provably never started. */
export async function releaseRevisionBinding(
  db: RpcDb,
  entityType: "lead" | "order",
  entityId: string,
  requestId: string,
  reason: string,
): Promise<"released" | "task_in_flight" | "not_bound" | "error"> {
  try {
    const { data, error } = await db.rpc("release_revision_binding", {
      p_entity_type: entityType,
      p_entity_id: entityId,
      p_request_id: requestId,
      p_reason: reason,
    });
    if (error) return "error";
    const value = Array.isArray(data) ? data[0] : data;
    const result = typeof value === "string" ? value : String((value as Record<string, unknown> | null)?.release_revision_binding ?? "");
    return result === "released" || result === "task_in_flight" || result === "not_bound" ? result : "error";
  } catch {
    return "error";
  }
}

export type { RevisionBrief, RevisionBriefResult };
