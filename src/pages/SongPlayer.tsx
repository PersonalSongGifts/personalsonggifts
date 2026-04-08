import { useState, useRef, useEffect } from "react";
import { useActivePromo } from "@/hooks/useActivePromo";
import { useParams, Link, useSearchParams } from "react-router-dom";
import { Loader2, Play, Pause, Volume2, VolumeX, Share2, Copy, Gift, Music, Download, Facebook, Instagram, Mail, MessageCircle, Youtube, AlertCircle, Lock, Check, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Occasion fallback images – ES module imports so Vite bundles them correctly
import birthdayImg from "@/assets/occasions/birthday.jpg";
import anniversaryImg from "@/assets/occasions/anniversary.jpg";
import weddingImg from "@/assets/occasions/wedding.jpg";
import valentinesImg from "@/assets/occasions/valentines.jpg";
import mothersDayImg from "@/assets/occasions/mothers-day.jpg";
import fathersDayImg from "@/assets/occasions/fathers-day.jpg";
import graduationImg from "@/assets/occasions/graduation.jpg";
import memorialImg from "@/assets/occasions/memorial.jpg";
import retirementImg from "@/assets/occasions/retirement.jpg";
import babyImg from "@/assets/occasions/baby.jpg";
import proposalImg from "@/assets/occasions/proposal.jpg";
import justBecauseImg from "@/assets/occasions/just-because.jpg";
import familyImg from "@/assets/occasions/family.jpg";
import petCelebrationImg from "@/assets/occasions/pet-celebration.jpg";
import petMemorialImg from "@/assets/occasions/pet-memorial.jpg";

const occasionImages: Record<string, string> = {
  birthday: birthdayImg,
  anniversary: anniversaryImg,
  wedding: weddingImg,
  valentines: valentinesImg,
  "valentine's day": valentinesImg,
  "mother's day": mothersDayImg,
  "father's day": fathersDayImg,
  graduation: graduationImg,
  memorial: memorialImg,
  "memorial tribute": memorialImg,
  retirement: retirementImg,
  baby: babyImg,
  "baby lullaby": babyImg,
  proposal: proposalImg,
  "just because": justBecauseImg,
  family: familyImg,
  "pet celebration": petCelebrationImg,
  "pet-celebration": petCelebrationImg,
  "pet memorial": petMemorialImg,
  "pet-memorial": petMemorialImg,
  custom: justBecauseImg,
};

interface SongData {
  song_url: string;
  song_title: string | null;
  cover_image_url: string | null;
  occasion: string;
  recipient_name: string;
  has_lyrics: boolean;
  lyrics_unlocked: boolean;
  lyrics?: string;
  lyrics_preview?: string;
  revision_token?: string;
  revision_available?: boolean;
  revision_status?: string;
  download_unlocked: boolean;
  bonus_available?: boolean;
  bonus_preview_url?: string | null;
  bonus_song_url?: string | null;
  bonus_song_title?: string | null;
  bonus_cover_image_url?: string | null;
  bonus_unlocked?: boolean;
  bonus_status?: string | null;
  genre?: string;
  bonus_genre_label?: string;
  bonus_asset_version?: string | null;
}

const SongPlayer = () => {
  const { promo: activeFlashPromo } = useActivePromo();
  const { orderId } = useParams<{ orderId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [songData, setSongData] = useState<SongData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const [downloadLoading, setDownloadLoading] = useState(false);
  const [bonusLoading, setBonusLoading] = useState(false);
  const [lyricsCopied, setLyricsCopied] = useState(false);

  // Bonus audio player state
  const bonusAudioRef = useRef<HTMLAudioElement>(null);
  const [bonusIsPlaying, setBonusIsPlaying] = useState(false);
  const [bonusCurrentTime, setBonusCurrentTime] = useState(0);
  const [bonusDuration, setBonusDuration] = useState(0);
  const [bonusIsBuffering, setBonusIsBuffering] = useState(false);
  // Audio player state
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const hasTrackedPlay = useRef(false);

  const fetchSongData = async () => {
    if (!orderId) return;
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-song-page?orderId=${orderId}`
      );
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Song not found");
      }
      const data = await response.json();
      setSongData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load song");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSongData();
  }, [orderId]);

  // Handle lyrics unlock redirect from Stripe
  useEffect(() => {
    const lyricsSessionId = searchParams.get("lyrics_session_id");
    if (!lyricsSessionId) return;

    const verifyLyricsPurchase = async () => {
      setLyricsLoading(true);
      try {
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verify-lyrics-purchase`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionId: lyricsSessionId }),
          }
        );
        if (response.ok) {
          await fetchSongData();
          toast.success("Lyrics unlocked!");
        }
      } catch (err) {
        console.error("Lyrics verification failed:", err);
      } finally {
        setLyricsLoading(false);
        setSearchParams({}, { replace: true });
      }
    };

    verifyLyricsPurchase();
  }, [searchParams]);

  // Handle download unlock redirect from Stripe
  useEffect(() => {
    const downloadSessionId = searchParams.get("download_session_id");
    if (!downloadSessionId) return;

    const verifyDownloadPurchase = async () => {
      setDownloadLoading(true);
      try {
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verify-download-purchase`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionId: downloadSessionId }),
          }
        );
        if (response.ok) {
          await fetchSongData();
          toast.success("Download unlocked! You can now download your song.");
        }
      } catch (err) {
        console.error("Download verification failed:", err);
      } finally {
        setDownloadLoading(false);
        setSearchParams({}, { replace: true });
      }
    };

    verifyDownloadPurchase();
  }, [searchParams]);

  // Handle bonus unlock redirect from Stripe
  useEffect(() => {
    const bonusSessionId = searchParams.get("bonus_session_id");
    if (!bonusSessionId) return;

    const verifyBonusPurchase = async () => {
      setBonusLoading(true);
      try {
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verify-bonus-purchase`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionId: bonusSessionId }),
          }
        );
        if (response.ok) {
          await fetchSongData();
          toast.success("Bonus track unlocked! 🎶");
        }
      } catch (err) {
        console.error("Bonus verification failed:", err);
      } finally {
        setBonusLoading(false);
        setSearchParams({}, { replace: true });
      }
    };

    verifyBonusPurchase();
  }, [searchParams]);

  // Bonus audio event handlers
  useEffect(() => {
    const audio = bonusAudioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => setBonusCurrentTime(audio.currentTime);
    const handleLoadedMetadata = () => setBonusDuration(audio.duration);
    const handleEnded = () => { setBonusIsPlaying(false); setBonusIsBuffering(false); };
    const handlePlaying = () => { setBonusIsPlaying(true); setBonusIsBuffering(false); };
    const handlePause = () => { setBonusIsPlaying(false); setBonusIsBuffering(false); };
    const handleWaiting = () => setBonusIsBuffering(true);
    const handleCanPlay = () => setBonusIsBuffering(false);

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("playing", handlePlaying);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("waiting", handleWaiting);
    audio.addEventListener("canplay", handleCanPlay);

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("playing", handlePlaying);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("waiting", handleWaiting);
      audio.removeEventListener("canplay", handleCanPlay);
    };
  }, [songData]);

  const hasTrackedBonusPlay = useRef(false);

  const toggleBonusPlay = async () => {
    if (!bonusAudioRef.current) return;
    if (bonusIsPlaying) {
      bonusAudioRef.current.pause();
      return;
    }
    setBonusIsBuffering(true);
    try {
      await bonusAudioRef.current.play();
      // Track bonus play (fire-and-forget)
      if (orderId && !hasTrackedBonusPlay.current) {
        hasTrackedBonusPlay.current = true;
        fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/track-song-engagement`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "order", action: "bonus_play", orderId }),
        }).catch(() => {});
      }
    } catch {
      setBonusIsBuffering(false);
    }
  };

  const handleBonusSeek = (value: number[]) => {
    if (!bonusAudioRef.current) return;
    bonusAudioRef.current.currentTime = value[0];
    setBonusCurrentTime(value[0]);
  };

  // Track playback error for diagnostics
  const trackPlaybackError = (errorName: string, errorMessage: string) => {
    if (!orderId || !songData?.song_url) return;
    
    let songUrlHost = "";
    try {
      songUrlHost = new URL(songData.song_url).host;
    } catch {
      songUrlHost = "invalid-url";
    }
    
    fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/track-song-engagement`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "order",
        action: "error",
        orderId,
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

  // Handle audio element errors
  const handleAudioError = (e: Event) => {
    const audio = e.target as HTMLAudioElement;
    const error = audio.error;
    
    let message = "Failed to load audio";
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
  };

  // Audio event handlers
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleLoadedMetadata = () => setDuration(audio.duration);
    const handleEnded = () => {
      setIsPlaying(false);
      setIsBuffering(false);
    };
    const handlePlaying = () => {
      setIsPlaying(true);
      setIsBuffering(false);
    };
    const handlePause = () => {
      setIsPlaying(false);
      setIsBuffering(false);
    };
    const handleWaiting = () => setIsBuffering(true);
    const handleCanPlay = () => setIsBuffering(false);

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("playing", handlePlaying);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("waiting", handleWaiting);
    audio.addEventListener("canplay", handleCanPlay);
    audio.addEventListener("error", handleAudioError);

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("playing", handlePlaying);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("waiting", handleWaiting);
      audio.removeEventListener("canplay", handleCanPlay);
      audio.removeEventListener("error", handleAudioError);
    };
  }, [songData]);

  const togglePlay = async () => {
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
      if (orderId && !hasTrackedPlay.current) {
        hasTrackedPlay.current = true;
        fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/track-song-engagement`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "order", action: "play", orderId }),
        }).catch((err) => console.error("Failed to track play:", err));
      }
    } catch (error) {
      const err = error as Error;
      console.error("Playback failed:", err);
      
      // Track the error for diagnostics
      trackPlaybackError(err.name || "UnknownError", err.message || "Unknown playback error");
      
      // User-friendly messages
      if (err.name === "NotAllowedError") {
        toast.error("Tap the play button to start playback");
      } else if (err.name === "NotSupportedError") {
        toast.error("Audio format not supported. Try downloading instead.");
        setAudioError("Audio format not supported on your device");
      } else {
        toast.error("Playback failed. Try downloading the song.");
        setAudioError("Playback failed. Try downloading the song.");
      }
      
      setIsBuffering(false);
    }
  };

  const handleSeek = (value: number[]) => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = value[0];
    setCurrentTime(value[0]);
  };

  const handleVolumeChange = (value: number[]) => {
    if (!audioRef.current) return;
    const newVolume = value[0];
    audioRef.current.volume = newVolume;
    setVolume(newVolume);
    setIsMuted(newVolume === 0);
  };

  const toggleMute = () => {
    if (!audioRef.current) return;
    if (isMuted) {
      audioRef.current.volume = volume || 1;
      setIsMuted(false);
    } else {
      audioRef.current.volume = 0;
      setIsMuted(true);
    }
  };

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  const shareUrl = encodeURIComponent(window.location.href);
  const shareText = encodeURIComponent(`Listen to this amazing personalized song!`);

  const shareOnFacebook = () => {
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${shareUrl}`, "_blank");
  };

  const shareOnInstagram = async () => {
    await navigator.clipboard.writeText(window.location.href);
    window.open("https://www.instagram.com/", "_blank");
    toast.success("Link copied! Paste it in your Instagram post or story.");
  };

  const shareOnTikTok = async () => {
    await navigator.clipboard.writeText(window.location.href);
    window.open("https://www.tiktok.com/upload", "_blank");
    toast.success("Link copied! Paste it in your TikTok description.");
  };

  const shareViaEmail = () => {
    window.location.href = `mailto:?subject=${encodeURIComponent("Check out this personalized song!")}&body=${shareText}%20${shareUrl}`;
  };

  const shareViaSMS = () => {
    window.location.href = `sms:?body=${shareText}%20${decodeURIComponent(shareUrl)}`;
  };

  const shareViaWhatsApp = () => {
    window.open(`https://wa.me/?text=${shareText}%20${shareUrl}`, "_blank");
  };

  const shareOnYouTube = async () => {
    await navigator.clipboard.writeText(window.location.href);
    window.open("https://www.youtube.com/", "_blank");
    toast.success("Link copied! Paste it in your YouTube video description.");
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success("Link copied to clipboard!");
    } catch {
      toast.error("Failed to copy link");
    }
  };

  const downloadSong = async () => {
    if (!songData?.song_url || !orderId) return;

    // If download is locked, redirect to Stripe checkout
    if (!songData.download_unlocked) {
      setDownloadLoading(true);
      try {
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-download-checkout`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orderId }),
          }
        );
        const data = await response.json();
        if (data.alreadyUnlocked) {
          await fetchSongData();
          toast.success("Download already unlocked!");
          return;
        }
        if (data.url) {
          window.location.href = data.url;
        } else {
          toast.error(data.error || "Failed to start checkout");
        }
      } catch {
        toast.error("Failed to start download checkout");
      } finally {
        setDownloadLoading(false);
      }
      return;
    }
    
    // Track download event (fire-and-forget)
    fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/track-song-engagement`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "order", action: "download", orderId }),
    }).catch((err) => console.error("Failed to track download:", err));
    
    try {
      const response = await fetch(songData.song_url);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${songTitle}.mp3`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success("Download started!");
    } catch {
      toast.error("Failed to download song");
    }
  };

  const getCoverImage = () => {
    if (songData?.cover_image_url) return songData.cover_image_url;
    const occasion = songData?.occasion?.toLowerCase() || "";
    return occasionImages[occasion] || "/placeholder.svg";
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <Music className="w-16 h-16 text-primary" />
          <p className="text-muted-foreground">Loading your song...</p>
        </div>
      </div>
    );
  }

  if (error || !songData) {
    const shortId = orderId ? orderId.substring(0, 8).toUpperCase() : null;
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <Music className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h1 className="text-xl font-semibold mb-2">Song Not Found</h1>
            <p className="text-muted-foreground mb-4">
              {error || "This song may not be ready yet or the link is invalid."}
            </p>
            {shortId && (
              <p className="text-sm text-muted-foreground mb-4">
                Reference code: <span className="font-mono font-semibold">{shortId}</span>
              </p>
            )}
            <p className="text-sm text-muted-foreground mb-6">
              Need help? Contact us at{" "}
              <a
                href={`mailto:support@personalsonggifts.com${shortId ? `?subject=Song%20Issue%20-%20Ref%20${shortId}` : ""}`}
                className="text-primary underline"
              >
                support@personalsonggifts.com
              </a>
              {shortId && <> with reference code <span className="font-mono font-semibold">{shortId}</span></>}
            </p>
            <Link to="/">
              <Button>Go Home</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const songTitle = songData.song_title || `A Song for ${songData.recipient_name}`;
  const bonusAudioSrc = (() => {
    const rawSrc = songData.bonus_unlocked ? songData.bonus_song_url : songData.bonus_preview_url;
    if (!rawSrc) return null;
    if (!songData.bonus_asset_version) return rawSrc;
    try {
      const url = new URL(rawSrc);
      url.searchParams.set("v", songData.bonus_asset_version);
      return url.toString();
    } catch {
      return rawSrc;
    }
  })();

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
      {/* Hidden audio elements */}
      <audio 
        ref={audioRef} 
        src={songData.song_url} 
        preload="auto"
        playsInline
      />
      {/* Bonus preview audio — use full URL if unlocked, otherwise preview */}
      {bonusAudioSrc && (
        <audio
          ref={bonusAudioRef}
          src={bonusAudioSrc}
          preload="none"
          playsInline
        />
      )}

      <div className="container max-w-2xl mx-auto px-4 py-8 md:py-16">
        {/* Audio Error Fallback */}
        {audioError && (
          <div className="max-w-md mx-auto mb-6 bg-destructive/10 border border-destructive/30 rounded-lg p-4 text-center">
            <AlertCircle className="h-6 w-6 text-destructive mx-auto mb-2" />
            <p className="text-sm text-destructive mb-3">{audioError}</p>
            {songData.download_unlocked ? (
              <Button onClick={downloadSong} className="gap-2">
                <Download className="h-4 w-4" />
                Download Song Instead
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">
                Purchase the download below to save your song.
              </p>
            )}
          </div>
        )}

        {/* Album Art */}
        <div className="relative aspect-square max-w-md mx-auto mb-8 rounded-2xl overflow-hidden shadow-2xl">
          <img
            src={getCoverImage()}
            alt="Album artwork"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
        </div>

        {/* Song Info */}
        <div className="text-center mb-8">
          <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-2">
            {songTitle}
          </h1>
          <p className="text-muted-foreground capitalize">
            {songData.occasion} • For {songData.recipient_name}
          </p>
        </div>

        {/* Audio Player Controls */}
        <Card className="mb-8">
          <CardContent className="pt-6">
            {/* Progress Bar */}
            <div className="mb-4">
              <Slider
                value={[currentTime]}
                max={duration || 100}
                step={0.1}
                onValueChange={handleSeek}
                className="w-full"
              />
              <div className="flex justify-between text-sm text-muted-foreground mt-1">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            {/* Play Controls */}
            <div className="flex items-center justify-center gap-4">
              <Button
                variant="outline"
                size="icon"
                onClick={toggleMute}
                className="hidden md:flex"
              >
                {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </Button>
              
              <div className="hidden md:flex items-center w-24">
                <Slider
                  value={[isMuted ? 0 : volume]}
                  max={1}
                  step={0.01}
                  onValueChange={handleVolumeChange}
                />
              </div>

              <Button
                size="lg"
                onClick={togglePlay}
                className="w-16 h-16 rounded-full"
                disabled={isBuffering}
              >
                {isBuffering ? (
                  <Loader2 className="h-6 w-6 animate-spin" />
                ) : isPlaying ? (
                  <Pause className="h-6 w-6" />
                ) : (
                  <Play className="h-6 w-6 ml-1" />
                )}
              </Button>

              <div className="hidden md:block w-24" /> {/* Spacer for symmetry */}
            </div>
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="flex justify-center gap-3 mb-8 flex-wrap">
          <Button
            variant={songData.download_unlocked ? "outline" : "default"}
            onClick={downloadSong}
            disabled={downloadLoading}
            className="gap-2"
          >
            {downloadLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : songData.download_unlocked ? (
              <Download className="h-4 w-4" />
            ) : (
              <Lock className="h-4 w-4" />
            )}
            {songData.download_unlocked ? "Download" : "Download Song + Unlimited Commercial Rights & Usage — $49.00 USD"}
          </Button>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2">
                <Share2 className="h-4 w-4" />
                Share
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" className="w-48">
              <DropdownMenuItem onClick={shareOnFacebook} className="gap-2 cursor-pointer">
                <Facebook className="h-4 w-4" />
                Facebook
              </DropdownMenuItem>
              <DropdownMenuItem onClick={shareOnInstagram} className="gap-2 cursor-pointer">
                <Instagram className="h-4 w-4" />
                Instagram
              </DropdownMenuItem>
              <DropdownMenuItem onClick={shareOnTikTok} className="gap-2 cursor-pointer">
                <Music className="h-4 w-4" />
                TikTok
              </DropdownMenuItem>
              <DropdownMenuItem onClick={shareOnYouTube} className="gap-2 cursor-pointer">
                <Youtube className="h-4 w-4" />
                YouTube
              </DropdownMenuItem>
              <DropdownMenuItem onClick={shareViaWhatsApp} className="gap-2 cursor-pointer">
                <MessageCircle className="h-4 w-4" />
                WhatsApp
              </DropdownMenuItem>
              <DropdownMenuItem onClick={shareViaSMS} className="gap-2 cursor-pointer">
                <MessageCircle className="h-4 w-4" />
                Text (SMS)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={shareViaEmail} className="gap-2 cursor-pointer">
                <Mail className="h-4 w-4" />
                Email
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          
          <Button variant="outline" onClick={copyLink} className="gap-2">
            <Copy className="h-4 w-4" />
            Copy Link
          </Button>
        </div>

        {/* Revision Button */}
        {songData.revision_available && songData.revision_token && (
          <div className="text-center mb-6">
            <Link to={`/song/revision/${songData.revision_token}`}>
              <Button variant="outline" className="gap-2 text-primary border-primary/30 hover:bg-primary/5">
                <Pencil className="h-4 w-4" />
                🤔 Need changes? Request a revision
              </Button>
            </Link>
          </div>
        )}

        {/* Lyrics Section */}
        {songData && (() => {
          const handleUnlockLyrics = async () => {
            if (!orderId) return;
            setLyricsLoading(true);
            try {
              const response = await fetch(
                `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-lyrics-checkout`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ orderId }),
                }
              );
              const data = await response.json();
              if (data.alreadyUnlocked) {
                await fetchSongData();
                toast.success("Lyrics already unlocked!");
                return;
              }
              if (data.url) {
                window.location.href = data.url;
              } else {
                toast.error(data.error || "Failed to start checkout");
              }
            } catch {
              toast.error("Failed to start lyrics checkout");
            } finally {
              setLyricsLoading(false);
            }
          };

          const handleCopyLyrics = async () => {
            if (!songData.lyrics) return;
            try {
              await navigator.clipboard.writeText(songData.lyrics);
              setLyricsCopied(true);
              toast.success("Lyrics copied to clipboard!");
              setTimeout(() => setLyricsCopied(false), 2000);
            } catch {
              toast.error("Failed to copy lyrics");
            }
          };

          if (!songData.has_lyrics) {
            // No lyrics available (older orders)
            return (
              <Card className="mb-8">
                <CardContent className="py-6 text-center">
                  <p className="text-sm text-muted-foreground">
                    Lyrics aren't available for this song yet.
                  </p>
                </CardContent>
              </Card>
            );
          }

          if (songData.lyrics_unlocked && songData.lyrics) {
            // Unlocked — show full lyrics
            return (
              <Card className="mb-8">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-foreground">Lyrics</h3>
                    <Button variant="outline" size="sm" onClick={handleCopyLyrics} className="gap-2">
                      {lyricsCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      {lyricsCopied ? "Copied" : "Copy Lyrics"}
                    </Button>
                  </div>
                  <div
                    className="max-h-[400px] overflow-y-auto"
                    style={{
                      fontFamily: "'Playfair Display', serif",
                      fontSize: "1.05rem",
                      lineHeight: "1.65",
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {songData.lyrics}
                  </div>
                </CardContent>
              </Card>
            );
          }

          if (songData.lyrics_unlocked && !songData.lyrics) {
            // Paid but lyrics missing (admin cleared)
            return (
              <Card className="mb-8">
                <CardContent className="py-6 text-center">
                  <p className="text-sm text-muted-foreground">
                    Your lyrics are being prepared.
                  </p>
                </CardContent>
              </Card>
            );
          }

          // Locked — show preview + upsell
          return (
            <Card className="mb-8 overflow-hidden">
              <CardContent className="pt-6 pb-0">
                <h3 className="font-semibold text-foreground mb-4">Lyrics</h3>
                <div className="relative">
                  <div
                    style={{
                      fontFamily: "'Playfair Display', serif",
                      fontSize: "1.05rem",
                      lineHeight: "1.65",
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {songData.lyrics_preview}
                  </div>
                  {/* Gradient fade */}
                  <div className="h-16 bg-gradient-to-t from-card to-transparent -mt-16 relative z-10" />
                </div>
              </CardContent>
              <div className="px-6 pb-6 text-center">
                <Button
                  onClick={handleUnlockLyrics}
                  disabled={lyricsLoading}
                  className="gap-2"
                  size="lg"
                >
                  {lyricsLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Lock className="h-4 w-4" />
                  )}
                  Unlock Full Lyrics — $4.99
                </Button>
              </div>
            </Card>
          );
        })()}

        {/* Bonus Track Section */}
        {songData.bonus_available && (songData.bonus_preview_url || songData.bonus_song_url) && (() => {
          const genreLabel = songData.bonus_genre_label || "Acoustic";
          const isRnB = genreLabel === "R&B";
          const genreEmoji = isRnB ? "🎵" : "🎸";
          const genreDescription = isRnB
            ? "Your song was so special that we reimagined it in an R&B style — smooth, soulful, and full of groove. A whole new way to experience your song."
            : "Your song was so special that we created an acoustic version too — intimate, organic, and full of feeling. Like a private performance just for you.";
          const bonusCoverUrl = songData.bonus_cover_image_url || getCoverImage();
          
          return (
            <div className="mb-8">
              {/* Section divider */}
              <div className="flex items-center justify-center gap-3 mb-8 mt-4">
                <div className="h-px bg-border flex-1" />
                <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">
                  ✨ We made something extra for you
                </span>
                <div className="h-px bg-border flex-1" />
              </div>

              {/* Large album art */}
              <div className="flex justify-center mb-6">
                <div className="w-full max-w-sm">
                  <div className="aspect-square rounded-xl overflow-hidden shadow-lg">
                    <img
                      src={bonusCoverUrl}
                      alt={`${genreLabel} version cover`}
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>
              </div>

              {/* Title + description */}
              <div className="text-center mb-6">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <span className="text-3xl">{genreEmoji}</span>
                  <h2 className="text-2xl md:text-3xl font-bold text-foreground">
                    {genreLabel} Version
                  </h2>
                </div>
                <p className="text-base text-muted-foreground max-w-md mx-auto">
                  {genreDescription}
                </p>
              </div>

              {/* Full-size player */}
              <div className="mb-6 bg-muted/40 rounded-xl p-6">
                <div className="mb-4">
                  <Slider
                    value={[bonusCurrentTime]}
                    max={bonusDuration || 100}
                    step={0.1}
                    onValueChange={handleBonusSeek}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground mt-1">
                    <span>{formatTime(bonusCurrentTime)}</span>
                    <span>{formatTime(bonusDuration)}</span>
                  </div>
                </div>
                <div className="flex items-center justify-center">
                  <Button
                    size="lg"
                    onClick={toggleBonusPlay}
                    disabled={bonusIsBuffering}
                    className="w-16 h-16 rounded-full"
                  >
                    {bonusIsBuffering ? (
                      <Loader2 className="h-6 w-6 animate-spin" />
                    ) : bonusIsPlaying ? (
                      <Pause className="h-6 w-6" />
                    ) : (
                      <Play className="h-6 w-6 ml-1" />
                    )}
                  </Button>
                </div>
                {!songData.bonus_unlocked && (
                  <p className="text-xs text-muted-foreground text-center mt-3">
                    45-second preview
                  </p>
                )}
              </div>

              {/* Unlock / Download CTA */}
              {songData.bonus_unlocked ? (
                <div className="text-center">
                  <Button
                    variant="outline"
                    size="lg"
                    className="gap-2"
                    onClick={async () => {
                      if (!songData.bonus_song_url) return;
                      try {
                        const response = await fetch(songData.bonus_song_url);
                        const blob = await response.blob();
                        const url = window.URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = `${songData.bonus_song_title || songTitle + ` (${genreLabel})`}.mp3`;
                        document.body.appendChild(a);
                        a.click();
                        window.URL.revokeObjectURL(url);
                        document.body.removeChild(a);
                        toast.success("Download started!");
                      } catch {
                        toast.error("Failed to download bonus track");
                      }
                    }}
                  >
                    <Download className="h-4 w-4" />
                    Download {genreLabel} Version
                  </Button>
                </div>
              ) : (
                <div className="text-center">
                  {(() => {
                    const promoBonusPrice = activeFlashPromo.active && activeFlashPromo.bonusPriceCents
                      ? activeFlashPromo.bonusPriceCents
                      : null;
                    const displayPrice = promoBonusPrice
                      ? `$${(promoBonusPrice / 100).toFixed(2)}`
                      : "$19.99";
                    return (
                      <Button
                        onClick={async () => {
                          if (!orderId) return;
                          // Track bonus checkout click (fire-and-forget)
                          fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/track-song-engagement`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ type: "order", action: "bonus_checkout_click", orderId }),
                          }).catch(() => {});
                          setBonusLoading(true);
                          try {
                            const response = await fetch(
                              `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-bonus-checkout`,
                              {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ orderId }),
                              }
                            );
                            const data = await response.json();
                            if (data.alreadyUnlocked) {
                              await fetchSongData();
                              toast.success("Already unlocked!");
                              return;
                            }
                            if (data.url) {
                              window.location.href = data.url;
                            } else {
                              toast.error(data.error || "Failed to start checkout");
                            }
                          } catch {
                            toast.error("Failed to start bonus checkout");
                          } finally {
                            setBonusLoading(false);
                          }
                        }}
                        disabled={bonusLoading}
                        size="lg"
                        className="w-full max-w-sm gap-2 text-base py-6"
                      >
                        {bonusLoading ? (
                          <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                          <Lock className="h-5 w-5" />
                        )}
                        Unlock Full {genreLabel} Version —{" "}
                        {promoBonusPrice ? (
                          <>
                            <span className="line-through opacity-60 mr-1">$19.99</span>
                            {displayPrice}
                          </>
                        ) : (
                          displayPrice
                        )}
                      </Button>
                    );
                  })()}
                </div>
              )}
            </div>
          );
        })()}

        {/* Reaction CTA */}
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="pt-6 text-center">
            <Gift className="w-12 h-12 text-primary mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">
              Share the Moment & Earn $50!
            </h2>
            <p className="text-muted-foreground mb-4">
              Record the moment your loved one hears their song for the first time. 
              If selected, you'll receive a $50 Amazon gift card.
            </p>
            <Link to="/submit-reaction">
              <Button size="lg" className="gap-2">
                <Share2 className="h-4 w-4" />
                Submit Your Reaction
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* Promo CTA */}
        {activeFlashPromo.active && (
          <Card className="bg-accent/10 border-accent/30">
            <CardContent className="pt-6 text-center">
              <p className="text-lg font-semibold mb-1">
                🎵 Want a song for someone else?
              </p>
              <p className="text-muted-foreground mb-4">
                We're running a sale right now — don't miss out!
              </p>
              <Link to="/create">
                <Button size="lg" className="gap-2">
                  <Gift className="h-4 w-4" />
                  Create a Song →
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}

        {/* Footer */}
        <div className="text-center mt-12 pt-8 border-t">
          <p className="text-sm text-muted-foreground mb-2">
            Made with ❤️ by Personal Song Gifts
          </p>
          <Link to="/" className="text-sm text-primary hover:underline">
            Create your own personalized song
          </Link>
        </div>
      </div>
    </div>
  );
};

export default SongPlayer;
