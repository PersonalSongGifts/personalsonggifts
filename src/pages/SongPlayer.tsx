import { useState, useRef, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { Play, Pause, Volume2, VolumeX, Share2, Copy, Gift, Music, Download, Facebook, Instagram, Mail, MessageCircle, Youtube } from "lucide-react";
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

// Occasion-based fallback images
const occasionImages: Record<string, string> = {
  birthday: "/src/assets/occasions/birthday.jpg",
  anniversary: "/src/assets/occasions/anniversary.jpg",
  wedding: "/src/assets/occasions/wedding.jpg",
  valentines: "/src/assets/occasions/valentines.jpg",
  "mother's day": "/src/assets/occasions/mothers-day.jpg",
  "father's day": "/src/assets/occasions/fathers-day.jpg",
  graduation: "/src/assets/occasions/graduation.jpg",
  memorial: "/src/assets/occasions/memorial.jpg",
  retirement: "/src/assets/occasions/retirement.jpg",
  baby: "/src/assets/occasions/baby.jpg",
  proposal: "/src/assets/occasions/proposal.jpg",
  "just because": "/src/assets/occasions/just-because.jpg",
};

interface SongData {
  song_url: string;
  song_title: string | null;
  cover_image_url: string | null;
  occasion: string;
  recipient_name: string;
}

const SongPlayer = () => {
  const { orderId } = useParams<{ orderId: string }>();
  const [songData, setSongData] = useState<SongData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Audio player state
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);

  useEffect(() => {
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

    fetchSongData();
  }, [orderId]);

  // Audio event handlers
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleLoadedMetadata = () => setDuration(audio.duration);
    const handleEnded = () => setIsPlaying(false);

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("ended", handleEnded);
    };
  }, [songData]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
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
    if (!songData?.song_url) return;
    
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
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <Music className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h1 className="text-xl font-semibold mb-2">Song Not Found</h1>
            <p className="text-muted-foreground mb-4">
              {error || "This song may not be ready yet or the link is invalid."}
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

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
      {/* Hidden audio element */}
      <audio ref={audioRef} src={songData.song_url} preload="metadata" />

      <div className="container max-w-2xl mx-auto px-4 py-8 md:py-16">
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
              >
                {isPlaying ? (
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
          <Button variant="outline" onClick={downloadSong} className="gap-2">
            <Download className="h-4 w-4" />
            Download
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
