import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Upload, Sparkles } from "lucide-react";

const SUPA = import.meta.env.VITE_SUPABASE_URL;

interface Props {
  orderId: string;
  initialAiUrl: string | null;
  initialPhotoUrl: string | null;
  initialStatus?: string | null;
  bonusAvailable?: boolean;
  bonusGenreLabel?: string;
  initialBonusAiUrl?: string | null;
  initialBonusStatus?: string | null;
}

type CoverStatus = "idle" | "uploading" | "generating" | "ready" | "failed";

export default function AlbumCoverStudio({
  orderId,
  initialAiUrl,
  initialPhotoUrl,
  initialStatus,
  bonusAvailable,
  bonusGenreLabel,
  initialBonusAiUrl,
  initialBonusStatus,
}: Props) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(initialPhotoUrl);
  const [aiUrl, setAiUrl] = useState<string | null>(initialAiUrl);
  const [status, setStatus] = useState<CoverStatus>(
    initialAiUrl
      ? "ready"
      : initialStatus === "generating"
        ? "generating"
        : initialStatus === "failed"
          ? "failed"
          : "idle"
  );
  const [bonusAiUrl, setBonusAiUrl] = useState<string | null>(initialBonusAiUrl || null);
  const [bonusStatus, setBonusStatus] = useState<CoverStatus>(
    initialBonusAiUrl
      ? "ready"
      : initialBonusStatus === "generating"
        ? "generating"
        : initialBonusStatus === "failed"
          ? "failed"
          : "idle"
  );
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<number | null>(null);
  const bonusPollRef = useRef<number | null>(null);
  const genreLabel = bonusGenreLabel || "Acoustic";

  useEffect(() => {
    if (initialStatus === "generating" && !initialAiUrl) startPolling();
    if (bonusAvailable && initialBonusStatus === "generating" && !initialBonusAiUrl) startBonusPolling();
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
      if (bonusPollRef.current) window.clearInterval(bonusPollRef.current);
    };
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

  const startBonusPolling = () => {
    if (bonusPollRef.current) window.clearInterval(bonusPollRef.current);
    bonusPollRef.current = window.setInterval(async () => {
      try {
        const r = await fetch(`${SUPA}/functions/v1/check-album-cover`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId, variant: "bonus" }),
        });
        const j = await r.json();
        if (j.status === "ready" && j.url) {
          setBonusAiUrl(j.url); setBonusStatus("ready");
          if (bonusPollRef.current) window.clearInterval(bonusPollRef.current);
        } else if (j.status === "failed") {
          setBonusStatus("failed");
          if (bonusPollRef.current) window.clearInterval(bonusPollRef.current);
        }
      } catch (e) {
        console.error("bonus poll error", e);
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

  const generateVariant = async (variant: "main" | "bonus") => {
    if (!photoUrl) return;
    if (variant === "bonus") { setBonusAiUrl(null); setBonusStatus("generating"); }
    else { setAiUrl(null); setStatus("generating"); }
    const body: Record<string, unknown> = { orderId, photoUrl };
    if (variant === "bonus") body.variant = "bonus";
    const r = await fetch(`${SUPA}/functions/v1/generate-album-cover`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || "Generate failed");
    if (variant === "bonus") startBonusPolling(); else startPolling();
  };

  const handleGenerate = async () => {
    if (!photoUrl) return;
    setError(null);
    try {
      const runVariant = (v: "main" | "bonus") =>
        generateVariant(v).catch((e) => {
          if (v === "bonus") setBonusStatus("failed"); else setStatus("failed");
          setError(e instanceof Error ? e.message : "Generate failed");
        });
      await Promise.all([
        runVariant("main"),
        ...(bonusAvailable ? [runVariant("bonus")] : []),
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generate failed");
    }
  };

  const regenerateOne = async (variant: "main" | "bonus") => {
    setError(null);
    try {
      await generateVariant(variant);
    } catch (e) {
      if (variant === "bonus") setBonusStatus("failed"); else setStatus("failed");
      setError(e instanceof Error ? e.message : "Generate failed");
    }
  };

  const anyReady = !!aiUrl || !!bonusAiUrl;
  const anyGenerating = status === "generating" || (bonusAvailable && bonusStatus === "generating");
  const primaryLabel = anyGenerating
    ? "Generating… (2–5 min)"
    : anyReady
      ? (bonusAvailable ? "Regenerate Covers" : "Regenerate")
      : (bonusAvailable ? "Generate Album Covers" : "Generate Album Cover");

  const renderCard = (opts: {
    title: string;
    caption: string;
    url: string | null;
    st: CoverStatus;
    variant: "main" | "bonus";
  }) => {
    const imgWrapClass = bonusAvailable
      ? "w-full aspect-square object-cover rounded"
      : "w-full max-w-md mx-auto aspect-square object-cover rounded";
    const placeholderClass = bonusAvailable
      ? "aspect-square w-full bg-muted rounded flex items-center justify-center text-muted-foreground text-sm text-center px-4"
      : "aspect-square max-w-md mx-auto bg-muted rounded flex items-center justify-center text-muted-foreground text-sm text-center px-4";
    return (
    <div className="border rounded-lg p-4">
      <p className="text-xs font-medium text-muted-foreground mb-3">{opts.title}</p>
      {opts.url ? (
        <img
          src={opts.url}
          alt={opts.title}
          className={imgWrapClass}
        />
      ) : (
        <div className={placeholderClass}>
          {opts.st === "generating" ? (
            <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Generating…</span>
          ) : opts.st === "failed" ? "Generation failed" : "—"}
        </div>
      )}
      <p className="text-sm text-muted-foreground text-center mt-3">{opts.caption}</p>
      {opts.st === "failed" && (
        <div className="text-center mt-2">
          <Button variant="ghost" size="sm" onClick={() => regenerateOne(opts.variant)}>
            Regenerate this one
          </Button>
        </div>
      )}
    </div>
    );
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
          disabled={status === "uploading" || anyGenerating}
          className="gap-2"
        >
          {status === "uploading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {photoUrl ? "Choose a different photo" : "Upload a photo (JPEG/PNG/WebP, ≤8MB)"}
        </Button>
        <Button
          onClick={handleGenerate}
          disabled={!photoUrl || anyGenerating || status === "uploading"}
          className="gap-2"
        >
          {anyGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {primaryLabel}
        </Button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {bonusAvailable ? (
        (aiUrl || bonusAiUrl || status === "generating" || bonusStatus === "generating" || status === "failed" || bonusStatus === "failed") ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {renderCard({
                title: "Song cover",
                caption: "On your song page and printable keepsake.",
                url: aiUrl,
                st: status,
                variant: "main",
              })}
              {renderCard({
                title: `${genreLabel} version cover`,
                caption: `On your ${genreLabel} version.`,
                url: bonusAiUrl,
                st: bonusStatus,
                variant: "bonus",
              })}
            </div>
            {photoUrl && (
              <div className="flex items-center gap-3 pt-2">
                <img src={photoUrl} alt="Source" className="w-20 h-20 object-cover rounded border" />
                <p className="text-xs text-muted-foreground">Made from this photo</p>
              </div>
            )}
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
                No photo yet
              </div>
            )}
          </div>
        )
      ) : aiUrl ? (
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