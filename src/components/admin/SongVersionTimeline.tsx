import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, RotateCcw, History, Music2, CheckCircle2 } from "lucide-react";

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

function VersionCard({
  label,
  isCurrent,
  timestamp,
  songUrl,
  coverUrl,
  lyrics,
  onRestore,
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
          {!isCurrent && onRestore && (
            <Button
              size="sm"
              variant="outline"
              onClick={onRestore}
              disabled={restoring}
              className="text-teal-700 hover:bg-teal-50 border-teal-300 shrink-0"
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

  const handleRestore = async (slot: number) => {
    setPendingSlot(slot);
    try {
      await onRestore(slot);
    } finally {
      setPendingSlot(null);
    }
  };

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
                  restoring={restoring}
                  pendingSlot={pendingSlot}
                  slot={idx}
                />
              ))
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}