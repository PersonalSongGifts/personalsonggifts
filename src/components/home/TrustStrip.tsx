import { Star, Users, Award } from "lucide-react";

const TrustStrip = () => {
  const logos = ["ABC", "NBC", "CBS", "FOX"];

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

          {/* As seen on */}
          <div className="flex items-center gap-4">
            <span className="text-muted-foreground text-sm">As Seen On:</span>
            <div className="flex items-center gap-3">
              {logos.map((logo) => (
                <span 
                  key={logo}
                  className="text-muted-foreground/60 font-bold text-sm tracking-wide"
                >
                  {logo}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default TrustStrip;
