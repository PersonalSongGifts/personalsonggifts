import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { 
  Heart, 
  Cake, 
  PartyPopper, 
  Baby, 
  Users, 
  Sparkles,
  HeartHandshake,
  Star
} from "lucide-react";

const occasions = [
  { 
    id: "anniversary", 
    label: "Anniversary", 
    icon: Heart, 
    description: "Celebrate your years together",
    color: "text-rose-500"
  },
  { 
    id: "wedding", 
    label: "Wedding", 
    icon: HeartHandshake, 
    description: "A gift for the happy couple",
    color: "text-pink-500"
  },
  { 
    id: "birthday", 
    label: "Birthday", 
    icon: Cake, 
    description: "Make their day unforgettable",
    color: "text-amber-500"
  },
  { 
    id: "valentines", 
    label: "Valentine's Day", 
    icon: Sparkles, 
    description: "Express your love",
    color: "text-red-500"
  },
  { 
    id: "memorial", 
    label: "Memorial", 
    icon: Star, 
    description: "Honor someone special",
    color: "text-indigo-500"
  },
  { 
    id: "baby", 
    label: "Baby / Lullaby", 
    icon: Baby, 
    description: "Welcome a new life",
    color: "text-sky-500"
  },
  { 
    id: "family", 
    label: "Family", 
    icon: Users, 
    description: "Celebrate your bond",
    color: "text-emerald-500"
  },
  { 
    id: "just-because", 
    label: "Just Because", 
    icon: PartyPopper, 
    description: "No reason needed",
    color: "text-violet-500"
  },
];

const OccasionsGrid = () => {
  return (
    <section id="occasions" className="py-16 md:py-24 bg-secondary/30">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="font-display text-foreground mb-4">
            Every Occasion Deserves a Song
          </h2>
          <p className="text-body text-muted-foreground max-w-2xl mx-auto">
            Choose your occasion and we'll help you create something unforgettable
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 max-w-5xl mx-auto">
          {occasions.map((occasion) => (
            <Link 
              key={occasion.id}
              to={`/create?occasion=${occasion.id}`}
              className="block"
            >
              <Card className="p-6 text-center hover:shadow-card hover:-translate-y-1 transition-all duration-300 h-full bg-card border-border group">
                <div className={`w-14 h-14 mx-auto mb-4 rounded-full bg-secondary flex items-center justify-center group-hover:scale-110 transition-transform duration-300`}>
                  <occasion.icon className={`h-7 w-7 ${occasion.color}`} />
                </div>
                <h4 className="font-semibold text-foreground mb-1">
                  {occasion.label}
                </h4>
                <p className="text-sm text-muted-foreground">
                  {occasion.description}
                </p>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
};

export default OccasionsGrid;
