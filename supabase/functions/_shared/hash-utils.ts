/**
 * Shared hash utility for input change detection.
 * Used by: stripe-webhook, capture-lead, process-payment,
 *          process-scheduled-deliveries, admin-orders.
 *
 * IMPORTANT: Keep field ordering identical across all callers
 * to ensure deterministic hashing.
 */
export async function computeInputsHash(fields: string[]): Promise<string> {
  const combined = fields.map(f => (f ?? "").trim()).join("|");
  const encoder = new TextEncoder();
  const data = encoder.encode(combined);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("").substring(0, 16);
}
