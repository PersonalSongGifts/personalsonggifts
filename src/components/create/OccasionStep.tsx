import { FormData, FormErrors } from "@/pages/CreateSong";
import { Card } from "@/components/ui/card";

interface OccasionStepProps {
  formData: FormData;
  updateFormData: (updates: Partial<FormData>) => void;
  errors: FormErrors;
  onAutoAdvance?: () => void;
}

const occasions = [
  { id: "valentines", label: "Valentine's Day" },
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
  return (
    <div className="space-y-8">
      {errors.occasion && (
        <p className="text-destructive text-sm text-center">{errors.occasion}</p>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
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
