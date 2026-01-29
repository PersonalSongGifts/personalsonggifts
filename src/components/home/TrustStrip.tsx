import { Star, Users } from "lucide-react";
import asSeenOnImage from "@/assets/as-seen-on.png";

const TrustStrip = () => {
  return (
    <section className="py-8 md:py-12 border-y border-border bg-card">
      <div className="container mx-auto px-4">
        {/* Stats row */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-6 sm:gap-12 md:gap-16 mb-8 md:mb-10">
          {/* Rating */}
          <div className="flex items-center gap-3">
            <div className="flex text-gold">
              {[...Array(5)].map((_, i) => (
                <Star key={i} className="h-5 w-5 md:h-6 md:w-6 fill-current" />
              ))}
            </div>
            <span className="text-foreground font-semibold text-lg md:text-xl">4.9</span>
            <span className="text-muted-foreground text-base md:text-lg">Rating</span>
          </div>

          {/* Divider */}
          <div className="hidden sm:block w-px h-10 bg-border" />

          {/* Families served */}
          <div className="flex items-center gap-3">
            <Users className="h-5 w-5 md:h-6 md:w-6 text-primary" />
            <span className="text-foreground font-semibold text-lg md:text-xl">1,000+</span>
            <span className="text-muted-foreground text-base md:text-lg">Families Served</span>
          </div>
        </div>

        {/* As Seen On - Centered and larger */}
        <div className="flex flex-col items-center justify-center">
          <img 
            src={asSeenOnImage} 
            alt="As Seen On ABC, NBC, CBS, FOX" 
            className="w-full max-w-[280px] sm:max-w-[360px] md:max-w-[450px] lg:max-w-[520px] h-auto"
          />
        </div>
      </div>
    </section>
  );
};

export default TrustStrip;
