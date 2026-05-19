import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, RotateCcw, History, Music2, CheckCircle2, GitCompare } from "lucide-react";

export interface SongHistoryEntry {
  song_url: string;
  automation_lyrics: string | null;
  cover_image_url: string | null;
  snapshotted_at: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipientName: string;
  // Current version (separate from history)
  currentSongUrl: string | null;
  currentLyrics: string | null;
  currentCoverUrl: string | null;
  currentGeneratedAt: string | null;
  // Past versions, newest first (max 10)
  history: SongHistoryEntry[];
  // Caller-driven restore. Slot is 0-based index into `history`.
  onRestore: (slot: number) => Promise<void> | void;
  restoring: boolean;
}

function formatPST(iso: string | null | undefined): string {
  if (!iso) return "Unknown date";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime()) || d.getTime() === 0) return "Older version (pre-history)";
  return d.toLocaleString("en-US", {
    timeZone: "America/Los_Angeles",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }) + " PST";
}

// ---------- Diff helpers ----------

// LCS-based line diff. Returns an array of { type, text } where type is
// "same" | "add" (only in B) | "remove" (only in A).
type DiffOp = { type: "same" | "add" | "remove"; text: string };

function diffLines(a: string, b: string): DiffOp[] {
  const A = a.split("\n");
  const B = b.split("\n");
  const n = A.length;
  const m = B.length;
  // LCS table
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const ops: DiffOp[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) {
      ops.push({ type: "same", text: A[i] });
      i++; j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ type: "remove", text: A[i] });
      i++;
    } else {
      ops.push({ type: "add", text: B[j] });
      j++;
    }
  }
  while (i < n) ops.push({ type: "remove", text: A[i++] });
  while (j < m) ops.push({ type: "add", text: B[j++] });
  return ops;
}

function fileNameFromUrl(url: string | null): string {
  if (!url) return "—";
  try {
    const u = new URL(url);
    const last = u.pathname.split("/").filter(Boolean).pop() || url;
    return decodeURIComponent(last);
  } catch {
    return url.split("/").pop() || url;
  }
}

function MetaRow({
  label,
  selectedValue,
  currentValue,
  changed,
}: {
  label: string;
  selectedValue: string;
  currentValue: string;
  changed: boolean;
}) {
  return (
    <div className="grid grid-cols-[120px_1fr_1fr] gap-3 text-xs py-2 border-b last:border-0">
      <div className="font-medium text-muted-foreground">{label}</div>
      <div className={changed ? "text-rose-700 break-words" : "text-muted-foreground break-words"}>
        {selectedValue || <span className="italic">empty</span>}
      </div>
      <div className={changed ? "text-emerald-700 break-words" : "text-muted-foreground break-words"}>
        {currentValue || <span className="italic">empty</span>}
      </div>
    </div>
  );
}

