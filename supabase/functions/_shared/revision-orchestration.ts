// Production orchestration, extracted from the edge handlers so it can be
// executed in tests with injected dependencies.
//
// `Deno.serve(...)` wrappers stay in index.ts and do nothing but parse the
// request and call these functions, so "the handler can't be imported" is no
// longer a reason for missing tests. Each function below IS the code path that
// runs in production.

import { claimRevisionBinding, reconcileClaim, releaseRevisionBinding, CLAIM_RESPONSES, type ClaimOutcome } from "./revision-binding.ts";
import { claimEmailSend, classifySendOutcome, settleEmailSend, type OutboxClaim } from "./email-outbox.ts";
import { assertPurchasableVersion, type VersionRecord } from "./previous-version.ts";

// ---------------------------------------------------------------------------
// Revision submission (shared by the lead path and the paid order path)
// ---------------------------------------------------------------------------

export interface SubmitDeps {
  db: {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
  };
  insertRequest: (row: Record<string, unknown>) => Promise<{ id: string | null; error: string | null }>;
  rejectRequest: (id: string, reason: string) => Promise<void>;
  /** Records an honest error state; recovery stays automatic and bounded. */
  recordAttentionState: (reason: string) => Promise<void>;
  triggerGeneration: (requestId: string) => Promise<{ started: boolean; error: string | null }>;
}

export interface SubmitInput {
  entityType: "lead" | "order";
  entityId: string;
  expectedRevisionCount: number | null;
  fieldsChanged: string[];
  requestRow: Record<string, unknown>;
  /** Customer edits + generation-reset snapshot, applied atomically with the binding. */
  entityUpdates?: Record<string, unknown>;
}

export interface SubmitOutcome {
  status: number;
  body: Record<string, unknown>;
  claim?: ClaimOutcome;
}

/**
 * One code path for both paid and unpaid revisions:
 *  - a no-op consumes nothing and destroys nothing;
 *  - the request row is written first, as "pending";
 *  - binding is a single atomic call that also enforces allowance and purchase
 *    status; losers are rejected and never consume the allowance;
 *  - a failure AFTER binding is recorded honestly (needs_review), never silent.
 */
export async function submitRevisionRequest(deps: SubmitDeps, input: SubmitInput): Promise<SubmitOutcome> {
  if (input.fieldsChanged.length === 0) {
    return {
      status: 400,
      body: {
        error: "no_changes",
        message: "Nothing was changed, so we kept your current song. Edit a detail (pronunciation, story, style or tempo) and submit again.",
      },
    };
  }

  const inserted = await deps.insertRequest({ ...input.requestRow, status: "pending" });
  if (!inserted.id) {
    return {
      status: 500,
      body: { error: "Could not save your request. Please try again or contact support@personalsonggifts.com." },
    };
  }

  let claim = await claimRevisionBinding(deps.db, {
    entityType: input.entityType,
    entityId: input.entityId,
    requestId: inserted.id,
    expectedRevisionCount: input.expectedRevisionCount,
    entityUpdates: input.entityUpdates,
  });

  // Accepted-but-timeout: the RPC may have committed before the response was
  // lost. Read the request back rather than rejecting work the database accepted
  // (which would also consume the allowance a second time on the customer's retry).
  if (claim.result === "error") {
    const reconciled = await reconcileClaim(deps.db as never, input.entityType, input.entityId, inserted.id);
    if (reconciled.bound) {
      claim = { result: "claimed", boundRequestId: inserted.id, revisionCount: claim.revisionCount, error: null };
    }
  }

  if (claim.result !== "claimed") {
    await deps.rejectRequest(inserted.id, `claim result: ${claim.result}${claim.error ? ` (${claim.error})` : ""}`);
    const response = CLAIM_RESPONSES[claim.result];
    return { status: response.status, body: { error: claim.result, message: response.message }, claim };
  }

  // A thrown trigger is the same case as a returned failure: never let an
  // exception escape and leave the record bound but silent.
  let trigger: { started: boolean; error: string | null };
  try {
    trigger = await deps.triggerGeneration(inserted.id);
  } catch (e) {
    trigger = { started: false, error: e instanceof Error ? e.message : "trigger threw" };
  }

  if (!trigger.started) {
    await deps.recordAttentionState(`revision trigger did not start: ${trigger.error ?? "unknown"}`);
    // Bounded automatic recovery: if no provider task exists, hand the free
    // change back and reopen the record — no human release gate. If a task does
    // exist the work is running and we leave it alone.
    const released = await releaseRevisionBinding(
      deps.db,
      input.entityType,
      input.entityId,
      inserted.id,
      `trigger did not start: ${trigger.error ?? "unknown"}`,
    );
    if (released === "released") {
      return {
        status: 503,
        body: {
          error: "not_started",
          message: "We couldn't start your new version just now and your free change is still available — please submit it again in a few minutes.",
        },
        claim,
      };
    }
    return {
      status: 202,
      body: {
        accepted: true,
        started: false,
        revision_request_id: inserted.id,
        message: "We've got your changes. The new version is queued — we'll email you when it's ready.",
      },
      claim,
    };
  }

  return {
    status: 200,
    body: { accepted: true, started: true, revision_request_id: inserted.id },
    claim,
  };
}

// ---------------------------------------------------------------------------
// Preview delivery (outbox-backed; acceptance is never confused with a claim)
// ---------------------------------------------------------------------------

