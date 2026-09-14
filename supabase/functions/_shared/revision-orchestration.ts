// Production orchestration, extracted from the edge handlers so it can be
// executed in tests with injected dependencies.
//
// `Deno.serve(...)` wrappers stay in index.ts and do nothing but parse the
// request and call these functions, so "the handler can't be imported" is no
// longer a reason for missing tests. Each function below IS the code path that
// runs in production.

import { claimRevisionBinding, CLAIM_RESPONSES, type ClaimOutcome } from "./revision-binding.ts";
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
  flagNeedsReview: (reason: string) => Promise<void>;
  triggerGeneration: (requestId: string) => Promise<{ started: boolean; error: string | null }>;
}

export interface SubmitInput {
  entityType: "lead" | "order";
  entityId: string;
  expectedRevisionCount: number | null;
  fieldsChanged: string[];
  requestRow: Record<string, unknown>;
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

  const claim = await claimRevisionBinding(deps.db, {
    entityType: input.entityType,
    entityId: input.entityId,
    requestId: inserted.id,
    expectedRevisionCount: input.expectedRevisionCount,
  });

  if (claim.result !== "claimed") {
    await deps.rejectRequest(inserted.id, `claim result: ${claim.result}${claim.error ? ` (${claim.error})` : ""}`);
    const response = CLAIM_RESPONSES[claim.result];
    return { status: response.status, body: { error: claim.result, message: response.message }, claim };
  }

  const trigger = await deps.triggerGeneration(inserted.id);
  if (!trigger.started) {
    // Bound but not started: honest attention state, allowance already consumed
    // by the atomic claim, nothing lost or duplicated.
    await deps.flagNeedsReview(`revision trigger did not start: ${trigger.error ?? "unknown"}`);
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
  send: (record: Record<string, unknown>, idempotencyKey: string) => Promise<
    { kind: "response"; ok: boolean; status: number; providerMessageId?: string | null } | { kind: "threw"; message: string }
  >;
  /** Only ever called after the provider ACCEPTS. */
  markAttempted: (id: string, providerMessageId: string | null) => Promise<{ error: string | null }>;
  note: (id: string, message: string) => Promise<void>;
}

export interface DeliverOutcome {
  sent: boolean;
  state: "skipped" | "accepted" | "ambiguous" | "failed" | "not_claimed";
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

  // No claim = someone else owns this attempt, or we could not record ownership.
  // Either way we do NOT send.
  if (!claim.claimed) {
    return { sent: false, state: "not_claimed", reason: claim.error ?? claim.state ?? "already_claimed", claim };
  }

  const key = `lead_preview:${leadId}:${generationKey ?? "no-generation"}`;
  const outcome = await deps.send(fresh, key);
  const classified = classifySendOutcome(outcome);

  await settleEmailSend(deps.db, claim.outboxId!, classified.state, {
    providerMessageId: classified.providerMessageId,
    error: classified.error,
  });

  if (classified.state === "accepted") {
    const marked = await deps.markAttempted(leadId, classified.providerMessageId);
    if (marked.error) await deps.note(leadId, `preview email accepted but record update failed: ${marked.error}`);
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
