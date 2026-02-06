import { useState, useEffect, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import Layout from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { validateStep } from "@/lib/songFormValidation";
import { useMetaPixel } from "@/hooks/useMetaPixel";
import { useGoogleAnalytics } from "@/hooks/useGoogleAnalytics";
import { useUtmCapture, getStoredUtmParams } from "@/hooks/useUtmCapture";

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
  lyricsLanguageCode: string; // NEW: Language for lyrics
  // Step 5: Story
  specialQualities: string;
  favoriteMemory: string;
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
  lyricsLanguageCode: "en", // Default to English
  specialQualities: "",
  favoriteMemory: "",
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
  const { trackEvent: trackMetaEvent } = useMetaPixel();
  const { trackEvent: trackGAEvent } = useGoogleAnalytics();
  const hasTrackedViewContent = useRef(false);
  
  // Capture UTM parameters on this page too (in case user lands here directly)
  useUtmCapture();
  
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

  // Track ViewContent once when user starts song creation
  useEffect(() => {
    if (!hasTrackedViewContent.current) {
      // Meta Pixel
      trackMetaEvent('ViewContent', {
        content_category: 'Custom Song',
      });
      // Google Analytics
      trackGAEvent('song_creation_start', {
        content_category: 'Custom Song',
      });
      hasTrackedViewContent.current = true;
    }
  }, [trackMetaEvent, trackGAEvent]);

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

  const captureLeadAsync = async (data: FormData) => {
    try {
      // Detect device type
      const width = window.innerWidth;
      let deviceType = "desktop";
      if (width < 768) {
        deviceType = "mobile";
      } else if (width < 1024) {
        deviceType = "tablet";
      }

      // Get stored UTM parameters
      const utmParams = getStoredUtmParams();

      // Auto-detect timezone for SMS quiet hours
      let timezone = "America/New_York";
      try {
        timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      } catch { /* fallback */ }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/capture-lead`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({
            email: data.yourEmail,
            phone: data.phoneNumber || undefined,
            customerName: data.yourName,
            recipientName: data.recipientName,
            recipientType: data.recipientType,
            occasion: data.occasion,
            genre: data.genre,
            singerPreference: data.singerPreference,
            specialQualities: data.specialQualities,
            favoriteMemory: data.favoriteMemory,
            specialMessage: data.specialMessage || undefined,
            lyricsLanguageCode: data.lyricsLanguageCode || "en",
            timezone,
            deviceType,
            // Include UTM parameters
            utmSource: utmParams.utm_source || undefined,
            utmMedium: utmParams.utm_medium || undefined,
            utmCampaign: utmParams.utm_campaign || undefined,
            utmContent: utmParams.utm_content || undefined,
            utmTerm: utmParams.utm_term || undefined,
          }),
        }
      );
      if (!response.ok) {
        console.error("Lead capture failed:", await response.text());
      } else {
        console.log("Lead captured successfully");
      }
    } catch (err) {
      // Fire-and-forget - don't block checkout
      console.error("Lead capture error:", err);
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
      // Capture lead (fire-and-forget, doesn't block checkout)
      captureLeadAsync(formData);

      // Fire AddToCart event with user data for Advanced Matching (Meta Pixel)
      trackMetaEvent('AddToCart', {
        content_name: formData.recipientName,
        content_category: formData.occasion,
        value: 49, // Base price
        currency: 'USD',
        em: formData.yourEmail, // Meta will hash this
        ph: formData.phoneNumber || undefined, // Meta will hash this
      });
      
      // Fire add_to_cart event (Google Analytics)
      trackGAEvent('add_to_cart', {
        currency: 'USD',
        value: 49,
        items: [{
          item_name: `Custom Song for ${formData.recipientName}`,
          item_category: formData.occasion,
          price: 49,
          quantity: 1,
        }],
      });
      
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
