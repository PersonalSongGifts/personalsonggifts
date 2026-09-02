import { useEffect, useRef, useState } from "react";
import { Play, Pause } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { SampleSong } from "@/data/sampleSongs";
import { trackEvent } from "@/lib/amplitudeTrack";

interface SampleSongCardProps {
  song: SampleSong;
}

/** Compact, self-contained player card used on the SEO landing pages. */
const SampleSongCard = ({ song }: SampleSongCardProps) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playedRef = useRef(false);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
    };
  }, []);

  const toggle = () => {
    if (!song.audioSrc) return;

    if (isPlaying) {
      audioRef.current?.pause();
      setIsPlaying(false);
      return;
    }

    if (!audioRef.current) {
      const audio = new Audio(song.audioSrc);
      audio.preload = "none";
      audio.addEventListener("ended", () => setIsPlaying(false));
      audio.addEventListener("pause", () => setIsPlaying(false));
      audioRef.current = audio;
    }

    if (!playedRef.current) {
      playedRef.current = true;
      trackEvent("Sample Played", {
        song_id: song.id,
        song_title: song.title,
        occasion: song.occasion,
        genre: song.genre,
        location: "landing_page",
      });
    }

    audioRef.current.play();
    setIsPlaying(true);
  };

  return (
    <Card
      className="p-6 bg-card hover:shadow-card transition-all duration-300 cursor-pointer group"
      onClick={toggle}
    >
      <div className="relative w-16 h-16 mx-auto mb-4">
        <div
          className={`w-full h-full rounded-full flex items-center justify-center transition-all duration-300 ${
            isPlaying ? "bg-primary text-primary-foreground" : "bg-secondary group-hover:bg-primary/10"
          }`}
        >
          {isPlaying ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6 ml-1 text-primary" />}
        </div>
        {isPlaying && (
          <div className="absolute inset-0 rounded-full border-2 border-primary animate-pulse-soft" />
        )}
      </div>

      <div className="text-center">
        <h3 className="font-semibold text-foreground mb-1 line-clamp-1">{song.title}</h3>
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-full text-xs font-medium">
            {song.occasion}
          </span>
        </div>
        <p className="text-sm text-muted-foreground mt-2">
          {song.genre} • {song.duration}
        </p>
      </div>
    </Card>
  );
};

export default SampleSongCard;
