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

/**
 * Brevo documents `headers.idempotencyKey` on POST /v3/smtp/email as a UUID with a
 * 30-minute TTL; reusing it inside that window is rejected with
 * `duplicate_parameter` and NOT sent again. That window is the only mechanism we
 * have for deduplicating a retry, so it drives the reclaim decision below.
 */
export const PROVIDER_KEY_TTL_SECONDS = 1800;

export interface OutboxClaim {
  outboxId: string | null;
  state: OutboxState | null;
  attemptCount: number;
  claimed: boolean;
  /**
   * UUID passed to Brevo as `headers.idempotencyKey`.
   *
   * NOT rotated when a claim's lease expires while the key is still inside the
   * provider TTL: the worker may have crashed AFTER the provider accepted, and a
   * fresh key would defeat deduplication and send a second copy. A fresh key is
   * only issued after a DEFINITE provider rejection.
   */
  providerKey: string | null;
  /** True when this attempt deliberately reuses the previous attempt's key. */
  providerKeyReused: boolean;
  /** Fences settlement to this attempt; a stale worker cannot settle. */
  leaseToken: string | null;
  /** When the first attempt for this logical email was made. */
  firstAttemptAt: string | null;
  /**
   * True when the row is in an unresolved state we must not resend: a crashed
   * claim whose provider dedupe window has passed, or an earlier ambiguous
   * attempt. Honest unresolved status, never a false "delivered".
   */
  unresolved: boolean;
  error: string | null;
}

const EMPTY_CLAIM: OutboxClaim = {
  outboxId: null,
  state: null,
  attemptCount: 0,
  claimed: false,
  providerKey: null,
  providerKeyReused: false,
  leaseToken: null,
  firstAttemptAt: null,
  unresolved: false,
  error: null,
};

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

/**
 * Pure mirror of the reclaim branch in `claim_email_send` (see
 * docs/revision-hardening/001_revision_binding_and_email_outbox.sql.txt), so the
 * TTL boundary and the accepted-then-crash case are testable without a database.
 */
export function classifyReclaim(row: {
  state: OutboxState;
  attemptCount: number;
  maxAttempts: number;
  leaseExpired: boolean;
  providerKeyAgeSeconds: number;
  providerTtlSeconds?: number;
}): "claim_fresh_key" | "claim_reuse_key" | "unresolved_ambiguous" | "not_claimable" {
  const ttl = row.providerTtlSeconds ?? PROVIDER_KEY_TTL_SECONDS;
  const attemptsLeft = row.attemptCount < row.maxAttempts;
  if (row.state === "failed") return attemptsLeft ? "claim_fresh_key" : "not_claimable";
  if (row.state === "claimed") {
    if (!row.leaseExpired) return "not_claimable";
    // Strictly inside the window: at the exact boundary the provider may already
    // have forgotten the key, so we do not gamble on deduplication.
    if (row.providerKeyAgeSeconds < ttl && attemptsLeft) return "claim_reuse_key";
    return "unresolved_ambiguous";
  }
  return "not_claimable";
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
    /** After this many seconds a crashed claim is reclaimable. */
    leaseSeconds?: number;
    /** Provider dedupe window; must match the provider's documented TTL. */
    providerTtlSeconds?: number;
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
      p_lease_seconds: params.leaseSeconds ?? 600,
      p_provider_ttl_seconds: params.providerTtlSeconds ?? PROVIDER_KEY_TTL_SECONDS,
    });
    if (error) {
      // Fail closed: if we cannot claim, we do not send. Never send "just in case".
      return { ...EMPTY_CLAIM, error: error.message };
    }
    const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
    if (!row) return { ...EMPTY_CLAIM, error: "claim returned no row" };
    return {
      outboxId: (row.outbox_id as string | null) ?? null,
      state: (row.state as OutboxState | null) ?? null,
      attemptCount: Number(row.attempt_count ?? 0),
      claimed: row.claimed === true,
      providerKey: (row.provider_key as string | null) ?? null,
      providerKeyReused: row.provider_key_reused === true,
      leaseToken: (row.lease_token as string | null) ?? null,
      firstAttemptAt: (row.first_attempt_at as string | null) ?? null,
      unresolved: row.unresolved === true,
      error: null,
    };
  } catch (e) {
    return { ...EMPTY_CLAIM, error: e instanceof Error ? e.message : "claim threw" };
  }
}

export async function settleEmailSend(
  db: RpcDb,
  outboxId: string,
  leaseToken: string | null,
  state: Exclude<OutboxState, "claimed">,
  detail?: { providerMessageId?: string | null; error?: string | null },
): Promise<{ ok: boolean; settled: boolean; staleLease: boolean; observedState: OutboxState | null; error: string | null }> {
  try {
    const { data, error } = await db.rpc("settle_email_send", {
      p_outbox_id: outboxId,
      p_lease_token: leaseToken,
      p_state: state,
      p_provider_message_id: detail?.providerMessageId ?? null,
      p_error: detail?.error ?? null,
    });
    if (error) return { ok: false, settled: false, staleLease: false, observedState: null, error: error.message };
    const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
    return {
      ok: true,
      // false = the row was not claimed by US, i.e. someone else owns the attempt.
      settled: row?.settled === true,
      staleLease: row?.stale_lease === true,
      observedState: (row?.state as OutboxState | null) ?? null,
      error: null,
    };
  } catch (e) {
    return { ok: false, settled: false, staleLease: false, observedState: null, error: e instanceof Error ? e.message : "settle threw" };
  }
}

/**
 * Classify a provider send attempt.
 *  - a thrown fetch / abort is AMBIGUOUS: the message may well have gone out, so
 *    we must not automatically send it again;
 *  - a definite non-2xx is FAILED and may be retried within max_attempts.
 */
export function classifySendOutcome(outcome:
  | { kind: "response"; ok: boolean; status: number; providerMessageId?: string | null; body?: string | null }
  | { kind: "threw"; message: string },
): { state: Exclude<OutboxState, "claimed">; retryable: boolean; error: string | null; providerMessageId: string | null } {
  if (outcome.kind === "threw") {
    return { state: "ambiguous", retryable: false, error: outcome.message, providerMessageId: null };
  }
  if (outcome.ok) {
    return { state: "accepted", retryable: false, error: null, providerMessageId: outcome.providerMessageId ?? null };
  }
  // Brevo rejects a reused idempotency key within its 30-minute TTL with
  // `duplicate_parameter`. That is EVIDENCE the message was already accepted, so
  // it reconciles an ambiguous attempt instead of counting as a failure.
  if (String(outcome.body ?? "").includes("duplicate_parameter")) {
    return { state: "accepted", retryable: false, error: "provider reported duplicate (already accepted)", providerMessageId: null };
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
