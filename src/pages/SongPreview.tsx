import { useEffect, useState, useRef } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Play, Pause, Music, Lock, Check, Loader2, AlertCircle, Gift } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useActivePromo } from "@/hooks/useActivePromo";
import {
  computeOfferPricing,
  shouldShowUrgencyBanner,
  shouldShowExpiredNotice,
  formatUsd,
  MEMORY_PACKAGE_CENTS,
} from "@/lib/previewOffer";

interface PreviewData {
  recipientName: string;
  recipientType: string;
  occasion: string;
  genre: string;
  previewUrl: string;
  coverImageUrl: string | null;
  songTitle: string | null;
  // New generic targeted-promo fields (preferred)
  targetedPromoSlug?: string | null;
  targetedPromoEligible?: boolean;
  targetedPromoExpired?: boolean;
  targetedPromoPriceCents?: number | null;
  targetedPromoEndsAt?: string | null;
  /** Presentation only: true when the targeted promo allows urgency messaging. */
  targetedPromoShowBanner?: boolean;
  // Sitewide non-targeted promo (default lead price floor)
  sitewidePromoSlug?: string | null;
  sitewidePromoLeadPriceCents?: number | null;
  sitewidePromoEndsAt?: string | null;
  memoryPackageAvailable?: boolean;
  revisionToken?: string | null;
  revisionsLeft?: number;
  revisionPending?: boolean;
  /** True when the audio on this page is the version from BEFORE the change request. */
  isPreviousVersion?: boolean;
  previousVersionLabel?: string | null;
  canPurchase?: boolean;
  purchaseBlockReason?: string | null;
  versionNote?: string | null;
  // Back-compat (older server response)
  flash20Eligible?: boolean;
  flash20Expired?: boolean;
  flash20PriceCents?: number | null;
  flash20EndsAt?: string | null;
}

