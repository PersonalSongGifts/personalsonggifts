import {
  revisionFinalWriteFence,
  verifyRevisionTask,
  type TaskVerification,
} from "./revision-binding.ts";

export type CallbackLane = "primary" | "bonus";

export interface CallbackIdentity {
  required: boolean;
  verification: TaskVerification | null;
  fence: Record<string, string>;
}

interface VerifyDb {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{
    data: unknown;
    error: { message: string } | null;
  }>;
}

/**
 * Production callback identity orchestration. A row carrying an accepted
 * revision binding must verify the task for the correct lane before ANY
 * callback mutation. The callback never creates or adopts a binding.
 */
export async function resolveCallbackIdentity(
  db: VerifyDb,
  params: {
    entityType: "lead" | "order";
    entityId: string;
    taskId: string;
    lane: CallbackLane;
    boundRevisionRequestId?: string | null;
    boundRevisionGenerationId?: string | null;
  },
): Promise<CallbackIdentity> {
  const required = !!params.boundRevisionRequestId || !!params.boundRevisionGenerationId;
  if (!required) {
    return {
      required: false,
      verification: null,
      fence: revisionFinalWriteFence({ taskId: params.taskId, lane: params.lane }),
    };
  }

  const verification = await verifyRevisionTask(
    db,
    params.entityType,
    params.entityId,
    params.taskId,
    params.lane,
  );
  return {
    required: true,
    verification,
    fence: revisionFinalWriteFence({ taskId: params.taskId, lane: params.lane, verification }),
  };
}

export type CallbackMutationResult =
  | { kind: "written"; error: null }
  | { kind: "stale"; error: null }
  | { kind: "error"; error: string };

/**
 * Executes the real final-write decision used by the callback. Tests inject the
 * database adapter at this seam, so DB errors and zero-row stale writes exercise
 * production orchestration rather than a copied predicate.
 */
export async function executeCallbackMutation(
  identity: CallbackIdentity,
  write: (fence: Record<string, string>) => Promise<{
    rows: Array<Record<string, unknown>> | null;
    error: string | null;
  }>,
): Promise<CallbackMutationResult> {
  if (identity.required && identity.verification?.result !== "verified") {
    if (identity.verification?.result === "other_task") return { kind: "stale", error: null };
    return {
      kind: "error",
      error: `revision identity ${identity.verification?.result ?? "missing"}: ${identity.verification?.error ?? "unverified"}`,
    };
  }

  try {
    const result = await write(identity.fence);
    if (result.error) return { kind: "error", error: result.error };
    if (!result.rows || result.rows.length === 0) return { kind: "stale", error: null };
    return { kind: "written", error: null };
  } catch (error) {
    return { kind: "error", error: error instanceof Error ? error.message : "callback mutation threw" };
  }
}