function DiffDialog({
  open,
  onOpenChange,
  recipientName,
  selectedLabel,
  selectedTimestamp,
  currentTimestamp,
  selectedLyrics,
  currentLyrics,
  selectedCoverUrl,
  currentCoverUrl,
  selectedSongUrl,
  currentSongUrl,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipientName: string;
  selectedLabel: string;
  selectedTimestamp: string;
  currentTimestamp: string;
  selectedLyrics: string | null;
  currentLyrics: string | null;
  selectedCoverUrl: string | null;
  currentCoverUrl: string | null;
  selectedSongUrl: string | null;
  currentSongUrl: string | null;
}) {
  const ops = diffLines(selectedLyrics || "", currentLyrics || "");
  const added = ops.filter((o) => o.type === "add").length;
  const removed = ops.filter((o) => o.type === "remove").length;
  const lyricsUnchanged = added === 0 && removed === 0;

  const coverChanged = (selectedCoverUrl || "") !== (currentCoverUrl || "");
  const audioChanged = (selectedSongUrl || "") !== (currentSongUrl || "");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitCompare className="h-5 w-5 text-teal-600" />
            What changed — {recipientName}
          </DialogTitle>
          <DialogDescription>
            Comparing <span className="font-medium text-rose-700">{selectedLabel}</span>{" "}
            ({selectedTimestamp}) → <span className="font-medium text-emerald-700">Current</span>{" "}
            ({currentTimestamp}).
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 -mx-6 px-6">
          {/* Metadata diff */}
          <div className="rounded-lg border bg-card p-3 mb-4">
            <div className="grid grid-cols-[120px_1fr_1fr] gap-3 text-[11px] uppercase tracking-wide text-muted-foreground pb-2 border-b">
              <div>Field</div>
              <div className="text-rose-700">Selected</div>
              <div className="text-emerald-700">Current</div>
            </div>
            <MetaRow
              label="Snapshot"
              selectedValue={selectedTimestamp}
              currentValue={currentTimestamp}
              changed={selectedTimestamp !== currentTimestamp}
            />
            <MetaRow
              label="Audio file"
              selectedValue={fileNameFromUrl(selectedSongUrl)}
              currentValue={fileNameFromUrl(currentSongUrl)}
              changed={audioChanged}
            />
            <MetaRow
              label="Cover image"
              selectedValue={fileNameFromUrl(selectedCoverUrl)}
              currentValue={fileNameFromUrl(currentCoverUrl)}
              changed={coverChanged}
            />
            <MetaRow
              label="Lyrics length"
              selectedValue={`${(selectedLyrics || "").length} chars`}
              currentValue={`${(currentLyrics || "").length} chars`}
              changed={(selectedLyrics || "").length !== (currentLyrics || "").length}
            />
          </div>

          {/* Cover thumbnails when they differ */}
          {coverChanged && (
            <div className="flex gap-4 items-start mb-4">
              <div className="flex-1">
                <p className="text-xs font-medium text-rose-700 mb-1">Selected cover</p>
                {selectedCoverUrl ? (
                  <img src={selectedCoverUrl} alt="Selected cover" className="w-32 h-32 rounded border object-cover" />
                ) : (
                  <div className="w-32 h-32 rounded border bg-muted flex items-center justify-center">
                    <Music2 className="h-6 w-6 text-muted-foreground" />
                  </div>
                )}
              </div>
              <div className="flex-1">
                <p className="text-xs font-medium text-emerald-700 mb-1">Current cover</p>
                {currentCoverUrl ? (
                  <img src={currentCoverUrl} alt="Current cover" className="w-32 h-32 rounded border object-cover" />
                ) : (
                  <div className="w-32 h-32 rounded border bg-muted flex items-center justify-center">
                    <Music2 className="h-6 w-6 text-muted-foreground" />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Lyrics diff */}
          <div className="rounded-lg border bg-card overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/40">
              <h4 className="text-sm font-semibold">Lyrics diff</h4>
              <div className="flex items-center gap-2 text-xs">
                <Badge variant="outline" className="text-rose-700 border-rose-300">
                  −{removed}
                </Badge>
                <Badge variant="outline" className="text-emerald-700 border-emerald-300">
                  +{added}
                </Badge>
              </div>
            </div>
            {lyricsUnchanged ? (
              <div className="px-3 py-6 text-sm text-muted-foreground italic text-center">
                Lyrics are identical between these two versions.
              </div>
            ) : (
              <pre className="text-xs font-mono leading-relaxed whitespace-pre-wrap">
                {ops.map((op, idx) => {
                  const cls =
                    op.type === "add"
                      ? "block bg-emerald-50 text-emerald-900 px-3 py-0.5 border-l-2 border-emerald-400"
                      : op.type === "remove"
                      ? "block bg-rose-50 text-rose-900 px-3 py-0.5 border-l-2 border-rose-400"
                      : "block text-muted-foreground px-3 py-0.5 border-l-2 border-transparent";
                  const prefix = op.type === "add" ? "+ " : op.type === "remove" ? "− " : "  ";
                  return (
                    <span key={idx} className={cls}>
                      {prefix}
                      {op.text || " "}
                    </span>
                  );
                })}
              </pre>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function VersionCard({
  label,
  isCurrent,
  timestamp,
  songUrl,
  coverUrl,
  lyrics,
  onRestore,
  onCompare,
  restoring,
  pendingSlot,
  slot,
}: {
  label: string;
  isCurrent: boolean;
  timestamp: string;
  songUrl: string | null;
  coverUrl: string | null;
  lyrics: string | null;
  onRestore?: () => void;
  onCompare?: () => void;
  restoring: boolean;
  pendingSlot: number | null;
  slot: number | null;
}) {
  const [showFullLyrics, setShowFullLyrics] = useState(false);
  const lyricsPreview = lyrics ? lyrics.split("\n").slice(0, 4).join("\n") : "";
  const hasMore = lyrics ? lyrics.split("\n").length > 4 : false;
  const isThisRestoring = restoring && pendingSlot === slot;

  return (
    <div className="relative flex gap-4 pb-6">
      {/* Timeline rail */}
      <div className="flex flex-col items-center">
        <div
          className={`w-3 h-3 rounded-full mt-2 ring-4 ring-background ${
            isCurrent ? "bg-emerald-500" : "bg-teal-500"
          }`}
        />
        <div className="flex-1 w-px bg-border mt-1" />
      </div>

      {/* Card body */}
      <div className="flex-1 rounded-lg border bg-card p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="font-semibold text-sm">{label}</h4>
              {isCurrent && (
                <Badge variant="default" className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Live now
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{timestamp}</p>
          </div>
          {!isCurrent && (
            <div className="flex gap-2 shrink-0">
              {onCompare && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onCompare}
                  disabled={restoring}
                  className="text-slate-700 hover:bg-slate-50"
                >
                  <GitCompare className="h-3.5 w-3.5 mr-1.5" />
                  Compare
                </Button>
              )}
              {onRestore && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onRestore}
                  disabled={restoring}
                  className="text-teal-700 hover:bg-teal-50 border-teal-300"
                >
                  {isThisRestoring ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  {isThisRestoring ? "Restoring..." : "Restore"}
                </Button>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-3 items-start">
          {coverUrl ? (
            <img
              src={coverUrl}
              alt={`${label} cover`}
              className="w-16 h-16 rounded object-cover border shrink-0"
              loading="lazy"
            />
          ) : (
            <div className="w-16 h-16 rounded border bg-muted flex items-center justify-center shrink-0">
              <Music2 className="h-6 w-6 text-muted-foreground" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            {songUrl ? (
              <audio src={songUrl} controls preload="none" className="w-full h-10" />
            ) : (
              <p className="text-xs text-muted-foreground italic">No audio file recorded</p>
            )}
          </div>
        </div>

        {lyrics && lyrics.trim().length > 0 && (
          <div className="mt-3 pt-3 border-t">
            <pre className="text-xs whitespace-pre-wrap font-sans text-muted-foreground leading-relaxed">
              {showFullLyrics ? lyrics : lyricsPreview}
            </pre>
            {hasMore && (
              <button
                onClick={() => setShowFullLyrics((v) => !v)}
                className="text-xs text-teal-600 hover:text-teal-700 mt-1.5 font-medium"
              >
                {showFullLyrics ? "Show less" : "Show full lyrics"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function SongVersionTimeline({
  open,
  onOpenChange,
  recipientName,
  currentSongUrl,
  currentLyrics,
  currentCoverUrl,
  currentGeneratedAt,
  history,
  onRestore,
  restoring,
}: Props) {
  const [pendingSlot, setPendingSlot] = useState<number | null>(null);
  const [diffSlot, setDiffSlot] = useState<number | null>(null);

  const handleRestore = async (slot: number) => {
    setPendingSlot(slot);
    try {
      await onRestore(slot);
    } finally {
      setPendingSlot(null);
    }
  };

  const diffEntry = diffSlot !== null ? history[diffSlot] : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5 text-teal-600" />
            Version History — {recipientName}
          </DialogTitle>
          <DialogDescription>
            Up to the last 10 versions are kept. Restoring swaps the selected version
            into the live slot — the current version becomes a history entry, so you
            can always switch back.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 -mx-6 px-6">
          <div className="pt-2">
            <VersionCard
              label="Current version"
              isCurrent
              timestamp={formatPST(currentGeneratedAt)}
              songUrl={currentSongUrl}
              coverUrl={currentCoverUrl}
              lyrics={currentLyrics}
              restoring={restoring}
              pendingSlot={pendingSlot}
              slot={null}
            />
            {history.length === 0 ? (
              <div className="text-sm text-muted-foreground italic py-6 text-center">
                No previous versions yet. New snapshots are created automatically
                whenever the song is regenerated.
              </div>
            ) : (
              history.map((entry, idx) => (
                <VersionCard
                  key={`${entry.song_url}-${idx}`}
                  label={`Version snapshot · slot ${idx + 1}${idx === 0 ? " (most recent)" : ""}`}
                  isCurrent={false}
                  timestamp={formatPST(entry.snapshotted_at)}
                  songUrl={entry.song_url}
                  coverUrl={entry.cover_image_url}
                  lyrics={entry.automation_lyrics}
                  onRestore={() => handleRestore(idx)}
                  onCompare={() => setDiffSlot(idx)}
                  restoring={restoring}
                  pendingSlot={pendingSlot}
                  slot={idx}
                />
              ))
            )}
          </div>
        </ScrollArea>
      </DialogContent>
      {diffEntry && (
        <DiffDialog
          open={diffSlot !== null}
          onOpenChange={(o) => { if (!o) setDiffSlot(null); }}
          recipientName={recipientName}
          selectedLabel={`Slot ${(diffSlot ?? 0) + 1}`}
          selectedTimestamp={formatPST(diffEntry.snapshotted_at)}
          currentTimestamp={formatPST(currentGeneratedAt)}
          selectedLyrics={diffEntry.automation_lyrics}
          currentLyrics={currentLyrics}
          selectedCoverUrl={diffEntry.cover_image_url}
          currentCoverUrl={currentCoverUrl}
          selectedSongUrl={diffEntry.song_url}
          currentSongUrl={currentSongUrl}
        />
      )}
    </Dialog>
  );
}