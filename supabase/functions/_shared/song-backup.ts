// Shared helper: snapshot the current song file to a "-prev.mp3" slot in
// storage and return the values to write into the entity's prev_* columns.
//
// Used by both admin-initiated revisions (admin-orders/approve-revision) and
// customer self-service auto-approved revisions (submit-revision) so the
// "Restore Previous Version" button is consistently available afterward.
//
// Failure policy: callers decide. Admin path treats failure as fatal (blocks
// regeneration); customer auto-approve path treats failure as soft (logs and
// proceeds without a snapshot — better to ship the revision than to block).

// deno-lint-ignore no-explicit-any
type AnySupabase = any;

export interface BackupResult {
  backed_up: boolean;
  prev_song_url?: string | null;
  prev_automation_lyrics?: string | null;
  prev_cover_image_url?: string | null;
}

export async function backupSongFile(
  supabaseUrl: string,
  _supabaseServiceKey: string,
  supabase: AnySupabase,
  entityType: "orders" | "leads",
  entityId: string,
  entity: Record<string, unknown>,
): Promise<BackupResult> {
  const currentSongUrl = entityType === "orders"
    ? (entity.song_url as string | null)
    : (entity.full_song_url as string | null);

  if (!currentSongUrl) {
    console.log(`[BACKUP] No current song for ${entityType} ${entityId}, skipping backup`);
    return { backed_up: false };
  }

  const bucketBase = `${supabaseUrl}/storage/v1/object/public/songs/`;
  const path = currentSongUrl.includes(bucketBase)
    ? currentSongUrl.slice(currentSongUrl.indexOf(bucketBase) + bucketBase.length).split("?")[0]
    : null;

  if (!path) {
    // Non-bucket URL (e.g. legacy lead-hosted URL assigned to an order). The
    // original URL is permanent — point prev_* straight at it.
    console.warn(`[BACKUP] Non-bucket URL, using URL-as-snapshot fallback: ${currentSongUrl}`);
    return {
      backed_up: true,
      prev_song_url: currentSongUrl,
      prev_automation_lyrics: (entity.automation_lyrics as string | null) || null,
      prev_cover_image_url: (entity.cover_image_url as string | null) || null,
    };
  }

  const lastDot = path.lastIndexOf(".");
  const ext = lastDot !== -1 ? path.slice(lastDot) : ".mp3";
  const basePath = lastDot !== -1 ? path.slice(0, lastDot) : path;
  const prevPath = `${basePath}-prev${ext}`;

  console.log(`[BACKUP] Copying ${path} → ${prevPath}`);

  let fileBytes: ArrayBuffer;
  try {
    const downloadRes = await fetch(currentSongUrl);
    if (!downloadRes.ok) throw new Error(`Download failed: ${downloadRes.status}`);
    fileBytes = await downloadRes.arrayBuffer();
  } catch (e) {
    console.error(`[BACKUP] Failed to download song for backup:`, e);
    throw new Error("Could not back up current song.");
  }

  const { error: uploadError } = await supabase.storage
    .from("songs")
    .upload(prevPath, fileBytes, { contentType: "audio/mpeg", upsert: true });

  if (uploadError) {
    console.error(`[BACKUP] Failed to upload backup:`, uploadError);
    throw new Error("Could not upload song backup.");
  }

  const prevPublicUrl = `${supabaseUrl}/storage/v1/object/public/songs/${prevPath}`;
  console.log(`[BACKUP] ✅ Backup created at ${prevPath}`);

  return {
    backed_up: true,
    prev_song_url: prevPublicUrl,
    prev_automation_lyrics: (entity.automation_lyrics as string | null) || null,
    prev_cover_image_url: (entity.cover_image_url as string | null) || null,
  };
}