// Durable email outbox client.
//
// Review blocker: `preview_sent_at` was doubling as the claim token, so a
// claimed-but-not-yet-sent attempt looked identical to a delivered one, and a
// thrown request left a permanent false "sent". Acceptance by the provider was
// also being recorded as delivery.
//
// States (see docs/revision-hardening/001_revision_binding_and_email_outbox.sql.txt):
//   claimed   - we own this attempt; NOTHING has been sent
//   accepted  - the provider accepted the message (attempted, not "delivered")
//   ambiguous - the request threw/timed out; unknown whether it went out
//   failed    - definite provider rejection; safe to retry within max_attempts
//
// `preview_sent_at` is written ONLY after the provider accepts, and it means
// "we attempted delivery", never "we claimed it".

export type OutboxState = "claimed" | "accepted" | "ambiguous" | "failed";

export interface OutboxClaim {
  outboxId: string | null;
  state: OutboxState | null;
  attemptCount: number;
  claimed: boolean;
  error: string | null;
}

interface RpcDb {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
}

export function buildIdempotencyKey(parts: {
  purpose: string;
  entityId: string;
  generationKey: string | null | undefined;
}): string {
  return `${parts.purpose}:${parts.entityId}:${parts.generationKey ?? "no-generation"}`;
}

export async function claimEmailSend(
  db: RpcDb,
  params: {
    purpose: string;
    entityType: "lead" | "order";
    entityId: string;
    /** Identifies the generation this email is about; a new revision = new key. */
    generationKey: string | null;
    recipients?: unknown;
    maxAttempts?: number;
  },
): Promise<OutboxClaim> {
  const key = buildIdempotencyKey(params);
  try {
    const { data, error } = await db.rpc("claim_email_send", {
      p_idempotency_key: key,
      p_entity_type: params.entityType,
      p_entity_id: params.entityId,
      p_purpose: params.purpose,
      p_generation_key: params.generationKey,
      p_recipients: params.recipients ?? null,
      p_max_attempts: params.maxAttempts ?? 3,
    });
    if (error) {
      // Fail closed: if we cannot claim, we do not send. Never send "just in case".
      return { outboxId: null, state: null, attemptCount: 0, claimed: false, error: error.message };
    }
    const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
    if (!row) return { outboxId: null, state: null, attemptCount: 0, claimed: false, error: "claim returned no row" };
    return {
      outboxId: (row.outbox_id as string | null) ?? null,
      state: (row.state as OutboxState | null) ?? null,
      attemptCount: Number(row.attempt_count ?? 0),
      claimed: row.claimed === true,
      error: null,
    };
  } catch (e) {
    return {
      outboxId: null,
      state: null,
      attemptCount: 0,
      claimed: false,
      error: e instanceof Error ? e.message : "claim threw",
    };
  }
}

export async function settleEmailSend(
  db: RpcDb,
  outboxId: string,
  state: Exclude<OutboxState, "claimed">,
  detail?: { providerMessageId?: string | null; error?: string | null },
): Promise<{ ok: boolean; error: string | null }> {
  try {
    const { error } = await db.rpc("settle_email_send", {
      p_outbox_id: outboxId,
      p_state: state,
      p_provider_message_id: detail?.providerMessageId ?? null,
      p_error: detail?.error ?? null,
    });
    return { ok: !error, error: error?.message ?? null };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "settle threw" };
  }
}

/**
 * Classify a provider send attempt.
 *  - a thrown fetch / abort is AMBIGUOUS: the message may well have gone out, so
 *    we must not automatically send it again;
 *  - a definite non-2xx is FAILED and may be retried within max_attempts.
 */
export function classifySendOutcome(outcome:
  | { kind: "response"; ok: boolean; status: number; providerMessageId?: string | null }
  | { kind: "threw"; message: string },
): { state: Exclude<OutboxState, "claimed">; retryable: boolean; error: string | null; providerMessageId: string | null } {
  if (outcome.kind === "threw") {
    return { state: "ambiguous", retryable: false, error: outcome.message, providerMessageId: null };
  }
  if (outcome.ok) {
    return { state: "accepted", retryable: false, error: null, providerMessageId: outcome.providerMessageId ?? null };
  }
  return { state: "failed", retryable: true, error: `provider status ${outcome.status}`, providerMessageId: null };
}

/**
 * Customer-facing status derived from outbox state. Never claims delivery we
 * cannot prove, and never asks for human review.
 */
export function customerFacingSendStatus(state: OutboxState | null): string {
  switch (state) {
    case "accepted":
      return "Your new version has been emailed to you — check your inbox, and your spam folder just in case.";
    case "claimed":
      return "Your new version is ready and the email is going out now.";
    case "ambiguous":
      return "Your new version is ready. We couldn't confirm the email went through, so play it here — write to support@personalsonggifts.com if it never arrives.";
    case "failed":
      return "Your new version is ready. The email didn't go through, so we'll try again shortly — you can play it here in the meantime.";
    default:
      return "Your new version is ready to play here.";
  }
}

/**
 * Automatic, bounded reconciliation: retry only DEFINITE failures, never
 * ambiguous attempts (which may already have been delivered).
 */
export function shouldAutoRetry(row: { state: OutboxState; attempt_count: number; max_attempts: number }): boolean {
  return row.state === "failed" && row.attempt_count < row.max_attempts;
}
