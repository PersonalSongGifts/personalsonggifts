import { FormData, FormErrors } from "@/pages/CreateSong";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Music, Mic } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface MusicStyleStepProps {
  formData: FormData;
  updateFormData: (updates: Partial<FormData>) => void;
  errors: FormErrors;
}

const genres = [
  { id: "pop", label: "Pop" },
  { id: "country", label: "Country" },
  { id: "rock", label: "Rock" },
  { id: "rnb", label: "R&B" },
  { id: "jazz", label: "Jazz" },
  { id: "acoustic", label: "Acoustic" },
  { id: "rap-hip-hop", label: "Rap / Hip-Hop" },
  { id: "indie", label: "Indie" },
  { id: "latin", label: "Latin" },
  { id: "kpop", label: "K-Pop" },
  { id: "edm-dance", label: "EDM / Dance" },
];

const singerOptions = [
  { id: "male", label: "Male" },
  { id: "female", label: "Female" },
];

const languageOptions = [
  { id: "en", label: "English" },
  { id: "es", label: "Spanish" },
  { id: "fr", label: "French" },
  { id: "de", label: "German" },
  { id: "it", label: "Italian" },
  { id: "pt-BR", label: "Portuguese (Brazil)" },
  { id: "ja", label: "Japanese" },
  { id: "ko", label: "Korean" },
  { id: "sr", label: "Serbian" },
  { id: "hr", label: "Croatian" },
];

const MusicStyleStep = ({ formData, updateFormData, errors }: MusicStyleStepProps) => {
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
        {errors.genre && (
          <p className="text-destructive text-sm">{errors.genre}</p>
        )}
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
        {errors.singerPreference && (
          <p className="text-destructive text-sm">{errors.singerPreference}</p>
        )}
        <div className="grid grid-cols-2 gap-3 max-w-md">
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

      {/* Language - compact dropdown, optional */}
      <div className="flex items-center gap-4 mt-6">
        <Label htmlFor="language-select" className="text-sm text-muted-foreground whitespace-nowrap">
          Song language
        </Label>
        <Select
          value={formData.lyricsLanguageCode || "en"}
          onValueChange={(value) => updateFormData({ lyricsLanguageCode: value })}
        >
          <SelectTrigger id="language-select" className="w-48">
            <SelectValue placeholder="English" />
          </SelectTrigger>
          <SelectContent>
            {languageOptions.map((lang) => (
              <SelectItem key={lang.id} value={lang.id}>
                {lang.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">Default is English</span>
      </div>
    </div>
  );
};

export default MusicStyleStep;
