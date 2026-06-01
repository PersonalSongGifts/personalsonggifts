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
  { id: "proposal", label: "Proposal" },
  { id: "friendship", label: "Friendship" },
  { id: "thank-you", label: "Thank You" },
  { id: "custom", label: "Custom" },
];

const OccasionStep = ({ formData, updateFormData, errors, onAutoAdvance }: OccasionStepProps) => {
  const isFathersSelected = formData.occasion === "fathers-day";

  return (
    <div className="space-y-6">
      {errors.occasion && (
        <p className="text-destructive text-sm text-center">{errors.occasion}</p>
      )}

      {/* Featured Father's Day Button */}
      <div className="flex justify-center">
        <button
          type="button"
          onClick={() => {
            updateFormData({ occasion: "fathers-day" });
            onAutoAdvance?.();
          }}
          className={`w-full max-w-md mx-auto flex flex-col items-center gap-1 rounded-xl border-2 px-6 py-5 cursor-pointer transition-all duration-200 ${
            isFathersSelected
              ? "border-blue-500 ring-2 ring-blue-400 bg-gradient-to-r from-blue-100 to-sky-100 shadow-lg"
              : "border-blue-300 bg-gradient-to-r from-blue-50 to-sky-50 hover:border-blue-400 hover:shadow-md"
          }`}
        >
          <span className="text-lg sm:text-xl font-bold text-blue-700">
            🤵 💙 Father's Day 💙 🤵
          </span>
          <span className="text-sm text-blue-500">👔 🎩 ⛳</span>
        </button>
      </div>

      {/* Regular Occasion Grid */}
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
