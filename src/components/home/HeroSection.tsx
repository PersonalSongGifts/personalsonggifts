import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Play, Pause } from "lucide-react";
import { useState, useRef } from "react";

const HeroSection = () => {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  const toggleAudio = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleAudioEnded = () => {
    setIsPlaying(false);
  };

  return (
    <section className="relative min-h-[90vh] flex items-center justify-center overflow-hidden bg-gradient-to-b from-secondary/30 to-background">
      {/* Hidden audio element */}
      <audio 
        ref={audioRef} 
        src="/audio/sample-song.mp3" 
        onEnded={handleAudioEnded}
        preload="metadata"
      />

      {/* Content */}
      <div className="relative z-10 container mx-auto px-4 text-center max-w-4xl py-12">
        {/* Video Container */}
        <div className="relative max-w-2xl mx-auto mb-10 animate-fade-in">
          <div className="relative rounded-2xl overflow-hidden shadow-elevated">
            <video 
              autoPlay 
              loop 
              muted 
              playsInline
              className="w-full h-auto"
            >
              <source src="/videos/hero-video.mp4" type="video/mp4" />
              Your browser does not support the video tag.
            </video>
            
            {/* Listen to Example Button Overlay */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
              <Button 
                onClick={toggleAudio}
                size="lg"
                className="text-base px-6 py-5 font-semibold shadow-lg gap-2"
              >
                {isPlaying ? (
                  <>
                    <Pause className="h-5 w-5" />
                    Pause Song
                  </>
                ) : (
                  <>
                    <Play className="h-5 w-5" />
                    Listen to Example
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>

        <h1 className="font-display text-foreground mb-6 animate-fade-in">
          Turn Your Story Into a Song They'll Never Forget
        </h1>
        
        <p className="text-body-lg text-muted-foreground mb-10 max-w-2xl mx-auto animate-fade-in-up">
          A one-of-a-kind song created from your words, your memories, and your love.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-fade-in-up">
          <Button asChild size="lg" className="text-lg px-8 py-6 font-semibold shadow-elevated">
            <Link to="/create">Create Your Song</Link>
          </Button>
          
          <Button 
            variant="outline" 
            size="lg" 
            className="text-lg px-8 py-6 font-medium border-2"
            asChild
          >
            <a href="#samples" className="flex items-center gap-2">
              <Play className="h-5 w-5" />
              Hear Sample Songs
            </a>
          </Button>
        </div>

        {/* Trust indicator */}
        <p className="mt-12 text-muted-foreground text-sm animate-fade-in">
          ★★★★★ Trusted by 1,000+ families for life's most meaningful moments
        </p>
      </div>

      {/* Decorative bottom fade */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background to-transparent" />
    </section>
  );
};

export default HeroSection;
