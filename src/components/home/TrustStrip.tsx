import { Star, Users } from "lucide-react";
import asSeenOnImage from "@/assets/as-seen-on.png";

const TrustStrip = () => {
  return (
    <section className="py-10 md:py-14 border-y border-border bg-card">
      <div className="container mx-auto px-4">
        <div className="flex flex-col md:flex-row items-center justify-center gap-8 md:gap-16">
          {/* Rating */}
          <div className="flex items-center gap-3">
            <div className="flex text-gold">
              {[...Array(5)].map((_, i) => (
                <Star key={i} className="h-5 w-5 fill-current" />
              ))}
            </div>
            <span className="text-foreground font-semibold">4.9</span>
            <span className="text-muted-foreground">Rating</span>
          </div>

          {/* Divider */}
          <div className="hidden md:block w-px h-8 bg-border" />

          {/* Families served */}
          <div className="flex items-center gap-3">
            <Users className="h-5 w-5 text-primary" />
            <span className="text-foreground font-semibold">1,000+</span>
            <span className="text-muted-foreground">Families Served</span>
          </div>

          {/* Divider */}
          <div className="hidden md:block w-px h-8 bg-border" />

          {/* As seen on - Image */}
          <div className="flex items-center">
            <img 
              src={asSeenOnImage} 
              alt="As Seen On ABC, NBC, CBS, FOX" 
              className="max-w-[180px] md:max-w-[280px] h-auto"
            />
          </div>
        </div>
      </div>
    </section>
  );
};

export default TrustStrip;