export interface DeliverDeps {
  db: {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
  };
  /** Re-read immediately before sending; batch snapshots are not trusted. */
  reloadRecord: (id: string) => Promise<Record<string, unknown> | null>;
  readiness: (record: Record<string, unknown>) => { ready: boolean; reason: string | null };
  send: (record: Record<string, unknown>, providerIdempotencyKey: string | null) => Promise<
    { kind: "response"; ok: boolean; status: number; providerMessageId?: string | null; body?: string | null } | { kind: "threw"; message: string }
  >;
  /**
   * Only ever called after the provider ACCEPTS, and FENCED to the generation the
   * email was about: `expectedGenerationKey` must still match the row, otherwise a
   * newer revision or purchase would be overwritten with a stale "sent" marker.
   */
  markAttempted: (
    id: string,
    providerMessageId: string | null,
    expectedGenerationKey: string | null,
  ) => Promise<{ error: string | null; fenced: boolean }>;
  note: (id: string, message: string) => Promise<void>;
}

export interface DeliverOutcome {
  sent: boolean;
  state: "skipped" | "accepted" | "ambiguous" | "failed" | "not_claimed" | "unresolved";
  reason: string | null;
  claim?: OutboxClaim;
}

export async function deliverLeadPreview(deps: DeliverDeps, leadId: string): Promise<DeliverOutcome> {
  const fresh = await deps.reloadRecord(leadId);
  if (!fresh) return { sent: false, state: "skipped", reason: "record_gone" };

  const readiness = deps.readiness(fresh);
  if (!readiness.ready) return { sent: false, state: "skipped", reason: readiness.reason };

  const generationKey = (fresh.generated_at as string | null) ?? (fresh.automation_task_id as string | null) ?? null;
  const claim = await claimEmailSend(deps.db, {
    purpose: "lead_preview",
    entityType: "lead",
    entityId: leadId,
    generationKey,
  });

  // A crashed attempt whose provider dedupe window has passed is UNRESOLVED: the
  // provider may or may not have accepted it, so we neither resend nor pretend it
  // was delivered. Recorded honestly; no human approval step.
  if (claim.unresolved) {
    await deps.note(
      leadId,
      `preview email unresolved (attempt started ${claim.firstAttemptAt ?? "unknown"}; provider dedupe window elapsed) — not resent automatically`,
    );
    return { sent: false, state: "unresolved", reason: "provider_dedupe_window_elapsed", claim };
  }

  // No claim = someone else owns this attempt, or we could not record ownership.
  // Either way we do NOT send.
  if (!claim.claimed) {
    return { sent: false, state: "not_claimed", reason: claim.error ?? claim.state ?? "already_claimed", claim };
  }

  // Never let a thrown send escape: an exception here used to leave a claimed
  // attempt with no settlement at all.
  let outcome: Awaited<ReturnType<DeliverDeps["send"]>>;
  try {
    outcome = await deps.send(fresh, claim.providerKey);
  } catch (e) {
    outcome = { kind: "threw", message: e instanceof Error ? e.message : "send threw" };
  }
  const classified = classifySendOutcome(outcome);

  // Settlement is fenced to the lease we hold, and the result is enforced.
  const settled = await settleEmailSend(deps.db, claim.outboxId!, claim.leaseToken, classified.state, {
    providerMessageId: classified.providerMessageId,
    error: classified.error,
  });

  if (settled.ok && settled.staleLease) {
    // Our lease was taken over while we were talking to the provider: another
    // worker owns this attempt. Record what the provider told us and touch
    // nothing on the record — the owner settles it.
    await deps.note(
      leadId,
      `preview email attempt superseded by a newer worker (provider said ${classified.state}); record left untouched`,
    );
    return {
      sent: classified.state === "accepted",
      state: classified.state === "accepted" ? "accepted" : "not_claimed",
      reason: "stale_lease",
      claim,
    };
  }

  if (!settled.ok || !settled.settled) {
    // The settle result is checked: if we could not record the outcome, say so
    // rather than reporting a delivery we cannot account for.
    await deps.note(
      leadId,
      `preview email outcome ${classified.state} could not be recorded (${settled.error ?? settled.observedState ?? "not claimed"})`,
    );
  }

  if (classified.state === "accepted") {
    const marked = await deps.markAttempted(leadId, classified.providerMessageId, generationKey);
    if (marked.error) {
      await deps.note(leadId, `preview email accepted but record update failed: ${marked.error}`);
    } else if (!marked.fenced) {
      await deps.note(leadId, "preview email accepted for a generation that has since changed; record left untouched");
    }
    if (claim.providerKeyReused) {
      await deps.note(
        leadId,
        "preview email retried with the same provider idempotency key; provider deduplication prevents a second copy",
      );
    }
    return { sent: true, state: "accepted", reason: null, claim };
  }

  if (classified.state === "ambiguous") {
    // Unknown whether it went out: never auto-resend, never mark as sent.
    await deps.note(leadId, `preview email outcome unknown (${classified.error}); not resent automatically`);
    return { sent: false, state: "ambiguous", reason: classified.error, claim };
  }

  await deps.note(leadId, `preview email failed (${classified.error}); will retry within bounded attempts`);
  return { sent: false, state: "failed", reason: classified.error, claim };
}

// ---------------------------------------------------------------------------
// Purchase guard (checkout + webhook parity)
// ---------------------------------------------------------------------------

export function purchaseGuard(record: VersionRecord): { ok: boolean; reason: string | null } {
  return assertPurchasableVersion(record);
}
