import { useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import Layout from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { validateStep } from "@/lib/songFormValidation";

// Form step components
import RecipientStep from "@/components/create/RecipientStep";
import DetailsStep from "@/components/create/DetailsStep";
import OccasionStep from "@/components/create/OccasionStep";
import MusicStyleStep from "@/components/create/MusicStyleStep";
import StoryStep from "@/components/create/StoryStep";
import FinalTouchesStep from "@/components/create/FinalTouchesStep";
import YourDetailsStep from "@/components/create/YourDetailsStep";

export interface FormData {
  // Step 1: Recipient
  recipientType: string;
  // Step 2: Details (simplified)
  recipientName: string;
  // Step 3: Occasion
  occasion: string;
  // Step 4: Music Style (no mood)
  genre: string;
  singerPreference: string;
  // Step 5: Story (includes relationship)
  specialQualities: string;
  favoriteMemory: string;
  relationship: string;
  // Step 6: Final touches (simplified)
  specialMessage: string;
  // Step 7: Your details
  yourName: string;
  yourEmail: string;
  phoneNumber: string;
}

export type FormErrors = Partial<Record<keyof FormData, string>>;

const initialFormData: FormData = {
  recipientType: "",
  recipientName: "",
  occasion: "",
  genre: "",
  singerPreference: "",
  specialQualities: "",
  favoriteMemory: "",
  relationship: "",
  specialMessage: "",
  yourName: "",
  yourEmail: "",
  phoneNumber: "",
};

const TOTAL_STEPS = 7;

const stepTitles = [
  "Who Is This Song For?",
  "Tell Us Their Name",
  "What's the Occasion?",
  "Choose a Genre",
  "Share Your Story",
  "A Message From Your Heart",
  "Your Details",
];

const CreateSong = () => {
  // Song creation multi-step form
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState<FormData>(() => {
    const occasion = searchParams.get("occasion");
    return {
      ...initialFormData,
      occasion: occasion || "",
    };
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [hasAttemptedContinue, setHasAttemptedContinue] = useState(false);

  const progress = (currentStep / TOTAL_STEPS) * 100;

  const updateFormData = (updates: Partial<FormData>) => {
    setFormData((prev) => ({ ...prev, ...updates }));
    // Clear errors for updated fields
    if (hasAttemptedContinue) {
      const updatedFields = Object.keys(updates) as (keyof FormData)[];
      setErrors((prev) => {
        const newErrors = { ...prev };
        updatedFields.forEach((field) => {
          delete newErrors[field];
        });
        return newErrors;
      });
    }
  };

  const nextStep = () => {
    setHasAttemptedContinue(true);
    const stepErrors = validateStep(currentStep, formData);
    
    if (Object.keys(stepErrors).length > 0) {
      setErrors(stepErrors as FormErrors);
      return;
    }
    
    setErrors({});
    setHasAttemptedContinue(false);
    
    if (currentStep < TOTAL_STEPS) {
      setCurrentStep((prev) => prev + 1);
      window.scrollTo({ top: 0, behavior: "instant" });
    } else {
      // Submit form - go to checkout
      navigate("/checkout", { state: { formData } });
    }
  };

  const prevStep = () => {
    if (currentStep > 1) {
      setErrors({});
      setHasAttemptedContinue(false);
      setCurrentStep((prev) => prev - 1);
      window.scrollTo({ top: 0, behavior: "instant" });
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return <RecipientStep formData={formData} updateFormData={updateFormData} errors={errors} />;
      case 2:
        return <DetailsStep formData={formData} updateFormData={updateFormData} errors={errors} />;
      case 3:
        return <OccasionStep formData={formData} updateFormData={updateFormData} errors={errors} />;
      case 4:
        return <MusicStyleStep formData={formData} updateFormData={updateFormData} errors={errors} />;
      case 5:
        return <StoryStep formData={formData} updateFormData={updateFormData} errors={errors} />;
      case 6:
        return <FinalTouchesStep formData={formData} updateFormData={updateFormData} errors={errors} />;
      case 7:
        return <YourDetailsStep formData={formData} updateFormData={updateFormData} errors={errors} />;
      default:
        return null;
    }
  };

  return (
    <Layout showPromoBanner={false}>
      <div className="min-h-[calc(100vh-5rem)] py-8 md:py-12">
        <div className="container mx-auto px-4 max-w-2xl">
          {/* Progress */}
          <div className="mb-8">
            <div className="flex justify-between text-sm text-muted-foreground mb-2">
              <span>Step {currentStep} of {TOTAL_STEPS}</span>
              <span>{Math.round(progress)}% complete</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>

          {/* Step title */}
          <h1 className="text-3xl md:text-4xl font-display text-foreground text-center mb-2">
            {stepTitles[currentStep - 1]}
          </h1>
          <p className="text-center text-muted-foreground mb-10">
            Take your time — there's no wrong answer.
          </p>

          {/* Step content */}
          <div className="animate-fade-in">
            {renderStep()}
          </div>

          {/* Navigation */}
          <div className="flex justify-between mt-12 pt-8 border-t border-border">
            <Button
              variant="ghost"
              onClick={prevStep}
              disabled={currentStep === 1}
              className="gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>

            <Button
              onClick={nextStep}
              className="gap-2 px-8"
            >
              {currentStep === TOTAL_STEPS ? "Continue to Checkout" : "Continue"}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default CreateSong;
