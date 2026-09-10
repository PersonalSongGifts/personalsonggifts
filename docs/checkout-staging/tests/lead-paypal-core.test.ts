/**
 * Pure offline tests for the staged PayPal-on-existing-song core.
 * No network, no database, no provider calls. Nothing here can touch production.
 *
 * Run: bunx vitest run --config docs/checkout-staging/vitest.config.ts
 */
import { describe, it, expect } from "vitest";
import {
  buildLeadQuoteSnapshot,
  buildPayPalRequestId,
  canCreateLeadPayPalOrder,
  canFinalizeExistingAttempt,
  classifyCaptureFailure,
  customerMessageFor,
  extractCaptureFacts,
  generateReturnSecret,
  hashReturnSecret,
  parseAmountToCents,
  quoteToPayPalAmount,
  QuoteError,
  returnSecretMatches,
  timingSafeHexEqual,
  verifyCapture,
} from "../shared/lead-paypal-core";

const assets = {
  fullSongUrl: "https://example.test/song.mp3",
  bonusSongUrl: "https://example.test/bonus.mp3",
  coverImageUrl: null,
  songTitle: "For Dana",
};
const flags = { followup: false, vday10: false, promoSlug: null };
const token = "abcdefghijklmnopqrstuvwxyz";

function quote(overrides: Partial<Parameters<typeof buildLeadQuoteSnapshot>[0]> = {}) {
  return buildLeadQuoteSnapshot({
    leadId: "lead-1",
    previewToken: token,
    baseCents: 1900,
    packageCents: 0,
    hasForeverMemory: false,
    assets,
    offerFlags: flags,
    ...overrides,
  });
}

describe("quote snapshot", () => {
  it("freezes base, package and total in USD", () => {
    const q = quote({ baseCents: 1900, packageCents: 2400, hasForeverMemory: true });
    expect(q.totalCents).toBe(4300);
    expect(q.currency).toBe("USD");
    expect(quoteToPayPalAmount(q)).toEqual({ currency_code: "USD", value: "43.00" });
  });

  it("refuses when the finished song does not exist", () => {
    expect(() => quote({ assets: { ...assets, fullSongUrl: null } })).toThrow(QuoteError);
  });

  it("refuses a package sale with no existing second version", () => {
    try {
      quote({ packageCents: 2400, hasForeverMemory: true, assets: { ...assets, bonusSongUrl: null } });
      throw new Error("should have thrown");
    } catch (e) {
      expect((e as QuoteError).code).toBe("package_not_ready");
    }
  });

  it("refuses a package flag that disagrees with the amount", () => {
    expect(() => quote({ hasForeverMemory: true, packageCents: 0 })).toThrow(/disagree/);
    expect(() => quote({ hasForeverMemory: false, packageCents: 2400 })).toThrow(/disagree/);
  });

  it("refuses zero totals, non-integer cents and short tokens", () => {
    expect(() => quote({ baseCents: 0 })).toThrow(/zero/);
    expect(() => quote({ baseCents: 19.5 as number })).toThrow(/integer/);
    expect(() => quote({ previewToken: "short" })).toThrow(/token/);
  });

  it("snapshots assets by value, not by reference", () => {
    const mutable = { ...assets };
    const q = buildLeadQuoteSnapshot({
      leadId: "lead-1", previewToken: token, baseCents: 1900, packageCents: 0,
      hasForeverMemory: false, assets: mutable, offerFlags: flags,
    });
    mutable.fullSongUrl = "https://evil.test/other.mp3";
    expect(q.assets.fullSongUrl).toBe("https://example.test/song.mp3");
  });
});

describe("return secret", () => {
  it("is hashed and matches only the original", async () => {
    const secret = generateReturnSecret();
    const hash = await hashReturnSecret(secret);
    expect(hash).toHaveLength(64);
    expect(hash).not.toContain(secret);
    expect(await returnSecretMatches(secret, hash)).toBe(true);
    expect(await returnSecretMatches(secret.slice(0, -1) + "0", hash)).toBe(false);
    expect(await returnSecretMatches(null, hash)).toBe(false);
    expect(await returnSecretMatches(secret, null)).toBe(false);
    expect(await returnSecretMatches("", "")).toBe(false);
  });

  it("produces distinct secrets", () => {
    expect(generateReturnSecret()).not.toBe(generateReturnSecret());
  });

  it("compares hex in constant-time shape", () => {
    expect(timingSafeHexEqual("aabb", "aabb")).toBe(true);
    expect(timingSafeHexEqual("aabb", "aabc")).toBe(false);
    expect(timingSafeHexEqual("aabb", "aab")).toBe(false);
    expect(timingSafeHexEqual("", "")).toBe(false);
  });
});

describe("PayPal-Request-Id", () => {
  it("is stable per attempt so replays collapse at the provider", () => {
    expect(buildPayPalRequestId("att-1")).toBe(buildPayPalRequestId("att-1"));
    expect(buildPayPalRequestId("att-1")).not.toBe(buildPayPalRequestId("att-2"));
    expect(() => buildPayPalRequestId("")).toThrow();
  });
});

describe("amount parsing", () => {
  it("accepts only well-formed money", () => {
    expect(parseAmountToCents("43.00")).toBe(4300);
    expect(parseAmountToCents("19")).toBe(1900);
    expect(parseAmountToCents("19.9")).toBe(1990);
    expect(parseAmountToCents("-19.00")).toBeNull();
    expect(parseAmountToCents("19.999")).toBeNull();
    expect(parseAmountToCents("abc")).toBeNull();
    expect(parseAmountToCents(null)).toBeNull();
  });
});

