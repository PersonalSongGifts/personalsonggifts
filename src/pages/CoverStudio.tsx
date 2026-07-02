import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";

const SUPA = import.meta.env.VITE_SUPABASE_URL;

export default function CoverStudio() {
  const { orderId } = useParams();
  const [search] = useSearchParams();
  const gated = search.get("preview") === "1";

  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "uploading" | "generating" | "ready" | "failed">("idle");
  const [aiUrl, setAiUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<number | null>(null);

  useEffect(() => () => { if (pollRef.current) window.clearInterval(pollRef.current); }, []);

  if (!gated) return null;
  if (!orderId) return <div className="p-8">Missing order id</div>;

  const startPolling = () => {
    if (pollRef.current) window.clearInterval(pollRef.current);
    pollRef.current = window.setInterval(async () => {
      try {
        const r = await fetch(`${SUPA}/functions/v1/check-album-cover`, {
          method: "POST", headers: { "Content-Type": "application/json" },
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
        method: "POST", headers: { "Content-Type": "application/json" },
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
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Cover Studio</h1>
          <p className="text-sm text-muted-foreground">Order {orderId.slice(0, 8).toUpperCase()} — preview only</p>
        </div>

        <div className="border rounded-lg p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">1. Upload a photo (JPEG/PNG/WebP, ≤8MB)</label>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); }}
            />
            {status === "uploading" && <p className="text-sm text-muted-foreground mt-2">Uploading…</p>}
          </div>
          <div>
            <Button
              onClick={handleGenerate}
              disabled={!photoUrl || status === "generating" || status === "uploading"}
            >
              {status === "generating" ? "Generating… (2–5 min)" : aiUrl ? "Regenerate" : "Generate Album Cover"}
            </Button>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="border rounded-lg p-4">
            <h2 className="font-semibold mb-2">Original photo (fallback)</h2>
            {photoUrl ? (
              <img src={photoUrl} alt="Original" className="w-full aspect-square object-cover rounded" />
            ) : (
              <div className="aspect-square bg-muted rounded flex items-center justify-center text-muted-foreground text-sm">
                No photo yet
              </div>
            )}
          </div>
          <div className="border rounded-lg p-4">
            <h2 className="font-semibold mb-2">AI album cover</h2>
            {aiUrl ? (
              <img src={aiUrl} alt="AI cover" className="w-full aspect-square object-cover rounded" />
            ) : (
              <div className="aspect-square bg-muted rounded flex items-center justify-center text-muted-foreground text-sm">
                {status === "generating" ? "Generating…" : "Not generated yet"}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}