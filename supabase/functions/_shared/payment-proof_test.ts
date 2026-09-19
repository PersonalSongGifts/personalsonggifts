import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  capiEventTimeSeconds,
  paypalPaymentProof,
  stripePaymentProof,
  UNAVAILABLE_PROOF,
} from "./payment-proof.ts";

Deno.test("Stripe proof uses the charge's created time, never the session's", () => {
  const created = Math.floor(Date.parse("2026-09-19T10:00:00Z") / 1000);
  const proof = stripePaymentProof({
    created: Math.floor(Date.parse("2026-01-01T00:00:00Z") / 1000), // session creation — must be ignored
    amount_total: 5300,
    currency: "usd",
    payment_intent: { latest_charge: { created } },
  });
  assertEquals(proof.paidAt, "2026-09-19T10:00:00.000Z");
  assertEquals(proof.paidAtSource, "provider");
  assertEquals(proof.paidTotalCents, 5300);
  assertEquals(proof.paidCurrency, "USD");
});

Deno.test("Stripe proof without an expanded charge reports no time but stays 'provider'", () => {
  const proof = stripePaymentProof({ amount_total: 0, currency: "usd", payment_intent: null });
  assertEquals(proof.paidAt, null);
  assertEquals(proof.paidAtSource, "provider");
  assertEquals(proof.paidTotalCents, 0);
});

Deno.test("Stripe proof is soft on garbage input", () => {
  assertEquals(stripePaymentProof(undefined).paidAt, null);
  assertEquals(stripePaymentProof({ payment_intent: "pi_1", amount_total: "x" }).paidTotalCents, null);
});

Deno.test("PayPal proof reads the COMPLETED capture's create_time and amount", () => {
  const proof = paypalPaymentProof({
    purchase_units: [{
      payments: {
        captures: [
          { status: "DECLINED", create_time: "2026-09-19T09:00:00Z", amount: { value: "29.00", currency_code: "USD" } },
          { status: "COMPLETED", create_time: "2026-09-19T11:30:00Z", amount: { value: "53.00", currency_code: "usd" } },
        ],
      },
    }],
  });
  assertEquals(proof.paidAt, "2026-09-19T11:30:00.000Z");
  assertEquals(proof.paidTotalCents, 5300);
  assertEquals(proof.paidCurrency, "USD");
});

Deno.test("PayPal proof without captures is unavailable", () => {
  assertEquals(paypalPaymentProof({ purchase_units: [{}] }), UNAVAILABLE_PROOF);
  assertEquals(paypalPaymentProof(null), UNAVAILABLE_PROOF);
});

Deno.test("CAPI event_time is stable for the same provider time and falls back to the Stripe event", () => {
  const paidAt = "2026-09-19T10:00:00Z";
  const a = capiEventTimeSeconds(paidAt);
  const b = capiEventTimeSeconds(paidAt);
  assertEquals(a, b);
  assertEquals(a, Math.floor(Date.parse(paidAt) / 1000));
  assertEquals(capiEventTimeSeconds(null, 1789788174), 1789788174);
  assertEquals(capiEventTimeSeconds(null, 0), undefined);
  assertEquals(capiEventTimeSeconds("garbage"), undefined);
});
