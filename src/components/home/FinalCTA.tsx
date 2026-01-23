import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Heart } from "lucide-react";

const FinalCTA = () => {
  return (
    <section className="py-12 md:py-20 bg-gradient-to-b from-background to-secondary/50">
      <div className="container mx-auto px-4 text-center">
        <Heart className="h-10 w-10 md:h-12 md:w-12 text-primary mx-auto mb-4 md:mb-6 animate-pulse-soft" />
        
        <h2 className="font-display text-foreground mb-4 md:mb-6 max-w-3xl mx-auto text-2xl md:text-3xl lg:text-4xl">
          Give a Gift They'll Remember Forever
        </h2>
        
        <p className="text-body-lg text-muted-foreground mb-6 md:mb-10 max-w-2xl mx-auto text-base md:text-lg">
          Turn your love, your memories, and your words into a song they'll treasure for a lifetime.
        </p>

        <Button asChild size="lg" className="text-base md:text-lg px-8 md:px-10 py-5 md:py-6 font-semibold shadow-elevated w-full sm:w-auto">
          <Link to="/create">Create Your Song</Link>
        </Button>

        <p className="mt-6 md:mt-8 text-xs md:text-sm text-muted-foreground">
          ✓ Satisfaction guaranteed · ✓ Delivered within 48 hours · ✓ 100% unique
        </p>
      </div>
    </section>
  );
};

export default FinalCTA;
