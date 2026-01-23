import { useState, useRef } from "react";
import { Play, Pause, Music } from "lucide-react";
import { Card } from "@/components/ui/card";

interface SampleSong {
  id: string;
  title: string;
  occasion: string;
  genre: string;
  duration: string;
}

const sampleSongs: SampleSong[] = [
  { id: "1", title: "Forever With You", occasion: "Anniversary", genre: "Country", duration: "3:24" },
  { id: "2", title: "My Little Star", occasion: "Birthday", genre: "Pop", duration: "2:58" },
  { id: "3", title: "Through All the Years", occasion: "Wedding", genre: "Acoustic", duration: "3:45" },
  { id: "4", title: "Always in My Heart", occasion: "Memorial", genre: "Ballad", duration: "4:12" },
  { id: "5", title: "You Make Life Beautiful", occasion: "Valentine's Day", genre: "Soft Rock", duration: "3:18" },
];

const SamplePlayer = () => {
  const [playingId, setPlayingId] = useState<string | null>(null);

  const togglePlay = (id: string) => {
    if (playingId === id) {
      setPlayingId(null);
    } else {
      setPlayingId(id);
    }
  };

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
              className="flex-shrink-0 w-64 md:w-auto p-6 bg-card hover:shadow-card transition-all duration-300 snap-start cursor-pointer group"
              onClick={() => togglePlay(song.id)}
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

        <p className="text-center text-sm text-muted-foreground mt-8">
          <Music className="inline h-4 w-4 mr-1" />
          These are samples — your song will be created just for your loved one
        </p>
      </div>
    </section>
  );
};

export default SamplePlayer;
