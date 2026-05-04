/**
 * Canonical helpers for converting a lead → order at webhook time.
 *
 * Both Stripe webhook code paths (`lead_session:` and `stripe_session:`) MUST
 * funnel through these helpers so pre-generated assets (song_url,
 * automation_lyrics, cover art, prev_* snapshots) are always copied onto the
 * new order and the delivery email always fires when a song exists.
 *
 * Pure functions only — no I/O, no Supabase client. This makes them trivial
 * to unit test and prevents regression of the "blank order after lead
 * conversion" bug.
 */

export interface LeadAssetSource {
  full_song_url?: string | null;
  song_title?: string | null;
  cover_image_url?: string | null;
  automation_lyrics?: string | null;
  prev_song_url?: string | null;
  prev_automation_lyrics?: string | null;
  prev_cover_image_url?: string | null;
}

export interface OrderAssetPatch {
  song_url: string | null;
  song_title: string | null;
  cover_image_url: string | null;
  automation_lyrics: string | null;
  automation_status: string | null;
  prev_song_url: string | null;
  prev_automation_lyrics: string | null;
  prev_cover_image_url: string | null;
  status?: string;
  delivered_at?: string;
}

/**
 * Build the patch that copies a lead's pre-generated assets onto an existing
 * order (used by the standard `stripe_session:` path after fingerprint match).
 *
 * Returns null when the lead has nothing worth copying (no audio, no lyrics).
 */
export function buildLeadAssetPatch(
  lead: LeadAssetSource,
  now: Date = new Date(),
): OrderAssetPatch | null {
  const hasFullSong = !!lead.full_song_url;
  const hasLyrics = !!lead.automation_lyrics;
  if (!hasFullSong && !hasLyrics) return null;

  const patch: OrderAssetPatch = {
    song_url: lead.full_song_url ?? null,
    song_title: lead.song_title ?? null,
    cover_image_url: lead.cover_image_url ?? null,
    automation_lyrics: lead.automation_lyrics ?? null,
    automation_status: hasFullSong ? "completed" : (hasLyrics ? "lyrics_ready" : null),
    prev_song_url: lead.prev_song_url ?? null,
    prev_automation_lyrics: lead.prev_automation_lyrics ?? null,
    prev_cover_image_url: lead.prev_cover_image_url ?? null,
  };

  if (hasFullSong) {
    patch.status = "delivered";
    patch.delivered_at = now.toISOString();
  }
  return patch;
}

/**
 * Returns true when, after merging lead assets, the order has a full song
 * and the delivery email should be dispatched immediately.
 */
export function shouldDispatchDelivery(lead: LeadAssetSource): boolean {
  return !!lead.full_song_url;
}

/**
 * Sanity check used by the monitor: a converted order must have BOTH
 * a song_url AND automation_lyrics. Anything else is a regression.
 */
export interface ConvertedOrderShape {
  status?: string | null;
  song_url?: string | null;
  automation_lyrics?: string | null;
}

export function isConvertedOrderMissingAssets(o: ConvertedOrderShape): boolean {
  if (!o.status) return false;
  const isPaidLike = ["paid", "delivered", "ready"].includes(o.status);
  if (!isPaidLike) return false;
  return !o.song_url || !o.automation_lyrics;
}