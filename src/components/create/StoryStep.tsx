import { FormData } from "@/pages/CreateSong";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, Star, Users } from "lucide-react";

interface StoryStepProps {
  formData: FormData;
  updateFormData: (updates: Partial<FormData>) => void;
}

const StoryStep = ({ formData, updateFormData }: StoryStepProps) => {
  return (
    <div className="space-y-8">
      <div className="bg-secondary/50 rounded-lg p-4 text-center">
        <p className="text-muted-foreground">
          ✨ Your words guide the song. Write from the heart — there's no wrong answer.
        </p>
      </div>

      {/* Relationship context - moved from Step 2 */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          <Label htmlFor="relationship" className="text-lg font-semibold">
            Tell us about your relationship <span className="text-destructive">*</span>
          </Label>
        </div>
        <Textarea
          id="relationship"
          value={formData.relationship}
          onChange={(e) => updateFormData({ relationship: e.target.value })}
          placeholder="e.g., 'We've been married for 25 years' or 'She's my best friend since college'"
          className="text-lg min-h-[100px] resize-none"
          maxLength={500}
        />
        <p className="text-sm text-muted-foreground text-right">
          {formData.relationship.length}/500 characters
        </p>
      </div>

      {/* Special qualities */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Star className="h-5 w-5 text-primary" />
          <Label htmlFor="specialQualities" className="text-lg font-semibold">
            What makes them special? <span className="text-destructive">*</span>
          </Label>
        </div>
        <Textarea
          id="specialQualities"
          value={formData.specialQualities}
          onChange={(e) => updateFormData({ specialQualities: e.target.value })}
          placeholder="e.g., 'She has the kindest heart, always puts others first, and has the most beautiful laugh...'"
          className="text-lg min-h-[120px] resize-none"
          maxLength={500}
        />
        <p className="text-sm text-muted-foreground text-right">
          {formData.specialQualities.length}/500 characters
        </p>
      </div>

      {/* Favorite memory */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <Label htmlFor="favoriteMemory" className="text-lg font-semibold">
            A favorite memory you share <span className="text-destructive">*</span>
          </Label>
        </div>
        <Textarea
          id="favoriteMemory"
          value={formData.favoriteMemory}
          onChange={(e) => updateFormData({ favoriteMemory: e.target.value })}
          placeholder="e.g., 'The night we danced in the rain on our first vacation together...'"
          className="text-lg min-h-[120px] resize-none"
          maxLength={500}
        />
        <p className="text-sm text-muted-foreground text-right">
          {formData.favoriteMemory.length}/500 characters
        </p>
      </div>
    </div>
  );
};

export default StoryStep;
