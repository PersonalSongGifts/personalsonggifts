import {
  assertEquals,
  assert,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildLeadAssetPatch,
  shouldDispatchDelivery,
  isConvertedOrderMissingAssets,
} from "../_shared/lead-conversion.ts";
import {
  buildLeadCheckoutAmounts,
  hasReadyLeadBonus,
  resolveLeadCheckoutAmounts,
} from "../_shared/lead-checkout.ts";

const FROZEN = new Date("2026-05-04T12:00:00.000Z");

const fullLead = {
  full_song_url: "https://cdn.example/song.mp3",
  song_title: "For Mom",
  cover_image_url: "https://cdn.example/cover.jpg",
  automation_lyrics: "Verse 1...\nChorus...",
  prev_song_url: null,
  prev_automation_lyrics: null,
  prev_cover_image_url: null,
};

Deno.test("lead_session path: full song lead → patch copies all assets and marks delivered", () => {
  const patch = buildLeadAssetPatch(fullLead, FROZEN);
  assert(patch, "patch must not be null when full_song_url present");
  assertEquals(patch!.song_url, fullLead.full_song_url);
  assertEquals(patch!.song_title, fullLead.song_title);
  assertEquals(patch!.cover_image_url, fullLead.cover_image_url);
  assertEquals(patch!.automation_lyrics, fullLead.automation_lyrics);
  assertEquals(patch!.automation_status, "completed");
  assertEquals(patch!.status, "delivered");
  assertEquals(patch!.delivered_at, FROZEN.toISOString());
  assert(shouldDispatchDelivery(fullLead), "delivery email must fire");
});

Deno.test("stripe_session path: standard checkout fingerprint-matched lead with full song copies the same asset bundle", () => {
  // Simulates the formerly-broken path: standard webhook found a matching
  // lead via fingerprint and now must NOT ship a blank order.
  const patch = buildLeadAssetPatch(fullLead, FROZEN);
  assert(patch);
  assert(patch!.song_url, "song_url must be populated");
  assert(patch!.automation_lyrics, "automation_lyrics must be populated");
  assert(patch!.cover_image_url, "cover_image_url must be populated");
  assertEquals(patch!.status, "delivered");
  assert(shouldDispatchDelivery(fullLead), "send-song-delivery must be invoked");
});

Deno.test("lyrics-only lead → patch copies lyrics, sets lyrics_ready, no delivery", () => {
  const lyricsOnly = { ...fullLead, full_song_url: null, song_title: null, cover_image_url: null };
  const patch = buildLeadAssetPatch(lyricsOnly, FROZEN);
  assert(patch);
  assertEquals(patch!.song_url, null);
  assertEquals(patch!.automation_lyrics, lyricsOnly.automation_lyrics);
  assertEquals(patch!.automation_status, "lyrics_ready");
  assertEquals(patch!.status, undefined);
  assertEquals(patch!.delivered_at, undefined);
  assertEquals(shouldDispatchDelivery(lyricsOnly), false);
});

Deno.test("empty lead → no patch, no delivery", () => {
  const empty = {};
  assertEquals(buildLeadAssetPatch(empty, FROZEN), null);
  assertEquals(shouldDispatchDelivery(empty), false);
});

Deno.test("prev_* snapshot fields are copied through", () => {
  const withSnap = {
    ...fullLead,
    prev_song_url: "https://cdn.example/prev.mp3",
    prev_automation_lyrics: "old lyrics",
    prev_cover_image_url: "https://cdn.example/prev.jpg",
  };
  const patch = buildLeadAssetPatch(withSnap, FROZEN);
  assertEquals(patch!.prev_song_url, withSnap.prev_song_url);
  assertEquals(patch!.prev_automation_lyrics, withSnap.prev_automation_lyrics);
  assertEquals(patch!.prev_cover_image_url, withSnap.prev_cover_image_url);
});

