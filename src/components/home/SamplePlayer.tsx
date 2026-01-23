import { useState, useRef, useEffect } from "react";
import { Play, Pause, Music, Volume2, VolumeX } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";

interface SampleSong {
  id: string;
  title: string;
  occasion: string;
  genre: string;
  duration: string;
  audioSrc: string;
}

const sampleSongs: SampleSong[] = [
  { id: "1", title: "My Favorite Yes", occasion: "Anniversary", genre: "Country", duration: "2:39", audioSrc: "/audio/my-favorite-yes.mp3" },
  { id: "2", title: "All My Love", occasion: "Lullaby", genre: "Soft/Emotional", duration: "2:56", audioSrc: "/audio/all-my-love.mp3" },
  { id: "3", title: "Through All the Years", occasion: "Wedding", genre: "Acoustic", duration: "3:45", audioSrc: "" },
  { id: "4", title: "Always in My Heart", occasion: "Memorial", genre: "Ballad", duration: "4:12", audioSrc: "" },
  { id: "5", title: "You Make Life Beautiful", occasion: "Valentine's Day", genre: "Soft Rock", duration: "3:18", audioSrc: "" },
];

const SamplePlayer = () => {
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.7);
  const [isMuted, setIsMuted] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, []);

  const togglePlay = (song: SampleSong) => {
    if (!song.audioSrc) return; // No audio available for this song

    if (playingId === song.id) {
      // Pause current song
      audioRef.current?.pause();
      setPlayingId(null);
    } else {
      // Stop any currently playing audio
      if (audioRef.current) {
        audioRef.current.pause();
      }
      
      // Create new audio and play
      const audio = new Audio(song.audioSrc);
      audio.volume = isMuted ? 0 : volume;
      audioRef.current = audio;
      
      audio.addEventListener('timeupdate', () => {
        setCurrentTime(audio.currentTime);
      });
      
      audio.addEventListener('loadedmetadata', () => {
        setDuration(audio.duration);
      });
      
      audio.addEventListener('ended', () => {
        setPlayingId(null);
        setCurrentTime(0);
      });
      
      audio.play();
      setPlayingId(song.id);
    }
  };

  const handleProgressChange = (value: number[]) => {
    if (audioRef.current) {
      audioRef.current.currentTime = value[0];
      setCurrentTime(value[0]);
    }
  };

  const handleVolumeChange = (value: number[]) => {
    const newVolume = value[0];
    setVolume(newVolume);
    if (audioRef.current) {
      audioRef.current.volume = newVolume;
    }
    if (newVolume > 0) {
      setIsMuted(false);
    }
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? volume : 0;
    }
  };

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const currentSong = sampleSongs.find(s => s.id === playingId);

  return (
    <section id="samples" className="py-16 md:py-24 bg-secondary/30">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="font-display text-foreground mb-4">
            Hear What's Possible
          </h2>
          <p className="text-body text-muted-foreground max-w-2xl mx-auto">
            Every song is unique, crafted from real stories shared by people just like you.
          </p>
        </div>

        {/* Horizontal scroll on mobile, grid on desktop */}
        <div className="flex gap-4 overflow-x-auto pb-4 md:grid md:grid-cols-3 lg:grid-cols-5 md:overflow-x-visible md:pb-0 snap-x snap-mandatory md:snap-none">
          {sampleSongs.map((song) => (
            <Card 
              key={song.id}
              className={`flex-shrink-0 w-64 md:w-auto p-6 bg-card hover:shadow-card transition-all duration-300 snap-start cursor-pointer group ${
                !song.audioSrc ? 'opacity-50 cursor-not-allowed' : ''
              }`}
              onClick={() => togglePlay(song)}
            >
              {/* Play button */}
              <div className="relative w-16 h-16 mx-auto mb-4">
                <div className={`w-full h-full rounded-full flex items-center justify-center transition-all duration-300 ${
                  playingId === song.id 
                    ? "bg-primary text-primary-foreground" 
                    : "bg-secondary group-hover:bg-primary/10"
                }`}>
                  {playingId === song.id ? (
                    <Pause className="h-6 w-6" />
                  ) : (
                    <Play className="h-6 w-6 ml-1 text-primary" />
                  )}
                </div>
                {playingId === song.id && (
                  <div className="absolute inset-0 rounded-full border-2 border-primary animate-pulse-soft" />
                )}
              </div>

              {/* Song info */}
              <div className="text-center">
                <h4 className="font-semibold text-foreground mb-1 line-clamp-1">
                  {song.title}
                </h4>
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
          ))}
        </div>

        {/* Audio Controls - visible when playing */}
        {playingId && currentSong && (
          <div className="mt-8 max-w-xl mx-auto bg-card rounded-xl p-4 shadow-card">
            <div className="flex items-center gap-4 mb-3">
              <button
                onClick={() => togglePlay(currentSong)}
                className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 transition-colors"
              >
                {playingId ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 ml-0.5" />}
              </button>
              <div className="flex-1">
                <p className="font-semibold text-foreground text-sm">{currentSong.title}</p>
                <p className="text-xs text-muted-foreground">{currentSong.occasion} • {currentSong.genre}</p>
              </div>
            </div>
            
            {/* Progress bar */}
            <div className="flex items-center gap-3 mb-3">
              <span className="text-xs text-muted-foreground w-10 text-right">{formatTime(currentTime)}</span>
              <Slider
                value={[currentTime]}
                max={duration || 100}
                step={0.1}
                onValueChange={handleProgressChange}
                className="flex-1"
              />
              <span className="text-xs text-muted-foreground w-10">{formatTime(duration)}</span>
            </div>

            {/* Volume control */}
            <div className="flex items-center gap-3">
              <button 
                onClick={toggleMute}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                {isMuted || volume === 0 ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </button>
              <Slider
                value={[isMuted ? 0 : volume]}
                max={1}
                step={0.01}
                onValueChange={handleVolumeChange}
                className="w-24"
              />
            </div>
          </div>
        )}

        <p className="text-center text-sm text-muted-foreground mt-8">
          <Music className="inline h-4 w-4 mr-1" />
          These are samples — your song will be created just for your loved one
        </p>
      </div>
    </section>
  );
};

export default SamplePlayer;
