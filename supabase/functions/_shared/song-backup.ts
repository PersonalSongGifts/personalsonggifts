// Shared helper: snapshot the current song file to a "-prev.mp3" slot in
// storage and return the values to write into the entity's prev_* columns.
//
// As of the "no song is ever overwritten" policy, every newly generated /
// uploaded song writes to a UNIQUE versioned storage path (e.g.
// `orders/<SHORTID>-full-<timestamp>.mp3`). Because the current file is now
// permanent and can never be clobbered by a future generation, a snapshot is
// just a pointer — we copy the URL into prev_song_url and the file stays
// where it is, forever. No download, no re-upload, no "-prev.mp3" slot.
//
// This guarantees unlimited revisions never destroy an earlier version.

// deno-lint-ignore no-explicit-any
type AnySupabase = any;

export interface SongHistoryEntry {
  song_url: string;
  automation_lyrics: string | null;
  cover_image_url: string | null;
  snapshotted_at: string;
}

export const SONG_HISTORY_MAX = 10;

export interface BackupResult {
  backed_up: boolean;
  prev_song_url?: string | null;
  prev_automation_lyrics?: string | null;
  prev_cover_image_url?: string | null;
  // New: full multi-slot history (newest first, capped at SONG_HISTORY_MAX).
  // Callers should write this to the entity's `song_history` column.
  song_history?: SongHistoryEntry[];
}

export async function backupSongFile(
  _supabaseUrl: string,
  _supabaseServiceKey: string,
  _supabase: AnySupabase,
  entityType: "orders" | "leads",
  entityId: string,
  entity: Record<string, unknown>,
): Promise<BackupResult> {
  const currentSongUrl = entityType === "orders"
    ? (entity.song_url as string | null)
    : (entity.full_song_url as string | null);

  if (!currentSongUrl) {
    console.log(`[BACKUP] No current song for ${entityType} ${entityId}, skipping snapshot`);
    return { backed_up: false };
  }

  // Pure pointer snapshot — the file at `currentSongUrl` is on a versioned
  // path (or a legacy permanent path) and will never be overwritten by a
  // subsequent generation. Just record the URL.
  const currentLyrics = (entity.automation_lyrics as string | null) || null;
  const currentCover = (entity.cover_image_url as string | null) || null;
  const existingHistory = Array.isArray(entity.song_history)
    ? (entity.song_history as SongHistoryEntry[])
    : [];
  const newEntry: SongHistoryEntry = {
    song_url: currentSongUrl,
    automation_lyrics: currentLyrics,
    cover_image_url: currentCover,
    snapshotted_at: new Date().toISOString(),
  };
  const nextHistory = [newEntry, ...existingHistory].slice(0, SONG_HISTORY_MAX);
  console.log(`[BACKUP] ✅ Pointer snapshot for ${entityType} ${entityId}: ${currentSongUrl} (history depth ${nextHistory.length})`);
  return {
    backed_up: true,
    prev_song_url: currentSongUrl,
    prev_automation_lyrics: currentLyrics,
    prev_cover_image_url: currentCover,
    song_history: nextHistory,
  };
}