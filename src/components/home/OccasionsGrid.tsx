import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { trackEvent } from "@/lib/amplitudeTrack";

// Import all occasion images
import weddingImg from "@/assets/occasions/wedding.jpg";
import anniversaryImg from "@/assets/occasions/anniversary.jpg";
import birthdayImg from "@/assets/occasions/birthday.jpg";
import valentinesImg from "@/assets/occasions/valentines.jpg";
import memorialImg from "@/assets/occasions/memorial.jpg";
import babyImg from "@/assets/occasions/baby.jpg";
import familyImg from "@/assets/occasions/family.jpg";
import justBecauseImg from "@/assets/occasions/just-because.jpg";
import petCelebrationImg from "@/assets/occasions/pet-celebration.jpg";
import petMemorialImg from "@/assets/occasions/pet-memorial.jpg";
import graduationImg from "@/assets/occasions/graduation.jpg";
import retirementImg from "@/assets/occasions/retirement.jpg";
import mothersDayImg from "@/assets/occasions/mothers-day.jpg";
import fathersDayImg from "@/assets/occasions/fathers-day.jpg";
import proposalImg from "@/assets/occasions/proposal.jpg";

const occasions = [
  { id: "wedding", label: "Wedding", image: weddingImg },
  { id: "anniversary", label: "Anniversary", image: anniversaryImg },
  { id: "birthday", label: "Birthday", image: birthdayImg },
  { id: "valentines", label: "Valentine's Day", image: valentinesImg },
  { id: "memorial", label: "Memorial", image: memorialImg },
  { id: "baby", label: "Baby / Lullaby", image: babyImg },
  { id: "family", label: "Family", image: familyImg },
  { id: "just-because", label: "Just Because", image: justBecauseImg },
  { id: "pet-celebration", label: "Pet Celebration", image: petCelebrationImg },
  { id: "pet-memorial", label: "Pet Memorial", image: petMemorialImg },
  { id: "graduation", label: "Graduation", image: graduationImg },
  { id: "retirement", label: "Retirement", image: retirementImg },
  { id: "mothers-day", label: "Mother's Day", image: mothersDayImg },
  { id: "fathers-day", label: "Father's Day", image: fathersDayImg },
  { id: "proposal", label: "Proposal", image: proposalImg },
];

const OccasionsGrid = () => {
  return (
    <section id="occasions" className="py-10 md:py-16 bg-secondary/30">
      <div className="container mx-auto px-4">
        <div className="text-center mb-8 md:mb-12">
          <h2 className="font-display text-foreground mb-3 md:mb-4">
            Every Occasion Deserves a Song
          </h2>
          <p className="text-body text-muted-foreground max-w-2xl mx-auto">
            Choose your occasion and we'll help you create something unforgettable
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4 max-w-6xl mx-auto">
          {occasions.map((occasion) => (
            <Link
              key={occasion.id}
              to={`/create?occasion=${occasion.id}`}
              className="group block"
              onClick={() => trackEvent("Occasion Card Clicked", { occasion: occasion.label })}
            >
              <div className="relative aspect-[4/3] rounded-xl overflow-hidden shadow-soft hover:shadow-elevated transition-shadow duration-300">
                {/* Background Image */}
                <img
                  src={occasion.image}
                  alt={occasion.label}
                  className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  loading="lazy"
                />
                
                {/* Gradient Overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                
                {/* Text Label */}
                <div className="absolute bottom-0 left-0 right-0 p-3 md:p-4">
                  <h4 className="text-white font-semibold text-sm md:text-base drop-shadow-md">
                    {occasion.label}
                  </h4>
                </div>
              </div>
            </Link>
          ))}
        </div>

        <div className="text-center mt-10">
          <Button asChild size="lg" className="text-lg px-8 py-6">
            <Link to="/create">Create Your Song</Link>
          </Button>
        </div>
      </div>
    </section>
  );
};

export default OccasionsGrid;
