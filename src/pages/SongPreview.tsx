import { useEffect, useState, useRef } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Play, Pause, Music, Lock, Check, Loader2, AlertCircle, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface PreviewData {
  recipientName: string;
  recipientType: string;
  occasion: string;
  genre: string;
  previewUrl: string;
  coverImageUrl: string | null;
  songTitle: string | null;
}

export default function SongPreview() {
  const { token } = useParams<{ token: string }>();
  const [searchParams] = useSearchParams();
  const isFollowup = searchParams.get("followup") === "true";
  const isVday10 = searchParams.get("vday10") === "true";
  
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(45);
  const [purchasing, setPurchasing] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const hasTrackedPlay = useRef(false);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    async function fetchPreview() {
      if (!token) {
        setError("Invalid preview link");
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-lead-preview?token=${token}`
        );

        if (!response.ok) {
          const data = await response.json();
          if (data.converted && data.orderId) {
            // Redirect to the full song page
            window.location.href = `/song/${data.orderId.slice(0, 8)}`;
            return;
          } else if (data.converted) {
            setError("This song has already been purchased! Check your email for the full song.");
          } else {
            setError(data.error || "Preview not found");
          }
          setLoading(false);
          return;
        }

        const data = await response.json();
        setPreviewData(data);
      } catch (e) {
        console.error("Failed to fetch preview:", e);
        setError("Failed to load preview");
      } finally {
        setLoading(false);
      }
    }

    fetchPreview();
  }, [token]);

  // Track playback error for diagnostics
  const trackPlaybackError = (errorName: string, errorMessage: string) => {
    if (!token || !previewData?.previewUrl) return;
    
    let songUrlHost = "";
    try {
      songUrlHost = new URL(previewData.previewUrl).host;
    } catch {
      songUrlHost = "invalid-url";
    }
    
    fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/track-song-engagement`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "lead",
        action: "error",
        token,
        errorDetails: {
          errorName,
          errorMessage,
          userAgent: navigator.userAgent,
          online: navigator.onLine,
          songUrlHost,
        },
      }),
    }).catch(console.error);
  };

  useEffect(() => {
    if (previewData?.previewUrl) {
      audioRef.current = new Audio(previewData.previewUrl);
      
      // Required for iOS Safari
      audioRef.current.setAttribute("playsinline", "true");
      audioRef.current.crossOrigin = "anonymous";
      
      audioRef.current.addEventListener("loadedmetadata", () => {
        setDuration(audioRef.current?.duration || 45);
      });

      audioRef.current.addEventListener("timeupdate", () => {
        setCurrentTime(audioRef.current?.currentTime || 0);
      });

      audioRef.current.addEventListener("ended", () => {
        setIsPlaying(false);
        setIsBuffering(false);
        setCurrentTime(0);
      });
      
      audioRef.current.addEventListener("playing", () => {
        setIsPlaying(true);
        setIsBuffering(false);
      });
      
      audioRef.current.addEventListener("pause", () => {
        setIsPlaying(false);
        setIsBuffering(false);
      });
      
      audioRef.current.addEventListener("waiting", () => {
        setIsBuffering(true);
      });
      
      audioRef.current.addEventListener("canplay", () => {
        setIsBuffering(false);
      });
      
      audioRef.current.addEventListener("error", (e) => {
        const audio = e.target as HTMLAudioElement;
        const error = audio.error;
        
        let message = "Failed to load preview";
        let errorCode = "UNKNOWN";
        
        if (error) {
          switch (error.code) {
            case MediaError.MEDIA_ERR_NETWORK:
              message = "Network error loading audio";
              errorCode = "MEDIA_ERR_NETWORK";
              break;
            case MediaError.MEDIA_ERR_DECODE:
              message = "Audio file is corrupted";
              errorCode = "MEDIA_ERR_DECODE";
              break;
            case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
              message = "Audio format not supported";
              errorCode = "MEDIA_ERR_SRC_NOT_SUPPORTED";
              break;
            default:
              errorCode = `MEDIA_ERR_${error.code}`;
          }
        }
        
        setAudioError(message);
        setIsBuffering(false);
        trackPlaybackError("MediaError", `${errorCode}: ${message}`);
      });

      return () => {
        audioRef.current?.pause();
        audioRef.current = null;
      };
    }
  }, [previewData?.previewUrl]);

  const togglePlayback = async () => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
      return; // State will update via event listener
    }
    
    setIsBuffering(true);
    setAudioError(null);
    
    try {
      await audioRef.current.play();
      // Track play event only once per session (fire-and-forget)
      if (token && !hasTrackedPlay.current) {
        hasTrackedPlay.current = true;
        fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/track-song-engagement`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "lead", action: "play", token }),
        }).catch((err) => console.error("Failed to track play:", err));
      }
    } catch (error) {
      const err = error as Error;
      console.error("Playback failed:", err);
      
      // Track the error for diagnostics
      trackPlaybackError(err.name || "UnknownError", err.message || "Unknown playback error");
      
      // User-friendly messages
      if (err.name === "NotAllowedError") {
        toast({
          title: "Tap again",
          description: "Tap the play button to start playback",
        });
      } else if (err.name === "NotSupportedError") {
        toast({
          title: "Format not supported",
          description: "This audio format is not supported on your device",
          variant: "destructive",
        });
        setAudioError("Audio format not supported on your device");
      } else {
        toast({
          title: "Playback failed",
          description: "Unable to play the preview. Please try again.",
          variant: "destructive",
        });
        setAudioError("Playback failed. Please try again.");
      }
      
      setIsBuffering(false);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const handlePurchase = async (tier: "standard" | "priority") => {
    if (!token) return;
    
    setPurchasing(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-lead-checkout`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            previewToken: token,
            tier,
            applyFollowupDiscount: isFollowup,
            applyVday10Discount: isVday10,
          }),
        }
      );

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || "Failed to create checkout");
      }

      // Redirect to Stripe
      window.location.href = data.url;
    } catch (e) {
      console.error("Checkout error:", e);
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : "Failed to start checkout",
        variant: "destructive",
      });
    } finally {
      setPurchasing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-muted flex items-center justify-center">
        <div className="text-center space-y-4">
          <Music className="h-12 w-12 mx-auto animate-pulse text-primary" />
          <p className="text-muted-foreground">Loading your preview...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-muted flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="py-12 text-center">
            <Music className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h1 className="text-xl font-semibold mb-2">Preview Unavailable</h1>
            <p className="text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!previewData) return null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted">
      {/* Header */}
      <div className="bg-primary text-primary-foreground py-8 px-4 text-center">
        <h1 className="text-2xl md:text-3xl font-bold mb-2">
          🎵 Your Song is Ready!
        </h1>
        <p className="text-primary-foreground/80">
          A personalized {previewData.occasion} song for {previewData.recipientName}
        </p>
      </div>

      <div className="container max-w-2xl mx-auto px-4 py-8 space-y-8">
        {/* Player Card */}
        <Card className="overflow-hidden">
          <div className="bg-gradient-to-br from-primary/10 to-secondary/10 p-8">
            {/* Cover Art */}
            <div className="w-48 h-48 mx-auto mb-6 rounded-xl overflow-hidden shadow-lg bg-muted">
              {previewData.coverImageUrl ? (
                <img
                  src={previewData.coverImageUrl}
                  alt="Song cover"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary to-secondary">
                  <Music className="h-20 w-20 text-primary-foreground/80" />
                </div>
              )}
            </div>

            {/* Song Info */}
            <div className="text-center mb-6">
              <h2 className="text-xl font-semibold">
                {previewData.songTitle || `Song for ${previewData.recipientName}`}
              </h2>
              <p className="text-muted-foreground">
                {previewData.genre} • {previewData.occasion}
              </p>
            </div>

            {/* Playback Controls */}
            <div className="space-y-4">
              {/* Audio Error Fallback */}
              {audioError && (
                <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 text-center">
                  <AlertCircle className="h-5 w-5 text-destructive mx-auto mb-1" />
                  <p className="text-sm text-destructive">{audioError}</p>
                </div>
              )}

              <div className="flex items-center justify-center gap-4">
                <Button
                  size="lg"
                  onClick={togglePlayback}
                  className="h-16 w-16 rounded-full"
                  disabled={isBuffering}
                >
                  {isBuffering ? (
                    <Loader2 className="h-8 w-8 animate-spin" />
                  ) : isPlaying ? (
                    <Pause className="h-8 w-8" />
                  ) : (
                    <Play className="h-8 w-8 ml-1" />
                  )}
                </Button>
              </div>

              {/* Progress Bar */}
              <div className="space-y-2">
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-200"
                    style={{ width: `${(currentTime / duration) * 100}%` }}
                  />
                </div>
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>{formatTime(currentTime)}</span>
                  <span>{formatTime(duration)}</span>
                </div>
              </div>

              {/* Preview Badge */}
              <div className="flex justify-center">
                <Badge variant="secondary" className="gap-1">
                  <Lock className="h-3 w-3" />
                  45-second preview
                </Badge>
              </div>
            </div>
          </div>
        </Card>

        {/* Pricing Card - Single option */}
        <div className="space-y-4">
          <h3 className="text-xl font-semibold text-center">
            Unlock Your Full Song
          </h3>

          {isVday10 && (
            <div className="bg-accent/10 border border-accent rounded-lg p-4 text-center">
              <Badge className="bg-accent text-accent-foreground mb-2">
                Valentine's Day Bonus
              </Badge>
              <p className="text-sm">
                An extra $10 off has been applied automatically.
              </p>
            </div>
          )}

          {isFollowup && !isVday10 && (
            <div className="bg-accent/10 border border-accent rounded-lg p-4 text-center">
              <Badge className="bg-accent text-accent-foreground mb-2">
                Bonus Applied
              </Badge>
              <p className="text-sm">
                Your FULLSONG code gives you an extra $5 off!
              </p>
            </div>
          )}

          <Card
            className="cursor-pointer hover:shadow-lg transition-shadow border-2 hover:border-primary max-w-md mx-auto"
            onClick={() => handlePurchase("standard")}
          >
            <CardContent className="p-6 text-center space-y-4">
              <div>
                <p className="text-sm text-muted-foreground line-through">$99.99</p>
                <p className="text-3xl font-bold text-primary">
                  {isVday10 && isFollowup
                    ? "$34.99"
                    : isVday10
                    ? "$39.99"
                    : isFollowup
                    ? "$44.99"
                    : "$49.99"}
                </p>
              </div>
              <div>
                <h4 className="font-semibold">Full Song</h4>
                <p className="text-sm text-muted-foreground">Instant access</p>
              </div>
              <ul className="text-sm space-y-2 text-left">
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-primary" />
                  Full song access
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-primary" />
                  Download and keep forever
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-primary" />
                  Share with anyone
                </li>
              </ul>
              <Button className="w-full" size="lg" disabled={purchasing}>
                {purchasing ? "Loading..." : "Get Full Song"}
              </Button>
            </CardContent>
          </Card>

          {/* Promo Badge */}
          <div className="text-center">
            <Badge variant="outline" className="text-primary border-primary">
              {isVday10
                ? isFollowup
                  ? "50% Off + $5 + $10 Bonus Applied"
                  : "50% Off + $10 Valentine's Bonus Applied"
                : isFollowup
                ? "50% Off + Extra $5 Auto-Applied"
                : "50% Off Auto-Applied"}
            </Badge>
          </div>
        </div>

        {/* Trust Elements */}
        <div className="text-center text-sm text-muted-foreground space-y-2">
          <p>✓ Secure payment via Stripe</p>
          <p>✓ Instant access after purchase</p>
          <p>✓ Questions? support@personalsonggifts.com</p>
        </div>
      </div>
    </div>
  );
}
