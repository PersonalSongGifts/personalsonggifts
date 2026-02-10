import { Card } from "@/components/ui/card";
import { 
  Heart, 
  User, 
  Users, 
  Baby, 
  UserCheck, 
  Sparkles,
  PawPrint
} from "lucide-react";

import { FormData, FormErrors } from "@/pages/CreateSong";

interface RecipientStepProps {
  formData: FormData;
  updateFormData: (updates: Partial<FormData>) => void;
  errors: FormErrors;
  onAutoAdvance?: () => void;
}

const recipientOptions = [
  { id: "husband", label: "Husband", icon: Heart },
  { id: "wife", label: "Wife", icon: Heart },
  { id: "partner", label: "Partner", icon: Heart },
  { id: "parent", label: "Parent", icon: Users },
  { id: "child", label: "Child", icon: Baby },
  { id: "friend", label: "Friend", icon: UserCheck },
  { id: "pet", label: "Pet", icon: PawPrint },
  { id: "myself", label: "Myself", icon: User },
  { id: "other", label: "Other", icon: Sparkles },
];

const RecipientStep = ({ formData, updateFormData, errors, onAutoAdvance }: RecipientStepProps) => {
  return (
    <div className="space-y-4">
      {errors.recipientType && (
        <p className="text-destructive text-sm text-center">{errors.recipientType}</p>
      )}
      <div className="grid grid-cols-3 md:grid-cols-3 gap-4">
      {recipientOptions.map((option) => {
        const isSelected = formData.recipientType === option.id;
        return (
          <Card
            key={option.id}
            onClick={() => {
              updateFormData({ recipientType: option.id });
              onAutoAdvance?.();
            }}
            className={`p-6 text-center cursor-pointer transition-all duration-200 hover:shadow-card ${
              isSelected 
                ? "ring-2 ring-primary bg-primary/5 border-primary" 
                : "hover:border-primary/50"
            }`}
          >
            <div className={`w-12 h-12 mx-auto mb-3 rounded-full flex items-center justify-center ${
              isSelected ? "bg-primary text-primary-foreground" : "bg-secondary"
            }`}>
              <option.icon className="h-6 w-6" />
            </div>
            <span className="font-medium text-foreground">{option.label}</span>
          </Card>
        );
      })}
      </div>
    </div>
  );
};

export default RecipientStep;
