import { FormData } from "@/pages/CreateSong";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Minus } from "lucide-react";

interface FinalTouchesStepProps {
  formData: FormData;
  updateFormData: (updates: Partial<FormData>) => void;
}

const FinalTouchesStep = ({ formData, updateFormData }: FinalTouchesStepProps) => {
  return (
    <div className="space-y-8">
      <div className="bg-secondary/50 rounded-lg p-4 text-center">
        <p className="text-muted-foreground">
          Each song has its own voice — a unique reflection of your story and words.
        </p>
      </div>

      {/* Phrases to include */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Plus className="h-5 w-5 text-primary" />
          <Label htmlFor="phrasesToInclude" className="text-lg font-semibold">
            Any phrases or words to include? <span className="text-muted-foreground text-sm font-normal">(optional)</span>
          </Label>
        </div>
        <Textarea
          id="phrasesToInclude"
          value={formData.phrasesToInclude}
          onChange={(e) => updateFormData({ phrasesToInclude: e.target.value })}
          placeholder="e.g., 'my sunshine', 'forever and always', 'dancing under the stars'..."
          className="text-lg min-h-[100px] resize-none"
          maxLength={300}
        />
        <p className="text-sm text-muted-foreground">
          Special phrases, pet names, or inside jokes you'd like us to try to include.
        </p>
      </div>

      {/* Things to avoid */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Minus className="h-5 w-5 text-muted-foreground" />
          <Label htmlFor="thingsToAvoid" className="text-lg font-semibold">
            Anything to avoid mentioning? <span className="text-muted-foreground text-sm font-normal">(optional)</span>
          </Label>
        </div>
        <Textarea
          id="thingsToAvoid"
          value={formData.thingsToAvoid}
          onChange={(e) => updateFormData({ thingsToAvoid: e.target.value })}
          placeholder="e.g., 'Please don't mention...' or 'Avoid references to...'"
          className="text-lg min-h-[100px] resize-none"
          maxLength={300}
        />
        <p className="text-sm text-muted-foreground">
          Let us know if there's anything sensitive we should be mindful of.
        </p>
      </div>
    </div>
  );
};

export default FinalTouchesStep;
