import { FormData, FormErrors } from "@/pages/CreateSong";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Heart } from "lucide-react";

interface FinalTouchesStepProps {
  formData: FormData;
  updateFormData: (updates: Partial<FormData>) => void;
  errors: FormErrors;
}

const FinalTouchesStep = ({ formData, updateFormData, errors }: FinalTouchesStepProps) => {
  return (
    <div className="space-y-6">
      <div className="bg-secondary/50 rounded-lg p-4 text-center">
        <p className="text-muted-foreground">
          Write anything else that you feel would be relevant to include in your song, and we'll do our best to include it!
        </p>
      </div>

      {/* Special message */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Heart className="h-5 w-5 text-primary" />
          <Label htmlFor="specialMessage" className="text-lg font-semibold">
            Special message
          </Label>
        </div>
        <Textarea
          id="specialMessage"
          value={formData.specialMessage}
          onChange={(e) => updateFormData({ specialMessage: e.target.value })}
          placeholder="e.g., 'Please mention our wedding dance' or 'Include a line about her love for sunflowers'..."
          className="text-lg min-h-[150px] resize-none"
          maxLength={500}
        />
        <p className="text-sm text-muted-foreground text-right">
          {formData.specialMessage.length}/500 characters
        </p>
      </div>
    </div>
  );
};

export default FinalTouchesStep;
