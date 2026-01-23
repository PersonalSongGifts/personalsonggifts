import { FormData } from "@/pages/CreateSong";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Music, Mic, Heart } from "lucide-react";

interface MusicStyleStepProps {
  formData: FormData;
  updateFormData: (updates: Partial<FormData>) => void;
}

const genres = [
  { id: "country", label: "Country" },
  { id: "pop", label: "Pop" },
  { id: "acoustic", label: "Acoustic" },
  { id: "soft-rock", label: "Soft Rock" },
  { id: "gospel", label: "Gospel" },
  { id: "rnb", label: "R&B" },
  { id: "soul", label: "Soul" },
  { id: "folk", label: "Folk" },
  { id: "jazz", label: "Jazz" },
  { id: "classical", label: "Classical" },
  { id: "hip-hop", label: "Hip-Hop" },
  { id: "reggae", label: "Reggae" },
  { id: "surprise", label: "Surprise Me" },
];

const singerOptions = [
  { id: "male", label: "Male Voice" },
  { id: "female", label: "Female Voice" },
  { id: "duet", label: "Duet" },
  { id: "surprise", label: "Surprise Me" },
];

const moodOptions = [
  { id: "uplifting", label: "Uplifting" },
  { id: "emotional", label: "Emotional" },
  { id: "playful", label: "Playful" },
  { id: "romantic", label: "Romantic" },
  { id: "nostalgic", label: "Nostalgic" },
  { id: "celebratory", label: "Celebratory" },
  { id: "heartfelt", label: "Heartfelt" },
  { id: "inspirational", label: "Inspirational" },
];

const MusicStyleStep = ({ formData, updateFormData }: MusicStyleStepProps) => {
  return (
    <div className="space-y-10">
      {/* Genre */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Music className="h-5 w-5 text-primary" />
          <Label className="text-lg font-semibold">
            What style of music? <span className="text-destructive">*</span>
          </Label>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {genres.map((genre) => {
            const isSelected = formData.genre === genre.id;
            return (
              <Card
                key={genre.id}
                onClick={() => updateFormData({ genre: genre.id })}
                className={`p-4 text-center cursor-pointer transition-all duration-200 ${
                  isSelected 
                    ? "ring-2 ring-primary bg-primary/5 border-primary" 
                    : "hover:border-primary/50"
                }`}
              >
                <span className={`font-medium ${isSelected ? "text-primary" : "text-foreground"}`}>
                  {genre.label}
                </span>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Singer preference */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Mic className="h-5 w-5 text-primary" />
          <Label className="text-lg font-semibold">
            Singer preference <span className="text-destructive">*</span>
          </Label>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {singerOptions.map((option) => {
            const isSelected = formData.singerPreference === option.id;
            return (
              <Card
                key={option.id}
                onClick={() => updateFormData({ singerPreference: option.id })}
                className={`p-4 text-center cursor-pointer transition-all duration-200 ${
                  isSelected 
                    ? "ring-2 ring-primary bg-primary/5 border-primary" 
                    : "hover:border-primary/50"
                }`}
              >
                <span className={`font-medium ${isSelected ? "text-primary" : "text-foreground"}`}>
                  {option.label}
                </span>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Mood */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Heart className="h-5 w-5 text-primary" />
          <Label className="text-lg font-semibold">
            What mood? <span className="text-destructive">*</span>
          </Label>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {moodOptions.map((option) => {
            const isSelected = formData.mood === option.id;
            return (
              <Card
                key={option.id}
                onClick={() => updateFormData({ mood: option.id })}
                className={`p-4 text-center cursor-pointer transition-all duration-200 ${
                  isSelected 
                    ? "ring-2 ring-primary bg-primary/5 border-primary" 
                    : "hover:border-primary/50"
                }`}
              >
                <span className={`font-medium ${isSelected ? "text-primary" : "text-foreground"}`}>
                  {option.label}
                </span>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default MusicStyleStep;
