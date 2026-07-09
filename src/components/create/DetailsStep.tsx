import { FormData, FormErrors } from "@/pages/CreateSong";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface DetailsStepProps {
  formData: FormData;
  updateFormData: (updates: Partial<FormData>) => void;
  errors: FormErrors;
  onEnterAdvance?: () => void;
}

const DetailsStep = ({ formData, updateFormData, errors, onEnterAdvance }: DetailsStepProps) => {
  return (
    <div className="space-y-6">
      {/* Recipient Name */}
      <div className="space-y-2">
        <Label htmlFor="recipientName" className="text-base">
          What's their name? <span className="text-destructive">*</span>
        </Label>
        <Input
          id="recipientName"
          value={formData.recipientName}
          onChange={(e) => updateFormData({ recipientName: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onEnterAdvance?.();
            }
          }}
          placeholder="Enter their first name"
          className={`text-lg py-6 ${errors.recipientName ? "border-destructive" : ""}`}
        />
        {errors.recipientName && (
          <p className="text-destructive text-sm">{errors.recipientName}</p>
        )}
      </div>
    </div>
  );
};

export default DetailsStep;
