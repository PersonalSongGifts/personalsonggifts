import { FormData } from "@/pages/CreateSong";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

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

      {/* Name Pronunciation */}
      <div className="space-y-2">
        <Label htmlFor="namePronunciation" className="text-base">
          How should we say their name? <span className="text-muted-foreground">(optional)</span>
        </Label>
        <Input
          id="namePronunciation"
          value={formData.namePronunciation}
          onChange={(e) => updateFormData({ namePronunciation: e.target.value })}
          placeholder="e.g., 'eh-LEE-na' or 'emphasis on first syllable'"
          className="text-lg py-6"
        />
        <p className="text-sm text-muted-foreground">
          Help us pronounce their name correctly in the song.
        </p>
      </div>

      {/* Relationship context */}
      <div className="space-y-2">
        <Label htmlFor="relationship" className="text-base">
          Tell us a bit about your relationship <span className="text-muted-foreground">(optional)</span>
        </Label>
        <Textarea
          id="relationship"
          value={formData.relationship}
          onChange={(e) => updateFormData({ relationship: e.target.value })}
          placeholder="e.g., 'We've been married for 25 years' or 'She's my best friend since college'"
          className="text-lg min-h-[100px] resize-none"
        />
      </div>
    </div>
  );
};

export default DetailsStep;