describe("capture verification", () => {
  const expected = { providerOrderId: "PP-1", totalCents: 4300, payeeMerchantId: "MERCH1" };
  const good = {
    providerOrderId: "PP-1", status: "COMPLETED", amountValue: "43.00",
    currencyCode: "USD", payeeMerchantId: "MERCH1", captureId: "CAP-1",
  };

  it("passes only when every clause holds", () => {
    const v = verifyCapture(good, expected);
    expect(v).toEqual({ ok: true, amountCents: 4300, captureId: "CAP-1" });
  });

  it("rejects a different provider order", () => {
    expect(verifyCapture({ ...good, providerOrderId: "PP-2" }, expected)).toMatchObject({ ok: false, reason: "order_mismatch" });
  });

  it("rejects a non-completed status", () => {
    expect(verifyCapture({ ...good, status: "PENDING" }, expected)).toMatchObject({ ok: false, reason: "status_not_completed" });
  });

  it("rejects non-USD", () => {
    expect(verifyCapture({ ...good, currencyCode: "EUR" }, expected)).toMatchObject({ ok: false, reason: "currency_mismatch" });
  });

  it("rejects any amount that is not the quoted total, high or low", () => {
    expect(verifyCapture({ ...good, amountValue: "19.00" }, expected)).toMatchObject({ ok: false, reason: "amount_mismatch" });
    expect(verifyCapture({ ...good, amountValue: "99.00" }, expected)).toMatchObject({ ok: false, reason: "amount_mismatch" });
  });

  it("rejects a foreign payee", () => {
    expect(verifyCapture({ ...good, payeeMerchantId: "SOMEONE_ELSE" }, expected)).toMatchObject({ ok: false, reason: "payee_mismatch" });
  });

  it("rejects a missing capture id", () => {
    expect(verifyCapture({ ...good, captureId: null }, expected)).toMatchObject({ ok: false, reason: "capture_id_missing" });
  });

  it("extracts facts from a realistic PayPal body", () => {
    const facts = extractCaptureFacts({
      id: "PP-1",
      purchase_units: [{
        payee: { merchant_id: "MERCH1" },
        payments: { captures: [{ id: "CAP-1", status: "COMPLETED", amount: { value: "43.00", currency_code: "USD" } }] },
      }],
    });
    expect(facts).toEqual({
      providerOrderId: "PP-1", status: "COMPLETED", amountValue: "43.00",
      currencyCode: "USD", payeeMerchantId: "MERCH1", captureId: "CAP-1",
    });
    expect(verifyCapture(facts, expected).ok).toBe(true);
  });

  it("treats a garbage body as unverifiable rather than acceptable", () => {
    expect(verifyCapture(extractCaptureFacts({}), expected).ok).toBe(false);
    expect(verifyCapture(extractCaptureFacts(null), expected).ok).toBe(false);
  });
});

describe("capture failure classification", () => {
  it("maps provider errors to outcomes", () => {
    expect(classifyCaptureFailure(422, '{"details":[{"issue":"ORDER_ALREADY_CAPTURED"}]}')).toBe("already_captured");
    expect(classifyCaptureFailure(422, '{"details":[{"issue":"INSTRUMENT_DECLINED"}]}')).toBe("declined");
    expect(classifyCaptureFailure(404, '{"name":"RESOURCE_NOT_FOUND"}')).toBe("order_not_found");
    expect(classifyCaptureFailure(422, '{"details":[{"issue":"ORDER_NOT_APPROVED"}]}')).toBe("not_approved");
    expect(classifyCaptureFailure(500, "gateway blew up")).toBe("uncertain");
    expect(classifyCaptureFailure(null, "network error")).toBe("uncertain");
    expect(classifyCaptureFailure(400, "something unrecognised")).toBe("uncertain");
  });

  it("only says no payment was taken when the instrument was declined", () => {
    expect(customerMessageFor("declined").body).toMatch(/No payment was taken/i);
    for (const outcome of ["uncertain", "already_captured"] as const) {
      expect(customerMessageFor(outcome).body).not.toMatch(/not charged|no payment was taken/i);
      expect(customerMessageFor(outcome).body).toMatch(/confirm|check/i);
    }
  });
});

describe("launch gating", () => {
  const ready = { creationFlagEnabled: true, attemptTableReady: true, payeeMerchantIdConfigured: true };

  it("allows creation only when flag, schema and payee config all hold", () => {
    expect(canCreateLeadPayPalOrder(ready).allowed).toBe(true);
    expect(canCreateLeadPayPalOrder({ ...ready, creationFlagEnabled: false }).allowed).toBe(false);
    expect(canCreateLeadPayPalOrder({ ...ready, attemptTableReady: false }).allowed).toBe(false);
    expect(canCreateLeadPayPalOrder({ ...ready, payeeMerchantIdConfigured: false }).allowed).toBe(false);
  });

  it("names every blocker", () => {
    const gate = canCreateLeadPayPalOrder({ creationFlagEnabled: false, attemptTableReady: false, payeeMerchantIdConfigured: false });
    expect(gate.blockers).toHaveLength(3);
  });

  it("never gates finalisation of an already-approved payment", () => {
    expect(canFinalizeExistingAttempt({ creationFlagEnabled: false, attemptTableReady: true, payeeMerchantIdConfigured: false })).toBe(true);
  });
});
