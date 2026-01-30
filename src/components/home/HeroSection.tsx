import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Play, Pause } from "lucide-react";
import { useState, useRef } from "react";
import { toast } from "sonner";

const HeroSection = () => {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  const toggleAudio = async () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      try {
        // Reset to beginning if ended
        if (audio.ended) {
          audio.currentTime = 0;
        }
        await audio.play();
        setIsPlaying(true);
      } catch (error) {
        console.error("Audio playback failed:", error);
        toast.error("Unable to play audio. Please try again.");
        setIsPlaying(false);
      }
    }
  };

  const handleAudioEnded = () => {
    setIsPlaying(false);
  };

  return (
    <section className="relative flex items-center justify-center overflow-hidden bg-gradient-to-b from-secondary/30 to-background pb-6 md:pb-10">
      {/* Hidden audio element */}
      <audio 
        ref={audioRef} 
        src="/audio/sample-song2.mp3" 
        onEnded={handleAudioEnded}
        onError={(e) => console.error("Audio load error:", e)}
        onCanPlay={() => console.log("Audio ready to play")}
        preload="auto"
      />

      {/* Content */}
      <div className="relative z-10 container mx-auto px-4 text-center max-w-4xl py-8 md:py-12">
        {/* Video Container */}
        <div className="relative max-w-2xl mx-auto mb-6 md:mb-10 animate-fade-in">
          <div className="relative rounded-2xl overflow-hidden shadow-elevated">
            <video 
              autoPlay 
              loop 
              muted 
              playsInline
              className="w-full h-full object-cover"
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

        <h1 className="font-display text-foreground mb-4 md:mb-6 animate-fade-in text-3xl md:text-4xl lg:text-5xl">
          Turn Your Story Into a Song They'll Never Forget
        </h1>
        
        <p className="text-body-lg text-muted-foreground mb-6 md:mb-10 max-w-2xl mx-auto animate-fade-in-up text-base md:text-lg">
          A one-of-a-kind song created from your words, your memories, and your love.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 md:gap-4 animate-fade-in-up">
          <Button asChild size="lg" className="text-base md:text-lg px-6 md:px-8 py-5 md:py-6 font-semibold shadow-elevated w-full sm:w-auto">
            <Link to="/create">Create Your Song</Link>
          </Button>
          
          <Button 
            variant="outline" 
            size="lg" 
            className="text-base md:text-lg px-6 md:px-8 py-5 md:py-6 font-medium border-2 w-full sm:w-auto"
            asChild
          >
            <a href="#samples" className="flex items-center gap-2">
              <Play className="h-5 w-5" />
              Hear Sample Songs
            </a>
          </Button>
        </div>

        {/* Trust indicator */}
        <p className="mt-6 md:mt-8 text-muted-foreground text-xs md:text-sm animate-fade-in">
          ★★★★★ Trusted by 1,000+ families for life's most meaningful moments
        </p>
      </div>
    </section>
  );
};

export default HeroSection;