Deno.test("ready lead bonus assets transfer with the converted order", () => {
  const withBonus = {
    ...fullLead,
    bonus_song_url: "https://cdn.example/bonus.mp3",
    bonus_preview_url: "https://cdn.example/bonus-preview.mp3",
    bonus_song_title: "For Mom (Acoustic)",
    bonus_cover_image_url: "https://cdn.example/bonus-cover.jpg",
    bonus_style_prompt: "Acoustic",
    bonus_automation_status: "completed",
    bonus_automation_task_id: "task_bonus_123",
  };
  const patch = buildLeadAssetPatch(withBonus, FROZEN);
  assertEquals(patch!.bonus_song_url, withBonus.bonus_song_url);
  assertEquals(patch!.bonus_preview_url, withBonus.bonus_preview_url);
  assertEquals(patch!.bonus_song_title, withBonus.bonus_song_title);
  assertEquals(patch!.bonus_cover_image_url, withBonus.bonus_cover_image_url);
  assertEquals(patch!.bonus_style_prompt, withBonus.bonus_style_prompt);
  assertEquals(patch!.bonus_automation_status, "completed");
  assertEquals(patch!.bonus_automation_task_id, "task_bonus_123");
});

Deno.test("when lead has no prev_*, fall back to live assets so Restore Previous Version always works", () => {
  // Regression for the bug where lead-converted orders had no prev_song_url
  // and the admin Restore button was hidden. The patch must seed prev_* with
  // the lead's live assets when its own prev slots are empty.
  const patch = buildLeadAssetPatch(fullLead, FROZEN);
  assertEquals(patch!.prev_song_url, fullLead.full_song_url);
  assertEquals(patch!.prev_automation_lyrics, fullLead.automation_lyrics);
  assertEquals(patch!.prev_cover_image_url, fullLead.cover_image_url);
});

Deno.test("monitor: converted order missing song_url is flagged", () => {
  assertEquals(
    isConvertedOrderMissingAssets({ status: "paid", song_url: null, automation_lyrics: "x" }),
    true,
  );
  assertEquals(
    isConvertedOrderMissingAssets({ status: "delivered", song_url: "x", automation_lyrics: null }),
    true,
  );
  assertEquals(
    isConvertedOrderMissingAssets({ status: "delivered", song_url: "x", automation_lyrics: "y" }),
    false,
  );
  assertEquals(
    isConvertedOrderMissingAssets({ status: "pending", song_url: null, automation_lyrics: null }),
    false,
  );
});

Deno.test("lead package pricing records the base song and package separately", () => {
  assertEquals(buildLeadCheckoutAmounts(2900, false), {
    baseCents: 2900,
    packageCents: 0,
    totalCents: 2900,
    hasForeverMemory: false,
  });
  assertEquals(buildLeadCheckoutAmounts(2900, true), {
    baseCents: 2900,
    packageCents: 2400,
    totalCents: 5300,
    hasForeverMemory: true,
  });
  assertEquals(buildLeadCheckoutAmounts(1999, true), {
    baseCents: 1999,
    packageCents: 2400,
    totalCents: 4399,
    hasForeverMemory: true,
  });
});

Deno.test("paid Stripe lead sessions resolve exact package ledger amounts", () => {
  assertEquals(resolveLeadCheckoutAmounts(5300, {
    offerPriceCents: "2900",
    forever_memory: "true",
    package_price_cents: "2400",
  }), {
    baseCents: 2900,
    packageCents: 2400,
    totalCents: 5300,
    hasForeverMemory: true,
  });
  assertEquals(resolveLeadCheckoutAmounts(4399, {
    offerPriceCents: "1999",
    forever_memory: "true",
    package_price_cents: "2400",
  }), {
    baseCents: 1999,
    packageCents: 2400,
    totalCents: 4399,
    hasForeverMemory: true,
  });
  assertEquals(resolveLeadCheckoutAmounts(2900, { offerPriceCents: "2900" }), {
    baseCents: 2900,
    packageCents: 0,
    totalCents: 2900,
    hasForeverMemory: false,
  });
});

Deno.test("malformed package metadata and underpaid totals are rejected", () => {
  assertEquals(resolveLeadCheckoutAmounts(5300, {
    offerPriceCents: "2900",
    forever_memory: "true",
    package_price_cents: "1",
  }), null);
  assertEquals(resolveLeadCheckoutAmounts(2300, {
    offerPriceCents: "2900",
    forever_memory: "true",
    package_price_cents: "2400",
  }), null);
});

Deno.test("a lead package can only be sold after its bonus file exists", () => {
  assertEquals(hasReadyLeadBonus({ bonus_song_url: "https://cdn.example/bonus.mp3" }), true);
  assertEquals(hasReadyLeadBonus({ bonus_song_url: "   " }), false);
  assertEquals(hasReadyLeadBonus({ bonus_song_url: null }), false);
});
