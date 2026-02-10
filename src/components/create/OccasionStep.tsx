import { FormData, FormErrors } from "@/pages/CreateSong";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface OccasionStepProps {
  formData: FormData;
  updateFormData: (updates: Partial<FormData>) => void;
  errors: FormErrors;
  onAutoAdvance?: () => void;
}

// ========================================
// CONFIGURABLE FEATURED OCCASION
// Change this for seasonal promotions
// ========================================
const featuredOccasion = {
  id: "valentines",
  label: "Valentine's Day",
  emoji: "❤️",
};

const occasions = [
  { id: "wedding", label: "Wedding" },
  { id: "anniversary", label: "Anniversary" },
  { id: "baby", label: "Baby Lullaby" },
  { id: "memorial", label: "Memorial Tribute" },
  { id: "pet-celebration", label: "Pet Celebration" },
  { id: "pet-memorial", label: "Pet Memorial" },
  { id: "milestone", label: "Milestone" },
  { id: "birthday", label: "Birthday" },
  { id: "graduation", label: "Graduation" },
  { id: "retirement", label: "Retirement" },
  { id: "mothers-day", label: "Mother's Day" },
  { id: "fathers-day", label: "Father's Day" },
  { id: "proposal", label: "Proposal" },
  { id: "friendship", label: "Friendship" },
  { id: "thank-you", label: "Thank You" },
  { id: "custom", label: "Custom" },
];

const OccasionStep = ({ formData, updateFormData, errors, onAutoAdvance }: OccasionStepProps) => {
  const isFeaturedSelected = formData.occasion === featuredOccasion.id;

  return (
    <div className="space-y-8">
      {errors.occasion && (
        <p className="text-destructive text-sm text-center">{errors.occasion}</p>
      )}
      {/* Featured Occasion Button */}
      <div className="flex justify-center">
        <Button
          variant={isFeaturedSelected ? "default" : "outline"}
          size="lg"
          onClick={() => {
            updateFormData({ occasion: featuredOccasion.id });
            onAutoAdvance?.();
          }}
          className={`px-12 py-8 text-xl font-semibold transition-all duration-200 ${
            isFeaturedSelected 
              ? "ring-2 ring-primary ring-offset-2 bg-primary text-primary-foreground" 
              : "hover:border-primary hover:bg-primary/5"
          }`}
        >
          <span className="mr-2">{featuredOccasion.emoji}</span>
          {featuredOccasion.label}
          <span className="ml-2">{featuredOccasion.emoji}</span>
        </Button>
      </div>

      {/* Divider */}
      <div className="flex items-center gap-4">
        <div className="flex-1 h-px bg-border" />
        <span className="text-muted-foreground text-sm">or choose another occasion</span>
        <div className="flex-1 h-px bg-border" />
      </div>

      {/* Other Occasions Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {occasions.map((occasion) => {
          const isSelected = formData.occasion === occasion.id;
          return (
            <Card
              key={occasion.id}
              onClick={() => {
                updateFormData({ occasion: occasion.id });
                onAutoAdvance?.();
              }}
              className={`p-4 text-center cursor-pointer transition-all duration-200 ${
                isSelected 
                  ? "ring-2 ring-primary bg-primary/5 border-primary" 
                  : "hover:border-primary/50"
              }`}
            >
              <span className={`font-medium text-sm ${isSelected ? "text-primary" : "text-foreground"}`}>
                {occasion.label}
              </span>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default OccasionStep;
