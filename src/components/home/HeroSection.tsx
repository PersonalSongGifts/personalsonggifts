import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Play } from "lucide-react";

const HeroSection = () => {
  return (
    <section className="relative min-h-[85vh] flex items-center justify-center overflow-hidden">
      {/* Background with soft overlay */}
      <div 
        className="absolute inset-0 bg-gradient-to-b from-secondary/50 to-background"
        style={{
          backgroundImage: `url('https://images.unsplash.com/photo-1516589178581-6cd7833ae3b2?q=80&w=1920&auto=format&fit=crop')`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <div className="absolute inset-0 bg-background/85 backdrop-blur-[2px]" />
      </div>

      {/* Content */}
      <div className="relative z-10 container mx-auto px-4 text-center max-w-4xl">
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
