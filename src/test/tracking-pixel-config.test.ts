import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const html = readFileSync("index.html", "utf8");
const PIXEL = "1231290262288040";

describe("Meta pixel bootstrap", () => {
  const optOutIdx = html.indexOf(`fbq('optOut', '${PIXEL}', 'ESTRuleEngine')`);
  const setIdx = html.indexOf(`fbq('set', 'autoConfig', false, '${PIXEL}')`);
  const initIdx = html.indexOf(`fbq('init', '${PIXEL}')`);

  it("opts out of the EST rule engine (the click->Purchase rule) BEFORE init", () => {
    // Must precede init: the signals config opts in with respectExistingOptOut=true.
    expect(optOutIdx).toBeGreaterThan(-1);
    expect(initIdx).toBeGreaterThan(-1);
    expect(optOutIdx).toBeLessThan(initIdx);
  });

  it("disables automatic configuration BEFORE init", () => {
    expect(setIdx).toBeGreaterThan(-1);
    expect(setIdx).toBeLessThan(initIdx);
  });

  it("still sends the explicit PageView", () => {
    expect(html).toContain("fbq('track', 'PageView')");
  });

  it("does not fire Purchase from the markup", () => {
    expect(html).not.toContain("'Purchase'");
  });
});

describe("no page fires a standard Purchase for an add-on", () => {
  it("SongPlayer reports the package as a custom AddOnPurchase with an event id", () => {
    const src = readFileSync("src/pages/SongPlayer.tsx", "utf8");
    expect(src).toContain("trackMetaCustomEvent(");
    expect(src).toContain("'AddOnPurchase'");
    expect(src).toContain('addonEventId("pkg", pkgSession)');
    expect(src).not.toMatch(/trackMetaEvent\(\s*'Purchase'/);
  });

  it("server add-on CAPI calls name the event explicitly", () => {
    const src = readFileSync("supabase/functions/stripe-webhook/index.ts", "utf8");
    for (const kind of ["tip", "lyrics", "download", "bonus", "pkg", "rush"]) {
      expect(src).toContain(`eventId: \`addon_${kind}_\${session.id}\``);
    }
    // Every add-on call is labelled AddOnPurchase (6 of them).
    expect(src.match(/eventName: "AddOnPurchase"/g)?.length).toBe(6);
    // Base purchases keep the standard event and id.
    expect(src).toContain("eventId: `purchase_${newOrder.id}`");
  });
});
