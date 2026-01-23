import { FormData } from "@/pages/CreateSong";
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

interface OccasionStepProps {
  formData: FormData;
  updateFormData: (updates: Partial<FormData>) => void;
}

const occasions = [
  { id: "anniversary", label: "Anniversary", icon: Heart },
  { id: "wedding", label: "Wedding", icon: HeartHandshake },
  { id: "birthday", label: "Birthday", icon: Cake },
  { id: "valentines", label: "Valentine's Day", icon: Sparkles },
  { id: "memorial", label: "Memorial", icon: Star },
  { id: "baby", label: "Baby / Lullaby", icon: Baby },
  { id: "family", label: "Family", icon: Users },
  { id: "just-because", label: "Just Because", icon: PartyPopper },
];

const OccasionStep = ({ formData, updateFormData }: OccasionStepProps) => {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {occasions.map((occasion) => {
        const isSelected = formData.occasion === occasion.id;
        return (
          <Card
            key={occasion.id}
            onClick={() => updateFormData({ occasion: occasion.id })}
            className={`p-6 text-center cursor-pointer transition-all duration-200 hover:shadow-card ${
              isSelected 
                ? "ring-2 ring-primary bg-primary/5 border-primary" 
                : "hover:border-primary/50"
            }`}
          >
            <div className={`w-12 h-12 mx-auto mb-3 rounded-full flex items-center justify-center ${
              isSelected ? "bg-primary text-primary-foreground" : "bg-secondary"
            }`}>
              <occasion.icon className="h-6 w-6" />
            </div>
            <span className="font-medium text-foreground text-sm">{occasion.label}</span>
          </Card>
        );
      })}
    </div>
  );
};

export default OccasionStep;
