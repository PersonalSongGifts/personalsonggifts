import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import Layout from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, ArrowRight } from "lucide-react";

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
  // Step 2: Details
  recipientName: string;
  namePronunciation: string;
  relationship: string;
  // Step 3: Occasion
  occasion: string;
  // Step 4: Music Style
  genre: string;
  singerPreference: string;
  mood: string;
  // Step 5: Story
  specialQualities: string;
  favoriteMemory: string;
  whatYouLove: string;
  // Step 6: Final touches
  phrasesToInclude: string;
  thingsToAvoid: string;
  // Step 7: Your details
  yourName: string;
  yourEmail: string;
}

const initialFormData: FormData = {
  recipientType: "",
  recipientName: "",
  namePronunciation: "",
  relationship: "",
  occasion: "",
  genre: "",
  singerPreference: "",
  mood: "",
  specialQualities: "",
  favoriteMemory: "",
  whatYouLove: "",
  phrasesToInclude: "",
  thingsToAvoid: "",
  yourName: "",
  yourEmail: "",
};

const TOTAL_STEPS = 7;

const stepTitles = [
  "Who Is This Song For?",
  "Tell Us About Them",
  "What's the Occasion?",
  "Choose Your Music Style",
  "Share Your Story",
  "Final Touches",
  "Your Details",
];

const CreateSong = () => {
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

  const progress = (currentStep / TOTAL_STEPS) * 100;

  const updateFormData = (updates: Partial<FormData>) => {
    setFormData((prev) => ({ ...prev, ...updates }));
  };

  const nextStep = () => {
    if (currentStep < TOTAL_STEPS) {
      setCurrentStep((prev) => prev + 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      // Submit form - go to checkout
      navigate("/checkout", { state: { formData } });
    }
  };

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep((prev) => prev - 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const canProceed = (): boolean => {
    switch (currentStep) {
      case 1:
        return !!formData.recipientType;
      case 2:
        return !!formData.recipientName;
      case 3:
        return !!formData.occasion;
      case 4:
        return !!formData.genre;
      case 5:
        return !!formData.specialQualities && !!formData.whatYouLove;
      case 6:
        return true; // Optional step
      case 7:
        return !!formData.yourName && !!formData.yourEmail;
      default:
        return false;
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return <RecipientStep formData={formData} updateFormData={updateFormData} />;
      case 2:
        return <DetailsStep formData={formData} updateFormData={updateFormData} />;
      case 3:
        return <OccasionStep formData={formData} updateFormData={updateFormData} />;
      case 4:
        return <MusicStyleStep formData={formData} updateFormData={updateFormData} />;
      case 5:
        return <StoryStep formData={formData} updateFormData={updateFormData} />;
      case 6:
        return <FinalTouchesStep formData={formData} updateFormData={updateFormData} />;
      case 7:
        return <YourDetailsStep formData={formData} updateFormData={updateFormData} />;
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
              disabled={!canProceed()}
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
