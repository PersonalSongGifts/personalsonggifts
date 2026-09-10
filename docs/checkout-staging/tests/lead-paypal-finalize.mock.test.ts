/**
 * Mocked tests for the shared finalizer. `fetch` and the database client are
 * both fakes — no PayPal call and no database connection happen here. These are
 * NOT integration tests; see README §Test boundary.
 *
 * Run: bunx vitest run --config docs/checkout-staging/vitest.config.ts
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { finalizeLeadPayPalAttempt, type AttemptRow } from "../functions/_shared/lead-paypal-finalize";
import { generateReturnSecret, hashReturnSecret } from "../shared/lead-paypal-core";

const attemptBase: Omit<AttemptRow, "return_secret_hash"> = {
  id: "att-1",
  lead_id: "lead-1",
  provider_order_id: "PP-1",
  provider_capture_id: null,
  base_cents: 1900,
  package_cents: 2400,
  total_cents: 4300,
  status: "approval_pending",
};

function captureBody(over: Record<string, unknown> = {}) {
  return {
    id: "PP-1",
    purchase_units: [{
      payee: { merchant_id: "MERCH1" },
      payments: { captures: [{ id: "CAP-1", status: "COMPLETED", amount: { value: "43.00", currency_code: "USD" }, ...over }] },
    }],
  };
}

/** Minimal recording fake of the supabase client surface the finalizer uses. */
function fakeSupabase(rpcImpl?: (args: unknown) => { data?: unknown; error?: unknown }) {
  const writes: { table: string; op: string; payload: unknown }[] = [];
  const rpcCalls: unknown[] = [];
  return {
    writes,
    rpcCalls,
    from(table: string) {
      return {
        update(payload: unknown) {
          writes.push({ table, op: "update", payload });
          return { eq: () => ({ eq: () => Promise.resolve({}), is: () => Promise.resolve({}) }) };
        },
        insert(payload: unknown) {
          writes.push({ table, op: "insert", payload });
          const chain = {
            select: () => ({ maybeSingle: () => Promise.resolve({ data: { id: "inc-1" } }) }),
            then: (r: (v: unknown) => unknown) => Promise.resolve({}).then(r),
          };
          return chain as never;
        },
      };
    },
    rpc(_name: string, args: unknown) {
      rpcCalls.push(args);
      return Promise.resolve(rpcImpl ? rpcImpl(args) : { data: { outcome: "finalized", order_id: "order-1" } });
    },
  };
}

let secret: string;
let attempt: AttemptRow;
const opts = () => ({ requireSecret: false, accessToken: "tok", payeeMerchantId: "MERCH1" });

beforeEach(async () => {
  secret = generateReturnSecret();
  attempt = { ...attemptBase, return_secret_hash: await hashReturnSecret(secret) };
});
afterEach(() => vi.unstubAllGlobals());

function stubFetch(handler: (url: string, init?: RequestInit) => { status: number; body: unknown; ok?: boolean }) {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const r = handler(String(url), init);
    const text = typeof r.body === "string" ? r.body : JSON.stringify(r.body);
    return { ok: r.ok ?? (r.status >= 200 && r.status < 300), status: r.status, text: async () => text, json: async () => JSON.parse(text) } as never;
  }));
}

