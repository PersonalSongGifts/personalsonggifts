import { Star, Users } from "lucide-react";

const TrustStrip = () => {
  return (
    <section className="py-6 md:py-8 border-y border-border bg-card">
      <div className="container mx-auto px-4">
        {/* Stats row - centered */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-6 sm:gap-12 md:gap-16">
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
      </div>
    </section>
  );
};

export default TrustStrip;
