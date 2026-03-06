import { useState, useRef, useCallback } from "react";
import { Heart, Upload, Video, Gift, CheckCircle, Music } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";

const MAX_FILE_SIZE = 150 * 1024 * 1024;

export default function ShareReaction() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFileSelect = useCallback((file: File) => {
    setError("");
    if (!file.type.startsWith("video/")) {
      setError("Please select a video file (MP4, MOV, or WebM).");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setError("Video must be under 150MB.");
      return;
    }
    setVideoFile(file);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }, [handleFileSelect]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!name.trim() || !email.trim() || !videoFile || !consent) {
      setError("Please fill in all required fields and accept the permission checkbox.");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      setError("Please enter a valid email address.");
      return;
    }

    setUploading(true);
    setUploadProgress(10);

    try {
      const formData = new FormData();
      formData.append("action", "direct-upload");
      formData.append("name", name.trim());
      formData.append("email", email.trim());
      if (orderNumber.trim()) formData.append("orderId", orderNumber.trim());
      formData.append("video", videoFile);

      // Simulate progress during upload
      const progressInterval = setInterval(() => {
        setUploadProgress((prev) => Math.min(prev + 5, 85));
      }, 500);

      const { data, error: fnError } = await supabase.functions.invoke(
        "upload-reaction",
        { body: formData }
      );

      clearInterval(progressInterval);

      if (fnError) {
        throw new Error(fnError.message || "Upload failed");
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      setUploadProgress(100);
      setTimeout(() => setSubmitted(true), 400);
    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again.");
      setUploadProgress(0);
    } finally {
      setUploading(false);
    }
  };

  // ── Thank You Screen ──
  if (submitted) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-5">
        <div className="text-center max-w-md mx-auto space-y-6">
          <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
            <Heart className="w-8 h-8 text-primary fill-primary" />
          </div>
          <h1 className="text-3xl font-bold text-primary">
            Thank you for sharing your moment with us
          </h1>
          <p className="text-muted-foreground text-lg leading-relaxed">
            Your video means the world to our small team. We'll review it soon and reach out if we'd love to feature it.
          </p>
          <p className="text-sm text-muted-foreground">
            Questions? Email us at{" "}
            <a href="mailto:support@personalsonggifts.com" className="text-primary underline">
              support@personalsonggifts.com
            </a>
          </p>
        </div>
      </div>
    );
  }

  // ── Main Page ──
  return (
    <div className="min-h-screen bg-background">
      {/* Minimal header */}
      <header className="px-5 py-4 flex items-center justify-between max-w-2xl mx-auto">
        <div className="flex items-center gap-2">
          <Music className="w-5 h-5 text-primary" />
          <span className="font-semibold text-primary text-sm">PersonalSongGifts</span>
        </div>
        <a
          href="mailto:support@personalsonggifts.com"
          className="text-xs text-muted-foreground hover:text-primary transition-colors"
        >
          Need help?
        </a>
      </header>

      <main className="px-5 pb-16 max-w-2xl mx-auto space-y-12">
        {/* Hero */}
        <section className="text-center pt-8 space-y-4">
          <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Heart className="w-6 h-6 text-primary" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-primary leading-tight">
            Share Your Reaction Video
          </h1>
          <p className="text-muted-foreground text-lg leading-relaxed max-w-lg mx-auto">
            Some of the most meaningful moments happen when someone hears their personalized song for the first time. We'd love to see those reactions.
          </p>
        </section>

        {/* Why We're Asking */}
        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-primary">Why We're Asking</h2>
          <p className="text-foreground leading-relaxed">
            We're a small team, and every reaction video reminds us why we do this. Seeing real reactions also helps others understand what these songs mean. Your moment might inspire someone else to create a gift for someone they love.
          </p>
        </section>

        {/* How It Works */}
        <section className="space-y-5">
          <h2 className="text-xl font-semibold text-primary">How It Works</h2>
          <div className="space-y-4">
            {[
              { icon: Upload, label: "Upload your reaction video below" },
              { icon: Video, label: "We may feature it on our website or social media" },
              { icon: Gift, label: "If we feature your video, you may be eligible for a gift card" },
            ].map((step, i) => (
              <div key={i} className="flex items-start gap-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm">
                  {i + 1}
                </div>
                <div className="flex items-center gap-3 pt-2">
                  <step.icon className="w-5 h-5 text-primary flex-shrink-0" />
                  <p className="text-foreground">{step.label}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Video Tips */}
        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-primary">What Makes a Great Video</h2>
          <ul className="space-y-2 text-foreground">
            {[
              "Vertical video preferred (best for social media)",
              "Phone recordings are perfect",
              "Try to capture the moment they realize the song is about them",
              "30 seconds to 2 minutes is ideal",
            ].map((tip, i) => (
              <li key={i} className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-primary mt-1 flex-shrink-0" />
                <span>{tip}</span>
              </li>
            ))}
          </ul>
          <p className="text-sm font-medium text-primary pt-1">
            No editing required. Authentic moments are best.
          </p>
        </section>

        {/* Submission Form */}
        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-primary">Submit Your Video</h2>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <label htmlFor="name" className="text-sm font-medium text-foreground">
                Name <span className="text-destructive">*</span>
              </label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                disabled={uploading}
                className="h-12 text-base"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="email" className="text-sm font-medium text-foreground">
                Email <span className="text-destructive">*</span>
              </label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                disabled={uploading}
                className="h-12 text-base"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="order" className="text-sm font-medium text-foreground">
                Order Number <span className="text-muted-foreground text-xs">(optional)</span>
              </label>
              <Input
                id="order"
                value={orderNumber}
                onChange={(e) => setOrderNumber(e.target.value)}
                placeholder="e.g. abc123"
                disabled={uploading}
                className="h-12 text-base"
              />
              <p className="text-xs text-muted-foreground">Don't worry if you don't have it.</p>
            </div>

            {/* Video upload area */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                Reaction Video <span className="text-destructive">*</span>
              </label>
              <div
                role="button"
                tabIndex={0}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click(); }}
                className={`
                  border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors
                  ${dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}
                  ${videoFile ? "bg-primary/5 border-primary/30" : ""}
                `}
              >
                {videoFile ? (
                  <div className="space-y-2">
                    <Video className="w-8 h-8 text-primary mx-auto" />
                    <p className="font-medium text-foreground text-sm truncate max-w-xs mx-auto">
                      {videoFile.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {(videoFile.size / (1024 * 1024)).toFixed(1)} MB
                    </p>
                    <p className="text-xs text-primary underline">Tap to change</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Upload className="w-8 h-8 text-muted-foreground mx-auto" />
                    <p className="text-foreground font-medium">Tap to select your video</p>
                    <p className="text-xs text-muted-foreground">or drag and drop here</p>
                    <p className="text-xs text-muted-foreground">MP4, MOV, or WebM · Max 150MB</p>
                  </div>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="video/mp4,video/quicktime,video/webm,video/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileSelect(file);
                }}
                disabled={uploading}
              />
              <p className="text-xs text-muted-foreground italic">
                Phone video is perfect. No editing needed.
              </p>
            </div>

            {/* Upload progress */}
            {uploading && (
              <div className="space-y-2">
                <Progress value={uploadProgress} className="h-2" />
                <p className="text-sm text-muted-foreground text-center">
                  Uploading{uploadProgress < 85 ? "..." : " almost done..."}
                </p>
              </div>
            )}

            {/* Consent */}
            <div className="flex items-start gap-3">
              <Checkbox
                id="consent"
                checked={consent}
                onCheckedChange={(v) => setConsent(v === true)}
                disabled={uploading}
                className="mt-0.5"
              />
              <label htmlFor="consent" className="text-sm text-foreground leading-snug cursor-pointer">
                I give permission for Personal Song Gifts to use this video in marketing, on our website, or on social media.
              </label>
            </div>

            {error && (
              <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-4 py-3">
                {error}
              </p>
            )}

            <Button
              type="submit"
              disabled={uploading || !name || !email || !videoFile || !consent}
              className="w-full h-14 text-lg font-semibold"
              size="lg"
            >
              {uploading ? "Uploading..." : "Submit Video"}
            </Button>

            <p className="text-xs text-muted-foreground text-center">
              Having trouble uploading? Email your video to{" "}
              <a href="mailto:support@personalsonggifts.com" className="text-primary underline">
                support@personalsonggifts.com
              </a>
            </p>
          </form>
        </section>
      </main>
    </div>
  );
}
