import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Upload, Sparkles } from "lucide-react";

const SUPA = import.meta.env.VITE_SUPABASE_URL;

interface Props {
  orderId: string;
  initialAiUrl: string | null;
  initialPhotoUrl: string | null;
  initialStatus?: string | null;
}

export default function AlbumCoverStudio({ orderId, initialAiUrl, initialPhotoUrl, initialStatus }: Props) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(initialPhotoUrl);
  const [aiUrl, setAiUrl] = useState<string | null>(initialAiUrl);
  const [status, setStatus] = useState<"idle" | "uploading" | "generating" | "ready" | "failed">(
    initialAiUrl ? "ready" : (initialStatus === "generating" ? "generating" : "idle")
  );
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    if (initialStatus === "generating" && !initialAiUrl) startPolling();
    return () => { if (pollRef.current) window.clearInterval(pollRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startPolling = () => {
    if (pollRef.current) window.clearInterval(pollRef.current);
    pollRef.current = window.setInterval(async () => {
      try {
        const r = await fetch(`${SUPA}/functions/v1/check-album-cover`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId }),
        });
        const j = await r.json();
        if (j.status === "ready" && j.url) {
          setAiUrl(j.url); setStatus("ready");
          if (pollRef.current) window.clearInterval(pollRef.current);
        } else if (j.status === "failed") {
          setStatus("failed"); setError("Generation failed. Try again.");
          if (pollRef.current) window.clearInterval(pollRef.current);
        }
      } catch (e) {
        console.error("poll error", e);
      }
    }, 8000);
  };

  const handleUpload = async (file: File) => {
    setError(null); setStatus("uploading");
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("orderId", orderId);
      const r = await fetch(`${SUPA}/functions/v1/upload-cover-photo`, { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Upload failed");
      setPhotoUrl(j.url);
      setStatus("idle");
    } catch (e) {
      setStatus("idle");
      setError(e instanceof Error ? e.message : "Upload failed");
    }
  };

  const handleGenerate = async () => {
    if (!photoUrl) return;
    setError(null); setAiUrl(null); setStatus("generating");
    try {
      const r = await fetch(`${SUPA}/functions/v1/generate-album-cover`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, photoUrl }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Generate failed");
      startPolling();
    } catch (e) {
      setStatus("failed");
      setError(e instanceof Error ? e.message : "Generate failed");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); }}
        />
        <Button
          variant="outline"
          onClick={() => fileRef.current?.click()}
          disabled={status === "uploading" || status === "generating"}
          className="gap-2"
        >
          {status === "uploading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {photoUrl ? "Choose a different photo" : "Upload a photo (JPEG/PNG/WebP, ≤8MB)"}
        </Button>
        <Button
          onClick={handleGenerate}
          disabled={!photoUrl || status === "generating" || status === "uploading"}
          className="gap-2"
        >
          {status === "generating" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {status === "generating" ? "Generating… (2–5 min)" : aiUrl ? "Regenerate" : "Generate Album Cover"}
        </Button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {aiUrl ? (
        <div className="space-y-4">
          <div className="border rounded-lg p-4">
            <p className="text-xs font-medium text-muted-foreground mb-3">Your album cover</p>
            <img
              src={aiUrl}
              alt="Your album cover"
              className="w-full max-w-md mx-auto aspect-square object-cover rounded"
            />
            <p className="text-sm text-muted-foreground text-center mt-3">
              This is now the cover on your song page and printable keepsake.
            </p>
            {photoUrl && (
              <div className="flex items-center gap-3 mt-4 pt-4 border-t">
                <img
                  src={photoUrl}
                  alt="Source"
                  className="w-20 h-20 object-cover rounded border"
                />
                <p className="text-xs text-muted-foreground">Made from this photo</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="border rounded-lg p-4">
          <p className="text-xs font-medium text-muted-foreground mb-3">
            {photoUrl ? "Your photo" : "Upload a photo to begin"}
          </p>
          {photoUrl ? (
            <img
              src={photoUrl}
              alt="Original"
              className="w-full max-w-md mx-auto aspect-square object-cover rounded"
            />
          ) : (
            <div className="aspect-square max-w-md mx-auto bg-muted rounded flex items-center justify-center text-muted-foreground text-sm text-center px-4">
              {status === "generating" ? "Generating…" : "No photo yet"}
            </div>
          )}
        </div>
      )}
    </div>
  );
}