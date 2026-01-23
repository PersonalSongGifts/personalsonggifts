import { FormData } from "@/pages/CreateSong";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Heart, Sparkles, Star } from "lucide-react";

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
            A favorite memory you share <span className="text-muted-foreground text-sm font-normal">(optional)</span>
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

      {/* What you love most */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Heart className="h-5 w-5 text-primary" />
          <Label htmlFor="whatYouLove" className="text-lg font-semibold">
            What do you love most about them? <span className="text-destructive">*</span>
          </Label>
        </div>
        <Textarea
          id="whatYouLove"
          value={formData.whatYouLove}
          onChange={(e) => updateFormData({ whatYouLove: e.target.value })}
          placeholder="e.g., 'The way she looks at me, her dedication to our family, how she makes every day brighter...'"
          className="text-lg min-h-[120px] resize-none"
          maxLength={500}
        />
        <p className="text-sm text-muted-foreground text-right">
          {formData.whatYouLove.length}/500 characters
        </p>
      </div>
    </div>
  );
};

export default StoryStep;