describe("browser secret gate", () => {
  it("refuses a wrong secret without ever calling PayPal", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const db = fakeSupabase();
    const res = await finalizeLeadPayPalAttempt(db, attempt, { ...opts(), requireSecret: true, presentedSecret: "nope" });
    expect(res).toEqual({ kind: "incident", reason: "return_secret_invalid" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("accepts the real secret", async () => {
    stubFetch(() => ({ status: 201, body: captureBody() }));
    const db = fakeSupabase();
    const res = await finalizeLeadPayPalAttempt(db, attempt, { ...opts(), requireSecret: true, presentedSecret: secret });
    expect(res).toEqual({ kind: "finalized", orderId: "order-1" });
  });

  it("works with no secret at all for reconciliation", async () => {
    stubFetch(() => ({ status: 201, body: captureBody() }));
    const res = await finalizeLeadPayPalAttempt(fakeSupabase(), attempt, opts());
    expect(res.kind).toBe("finalized");
  });
});

describe("happy path", () => {
  it("sends a stable idempotency key and the correct provider order", async () => {
    const seen: { url: string; requestId?: string }[] = [];
    stubFetch((url, init) => {
      seen.push({ url, requestId: (init?.headers as Record<string, string>)?.["PayPal-Request-Id"] });
      return { status: 201, body: captureBody() };
    });
    await finalizeLeadPayPalAttempt(fakeSupabase(), attempt, opts());
    await finalizeLeadPayPalAttempt(fakeSupabase(), attempt, opts());
    expect(seen[0].url).toContain("/v2/checkout/orders/PP-1/capture");
    expect(seen[0].requestId).toBe(seen[1].requestId);
  });

  it("passes server-stored amounts, never anything from the provider body, to the finalizer", async () => {
    stubFetch(() => ({ status: 201, body: captureBody() }));
    const db = fakeSupabase();
    await finalizeLeadPayPalAttempt(db, attempt, opts());
    expect(db.rpcCalls[0]).toMatchObject({
      p_provider: "paypal",
      p_provider_order_id: "PP-1",
      p_provider_capture_id: "CAP-1",
      p_lead_id: "lead-1",
      p_base_cents: 1900,
      p_package_cents: 2400,
      p_captured_cents: 4300,
      p_currency: "USD",
      p_notes_key: "paypal_lead:PP-1",
    });
  });
});

describe("mismatches never unlock", () => {
  const cases: [string, Record<string, unknown>, string][] = [
    ["underpayment", { amount: { value: "19.00", currency_code: "USD" } }, "amount_mismatch"],
    ["overpayment", { amount: { value: "99.00", currency_code: "USD" } }, "amount_mismatch"],
    ["foreign currency", { amount: { value: "43.00", currency_code: "EUR" } }, "currency_mismatch"],
    ["not completed", { status: "PENDING" }, "status_not_completed"],
  ];

  for (const [label, over, reason] of cases) {
    it(`records an incident for ${label} and does not finalize`, async () => {
      stubFetch(() => ({ status: 201, body: captureBody(over) }));
      const db = fakeSupabase();
      const res = await finalizeLeadPayPalAttempt(db, attempt, opts());
      expect(res).toMatchObject({ kind: "incident", reason });
      expect(db.rpcCalls).toHaveLength(0);
      expect(db.writes.some((w) => w.table === "payment_incidents")).toBe(true);
    });
  }

  it("records an incident when the money landed in a foreign account", async () => {
    stubFetch(() => ({
      status: 201,
      body: { id: "PP-1", purchase_units: [{ payee: { merchant_id: "ATTACKER" }, payments: { captures: [{ id: "CAP-1", status: "COMPLETED", amount: { value: "43.00", currency_code: "USD" } }] } }] },
    }));
    const db = fakeSupabase();
    const res = await finalizeLeadPayPalAttempt(db, attempt, opts());
    expect(res).toMatchObject({ kind: "incident", reason: "payee_mismatch" });
    expect(db.rpcCalls).toHaveLength(0);
  });

  it("refuses an attempt with no provider order id", async () => {
    const res = await finalizeLeadPayPalAttempt(fakeSupabase(), { ...attempt, provider_order_id: null }, opts());
    expect(res).toEqual({ kind: "incident", reason: "provider_order_missing" });
  });
});

describe("provider failures", () => {
  it("reports declined (the only 'not charged' state)", async () => {
    stubFetch(() => ({ status: 422, body: { details: [{ issue: "INSTRUMENT_DECLINED" }] } }));
    const db = fakeSupabase();
    expect(await finalizeLeadPayPalAttempt(db, attempt, opts())).toEqual({ kind: "declined" });
    expect(db.rpcCalls).toHaveLength(0);
  });

  it("recovers a payment PayPal already captured on an earlier attempt", async () => {
    stubFetch((url) =>
      url.endsWith("/capture")
        ? { status: 422, body: { details: [{ issue: "ORDER_ALREADY_CAPTURED" }] } }
        : { status: 200, body: captureBody() }
    );
    const res = await finalizeLeadPayPalAttempt(fakeSupabase(), attempt, opts());
    expect(res).toEqual({ kind: "finalized", orderId: "order-1" });
  });

  it("stays pending on a provider outage instead of guessing", async () => {
    stubFetch(() => ({ status: 500, body: "upstream error" }));
    const db = fakeSupabase();
    expect(await finalizeLeadPayPalAttempt(db, attempt, opts())).toEqual({ kind: "pending", outcome: "uncertain" });
    expect(db.rpcCalls).toHaveLength(0);
  });

  it("stays pending when the network call throws", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("connection reset"); }));
    expect(await finalizeLeadPayPalAttempt(fakeSupabase(), attempt, opts())).toEqual({ kind: "pending", outcome: "uncertain" });
  });
});

describe("post-capture database failure", () => {
  it("never claims success when the local write fails, and leaves it recoverable", async () => {
    stubFetch(() => ({ status: 201, body: captureBody() }));
    const db = fakeSupabase(() => ({ error: { message: "deadlock detected" } }));
    const res = await finalizeLeadPayPalAttempt(db, attempt, opts());
    expect(res).toEqual({ kind: "pending", outcome: "uncertain" });
    // captured status persisted first, so reconciliation can pick it up again
    expect(db.writes.some((w) => w.table === "paypal_lead_attempts" && JSON.stringify(w.payload).includes("captured"))).toBe(true);
    expect(db.writes.some((w) => w.table === "payment_incidents" && JSON.stringify(w.payload).includes("finalize_failed"))).toBe(true);
  });
});

describe("convergence outcomes from the database", () => {
  it("passes through 'already' idempotently", async () => {
    stubFetch(() => ({ status: 201, body: captureBody() }));
    const db = fakeSupabase(() => ({ data: { outcome: "already", order_id: "order-1" } }));
    expect(await finalizeLeadPayPalAttempt(db, attempt, opts())).toEqual({ kind: "already", orderId: "order-1" });
  });

  it("surfaces a distinct second payment as a duplicate for a human, with no refund attempted", async () => {
    const urls: string[] = [];
    stubFetch((url) => { urls.push(url); return { status: 201, body: captureBody() }; });
    const db = fakeSupabase(() => ({ data: { outcome: "duplicate", order_id: "order-1", incident_id: "inc-9" } }));
    const res = await finalizeLeadPayPalAttempt(db, attempt, opts());
    expect(res).toEqual({ kind: "duplicate", orderId: "order-1", incidentId: "inc-9" });
    expect(urls.some((u) => u.includes("refund"))).toBe(false);
  });

  it("reports an unknown database outcome as an incident, not a success", async () => {
    stubFetch(() => ({ status: 201, body: captureBody() }));
    const db = fakeSupabase(() => ({ data: { outcome: "missing_assets", reason: "missing_assets", incident_id: "inc-3" } }));
    expect(await finalizeLeadPayPalAttempt(db, attempt, opts())).toEqual({ kind: "incident", reason: "missing_assets", incidentId: "inc-3" });
  });
});
