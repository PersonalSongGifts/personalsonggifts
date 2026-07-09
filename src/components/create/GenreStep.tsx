import { FormData, FormErrors } from "@/pages/CreateSong";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface GenreStepProps {
  formData: FormData;
  updateFormData: (updates: Partial<FormData>) => void;
  errors: FormErrors;
  onAutoAdvance?: () => void;
}

const genres = [
  { id: "pop", label: "Pop" },
  { id: "country", label: "Country" },
  { id: "prayer", label: "Prayer" },
  { id: "rock", label: "Rock" },
  { id: "rnb", label: "R&B" },
  { id: "jazz", label: "Jazz" },
  { id: "acoustic", label: "Acoustic" },
  { id: "rap-hip-hop", label: "Rap / Hip-Hop" },
  { id: "indie", label: "Indie" },
  { id: "latin", label: "Latin" },
  { id: "kpop", label: "K-Pop" },
  { id: "edm-dance", label: "EDM / Dance" },
  { id: "bollywood", label: "Bollywood / Hindi" },
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
  { id: "hi", label: "Hindi" },
  { id: "tl", label: "Filipino (Tagalog)" },
];

const GenreStep = ({ formData, updateFormData, errors, onAutoAdvance }: GenreStepProps) => {
  return (
    <div className="space-y-8">
      {errors.genre && (
        <p className="text-destructive text-sm text-center">{errors.genre}</p>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {genres.map((genre) => {
          const isSelected = formData.genre === genre.id;
          return (
            <Card
              key={genre.id}
              onClick={() => {
                updateFormData({ genre: genre.id });
                onAutoAdvance?.();
              }}
              className={`p-4 text-center cursor-pointer transition-all duration-200 min-h-[56px] flex items-center justify-center ${
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

      {/* Language - compact dropdown, optional */}
      <div className="flex flex-wrap items-center gap-3 pt-2">
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

export default GenreStep;