export default function SongPreview() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isFollowup = searchParams.get("followup") === "true";
  const isVday10 = searchParams.get("vday10") === "true";
  const promoParam = searchParams.get("promo");
  const { refetch: refetchPromo } = useActivePromo();
  
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(45);
  const [purchasing, setPurchasing] = useState(false);
  const [packageSelected, setPackageSelected] = useState(false);
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

  const handlePurchase = async () => {
    if (!token) return;
    
    setPurchasing(true);
    try {
      // Resolve which targeted promo (if any) the server says this lead can use.
      // Prefer the new generic field; fall back to legacy flash20 fields.
      const eligibleSlug = previewData?.targetedPromoEligible
        ? previewData?.targetedPromoSlug ?? null
        : (previewData?.flash20Eligible ? "flash20" : null);

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-lead-checkout`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            previewToken: token,
            applyFollowupDiscount: isFollowup,
            applyVday10Discount: isVday10,
            addons: {
              forever_memory: packageSelected,
            },
            // Only send promoSlug when server confirmed eligibility for a targeted promo,
            // OR a non-targeted promo param is in URL (rare, legacy).
            promoSlug: eligibleSlug ?? (promoParam && promoParam !== "flash20" ? promoParam : undefined),
          }),
        }
      );

      const data = await response.json();
      
      if (!response.ok) {
        if (data.error === "promo_expired") {
          toast({
            title: "This flash sale has ended",
            description: "Your song is still available at standard pricing.",
            variant: "destructive",
          });
          await refetchPromo();
          // Re-fetch preview so UI reflects the expired state
          window.location.reload();
          return;
        }
        if (data.error === "promo_not_eligible") {
          toast({
            title: "Offer not available",
            description: "Standard pricing applies — your song is ready when you are.",
            variant: "destructive",
          });
          await refetchPromo();
          setPurchasing(false);
          return;
        }
        if (data.error === "package_not_ready") {
          setPackageSelected(false);
          toast({
            title: "The package is still getting ready",
            description: "Your full song is ready now. The extra version will be available on your song page once it finishes.",
          });
          return;
        }
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

  // Pricing display is derived by the same shared ladder the server uses.
  // The charged amount is still recomputed server-side from the preview token.
  const pricing = computeOfferPricing({
    targetedPromoEligible: previewData.targetedPromoEligible,
    targetedPromoPriceCents:
      previewData.targetedPromoPriceCents ?? previewData.flash20PriceCents ?? null,
    sitewidePromoLeadPriceCents: previewData.sitewidePromoLeadPriceCents,
    isFollowup,
    packageSelected,
  });
  // The price this lead would otherwise pay — shown struck through when a
  // targeted promo price is cheaper.
  const ladderBaseCents = computeOfferPricing({
    sitewidePromoLeadPriceCents: previewData.sitewidePromoLeadPriceCents,
    isFollowup,
  }).baseCents;
  const displayedBaseCents = pricing.baseCents;
  const displayedTotalCents = pricing.totalCents;

  // Urgency messaging only when the promo itself allows a banner (show_banner=true).
  const showUrgencyBanner = shouldShowUrgencyBanner(previewData);
  const showExpiredNotice = shouldShowExpiredNotice(previewData);
  const urgencyPriceCents =
    previewData.targetedPromoPriceCents ?? previewData.flash20PriceCents ?? null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted">
      {/* Urgency banner — only for targeted promos configured with show_banner=true */}
      {showUrgencyBanner && typeof urgencyPriceCents === "number" && (
        <div className="py-3 px-4 text-center font-bold text-sm md:text-base bg-primary text-primary-foreground">
          🔥 72-hour flash sale — {formatUsd(urgencyPriceCents)} ends soon
        </div>
      )}
      {showExpiredNotice && (
        <div className="py-3 px-4 text-center text-sm bg-muted text-muted-foreground">
          The flash sale has ended — your song is still available at standard pricing.
        </div>
      )}

      {/* Header */}
      <div className={`${isVday10 ? "bg-gradient-to-r from-pink-600 to-rose-700" : "bg-primary"} text-primary-foreground py-8 px-4 text-center`}>
        <h1 className="text-2xl md:text-3xl font-bold mb-2">
          {isVday10 ? "💘" : "🎵"} Your Song is Ready!
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
              {previewData.isPreviousVersion && (
                <div className="mt-3 rounded-lg border border-border bg-muted/40 p-3 text-sm">
                  <p className="font-medium text-foreground">
                    {previewData.previousVersionLabel || "Previous version (before your change request)"}
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    {previewData.versionNote || "We're making your new version now. You can still play this one — the new one replaces it when it's ready."}
                  </p>
                </div>
              )}
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
            {isVday10 ? "💖 " : ""}Unlock Your Full Song
          </h3>

          {isVday10 && (
            <div className="bg-pink-50 border border-pink-300 rounded-lg p-4 text-center">
              <Badge className="bg-pink-500 text-white mb-2">
                Valentine's Day Special
              </Badge>
              <p className="text-lg font-semibold">
                $10 OFF — applied automatically at checkout 💖
              </p>
            </div>
          )}


          <Card
            className={`transition-shadow border-2 max-w-md mx-auto ${isVday10 ? "border-pink-300" : "border-primary/30"}`}
          >
            <CardContent className="p-6 text-center space-y-4">
              <div>
                {pricing.targetedPriceActive && ladderBaseCents > displayedBaseCents && (
                  <p className="text-sm text-muted-foreground line-through">
                    {formatUsd(ladderBaseCents)} USD
                  </p>
                )}
                <h4 className="text-lg font-semibold">Full Song</h4>
                <p className={`text-3xl font-bold ${isVday10 ? "text-pink-600" : "text-primary"}`}>
                  {formatUsd(displayedBaseCents)}
                  <span className="text-sm font-normal text-muted-foreground ml-1">USD</span>
                </p>
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

              {previewData.memoryPackageAvailable && (
                <div
                  className={`rounded-lg border p-4 text-left transition-colors ${
                    packageSelected ? "border-primary bg-primary/5" : "border-border"
                  }`}
                >
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Optional add-on
                  </p>
                  {/* Only this control and its own label toggle the add-on — taps or
                      scrolls anywhere else on the card never change the total. */}
                  <label
                    htmlFor="memory-package-toggle"
                    className="mt-2 flex min-h-[44px] cursor-pointer items-center gap-3"
                  >
                    <input
                      id="memory-package-toggle"
                      type="checkbox"
                      checked={packageSelected}
                      onChange={(e) => setPackageSelected(e.target.checked)}
                      className="h-6 w-6 shrink-0 cursor-pointer accent-primary"
                    />
                    <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 font-semibold text-foreground">
                      <Gift className="h-4 w-4 text-primary" aria-hidden="true" />
                      Forever Memory Package
                      <span className="text-primary">— $24.00 extra</span>
                    </span>
                  </label>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Printable lyric keepsake, a custom cover you create from your photo, full lyrics, and an included second version of the song.
                  </p>
                  {packageSelected && (
                    <button
                      type="button"
                      onClick={() => setPackageSelected(false)}
                      className="mt-2 min-h-[44px] text-sm font-medium text-primary underline"
                    >
                      Remove add-on
                    </button>
                  )}
                </div>
              )}

              {/* Always-visible line items so base price, add-on and total are unmistakable. */}
              <dl className="rounded-lg border border-border p-4 text-left text-sm">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Full song</dt>
                  <dd className="font-medium text-foreground">{formatUsd(displayedBaseCents)}</dd>
                </div>
                {previewData.memoryPackageAvailable && (
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <dt className="text-muted-foreground">Forever Memory Package</dt>
                    <dd className="font-medium text-foreground">
                      {packageSelected ? `+${formatUsd(MEMORY_PACKAGE_CENTS)}` : "Not added"}
                    </dd>
                  </div>
                )}
                <div className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-3">
                  <dt className="font-semibold text-foreground">Total today</dt>
                  <dd className="text-base font-bold text-foreground">
                    {formatUsd(displayedTotalCents)} <span className="text-xs font-normal text-muted-foreground">USD</span>
                  </dd>
                </div>
              </dl>


              <Button
                className={`w-full ${isVday10 ? "bg-pink-600 hover:bg-pink-700" : ""}`}
                size="lg"
                disabled={purchasing || previewData.canPurchase === false}
                onClick={handlePurchase}
              >
                {purchasing
                  ? "Loading..."
                  : previewData.canPurchase === false
                    ? "Available when your new version is ready"
                    : packageSelected
                      ? `Get Full Song + Package — ${formatUsd(displayedTotalCents)}`
                      : `Get Full Song — ${formatUsd(displayedBaseCents)}`}
              </Button>
              {previewData.canPurchase === false && previewData.versionNote && (
                <p className="text-center text-sm text-muted-foreground">{previewData.versionNote}</p>
              )}
            </CardContent>
          </Card>

          {previewData.revisionToken && (previewData.revisionPending || (previewData.revisionsLeft ?? 0) > 0) && (
            <div className="mx-auto max-w-md text-center text-sm text-muted-foreground">
              {previewData.revisionPending ? (
                <p>We&apos;re recording your song again with your changes. We&apos;ll email you the new version when it&apos;s ready — usually within a few hours.</p>
              ) : (
                <>
                  <Button
                    type="button"
                    variant="link"
                    className="h-auto px-0 text-sm font-normal"
                    onClick={() => navigate(`/song/revision/${previewData.revisionToken}`)}
                  >
                    Request changes (pronunciation, details or style) — free
                  </Button>
                  <p className="mt-1">
                    We record a brand-new version with your changes, so the melody and vocals will be different from this one.
                  </p>
                </>
              )}
            </div>
          )}

          {/* Promo Badge — only render when a real promo (flash or Valentine's/vday10) is active */}
          {(showUrgencyBanner || isVday10 || isFollowup) && (
            <div className="text-center">
              <Badge variant="outline" className={isVday10 ? "text-pink-600 border-pink-500" : "text-primary border-primary"}>
                {showUrgencyBanner
                  ? "⏳ 72-hour flash sale — act now"
                  : isVday10
                  ? isFollowup
                    ? "Valentine's Day Special + $10 off"
                    : "Valentine's Day Special"
                  : isFollowup ? "🎁 $10 off — already applied" : ""}
              </Badge>
            </div>
          )}
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
