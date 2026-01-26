import { FormData } from "@/pages/CreateSong";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface DetailsStepProps {
  formData: FormData;
  updateFormData: (updates: Partial<FormData>) => void;
}

const DetailsStep = ({ formData, updateFormData }: DetailsStepProps) => {
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
          placeholder="Enter their first name"
          className="text-lg py-6"
        />
      </div>
    </div>
  );
};

export default DetailsStep;
