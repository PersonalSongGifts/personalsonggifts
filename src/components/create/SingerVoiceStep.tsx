import { FormData, FormErrors } from "@/pages/CreateSong";
import { Card } from "@/components/ui/card";

interface SingerVoiceStepProps {
  formData: FormData;
  updateFormData: (updates: Partial<FormData>) => void;
  errors: FormErrors;
  onAutoAdvance?: () => void;
}

const singerOptions = [
  { id: "female", label: "Female voice" },
  { id: "male", label: "Male voice" },
];

const SingerVoiceStep = ({ formData, updateFormData, errors, onAutoAdvance }: SingerVoiceStepProps) => {
  return (
    <div className="space-y-4">
      {errors.singerPreference && (
        <p className="text-destructive text-sm text-center">{errors.singerPreference}</p>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-md mx-auto">
        {singerOptions.map((option) => {
          const isSelected = formData.singerPreference === option.id;
          return (
            <Card
              key={option.id}
              onClick={() => {
                updateFormData({ singerPreference: option.id });
                onAutoAdvance?.();
              }}
              className={`p-6 text-center cursor-pointer transition-all duration-200 min-h-[64px] flex items-center justify-center ${
                isSelected
                  ? "ring-2 ring-primary bg-primary/5 border-primary"
                  : "hover:border-primary/50"
              }`}
            >
              <span className={`font-medium text-lg ${isSelected ? "text-primary" : "text-foreground"}`}>
                {option.label}
              </span>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default SingerVoiceStep;
