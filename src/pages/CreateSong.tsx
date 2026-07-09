import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Link } from "react-router-dom";
import Layout from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { validateStep } from "@/lib/songFormValidation";
import { useMetaPixel } from "@/hooks/useMetaPixel";
import { useGoogleAnalytics } from "@/hooks/useGoogleAnalytics";
import { useTikTokPixel } from "@/hooks/useTikTokPixel";
import { useUtmCapture, getStoredUtmParams } from "@/hooks/useUtmCapture";

// Form step components
import RecipientStep from "@/components/create/RecipientStep";
import DetailsStep from "@/components/create/DetailsStep";
import OccasionStep from "@/components/create/OccasionStep";
import GenreStep from "@/components/create/GenreStep";
import SingerVoiceStep from "@/components/create/SingerVoiceStep";
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
  smsOptIn: boolean;
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
  smsOptIn: false,
};

const TOTAL_STEPS = 8;

type StepMeta = { title: string; subtitle: string; autoAdvance: boolean };

const STEP_META: StepMeta[] = [
  { title: "Who is this song for?", subtitle: "Tap the person you're writing this for.", autoAdvance: true },
  { title: "What's their name?", subtitle: "First name is perfect — we'll sing it in the song.", autoAdvance: false },
  { title: "What's the occasion?", subtitle: "Pick the moment this song will celebrate.", autoAdvance: true },
  { title: "Choose a music style", subtitle: "Any vibe works — pick what they'd love most.", autoAdvance: true },
  { title: "Pick a singer voice", subtitle: "Choose the vocalist that fits the mood.", autoAdvance: true },
  { title: "Tell us their story", subtitle: "Your words guide the song — write from the heart.", autoAdvance: false },
  { title: "A message from your heart", subtitle: "Anything else we should try to weave in?", autoAdvance: false },
  { title: "Where should we send it?", subtitle: "Your song will be delivered here within 24 hours.", autoAdvance: false },
];

const CreateSong = () => {
  // Song creation multi-step form
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { trackEvent: trackMetaEvent } = useMetaPixel();
  const { trackEvent: trackGAEvent } = useGoogleAnalytics();
  const { trackEvent: trackTikTokEvent } = useTikTokPixel();
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
  const isAutoAdvancing = useRef(false);
  const autoAdvanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear auto-advance guard whenever step changes
  useEffect(() => {
    isAutoAdvancing.current = false;
    if (autoAdvanceTimer.current) {
      clearTimeout(autoAdvanceTimer.current);
      autoAdvanceTimer.current = null;
    }
  }, [currentStep]);

  const autoAdvance = useCallback(() => {
    if (isAutoAdvancing.current) return;
    isAutoAdvancing.current = true;
    autoAdvanceTimer.current = setTimeout(() => {
      setErrors({});
      setHasAttemptedContinue(false);
      setCurrentStep((prev) => {
        if (prev < TOTAL_STEPS) {
          window.scrollTo({ top: 0, behavior: "instant" });
          return prev + 1;
        }
        return prev;
      });
      autoAdvanceTimer.current = null;
    }, 400);
  }, []);

  // Track ViewContent once when user starts song creation
  useEffect(() => {
    if (!hasTrackedViewContent.current) {
      trackMetaEvent('ViewContent', { content_category: 'Custom Song' });
      trackGAEvent('song_creation_start', { content_category: 'Custom Song' });
      trackTikTokEvent('ViewContent', { content_type: 'product', content_name: 'Custom Song' });
      hasTrackedViewContent.current = true;
    }
  }, [trackMetaEvent, trackGAEvent, trackTikTokEvent]);

  const progress = (currentStep / TOTAL_STEPS) * 100;
  const currentMeta = STEP_META[currentStep - 1];
  const isAutoAdvanceStep = currentMeta?.autoAdvance ?? false;

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
        value: 49,
        currency: 'USD',
        em: formData.yourEmail,
        ph: formData.phoneNumber || undefined,
      });
      
      // Google Analytics
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

      // TikTok
      trackTikTokEvent('AddToCart', {
        content_type: 'product',
        content_name: `Custom Song for ${formData.recipientName}`,
        value: 49,
        currency: 'USD',
      });
      
      // Persist form data so it survives Stripe redirect back-button
      sessionStorage.setItem("songFormData", JSON.stringify(formData));
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
        return <RecipientStep formData={formData} updateFormData={updateFormData} errors={errors} onAutoAdvance={autoAdvance} />;
      case 2:
        return <DetailsStep formData={formData} updateFormData={updateFormData} errors={errors} onEnterAdvance={nextStep} />;
      case 3:
        return <OccasionStep formData={formData} updateFormData={updateFormData} errors={errors} onAutoAdvance={autoAdvance} />;
      case 4:
        return <GenreStep formData={formData} updateFormData={updateFormData} errors={errors} onAutoAdvance={autoAdvance} />;
      case 5:
        return <SingerVoiceStep formData={formData} updateFormData={updateFormData} errors={errors} onAutoAdvance={autoAdvance} />;
      case 6:
        return <StoryStep formData={formData} updateFormData={updateFormData} errors={errors} />;
      case 7:
        return <FinalTouchesStep formData={formData} updateFormData={updateFormData} errors={errors} />;
      case 8:
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
            {currentMeta?.title}
          </h1>
          <p className="text-center text-muted-foreground mb-10">
            {currentMeta?.subtitle}
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

            {isAutoAdvanceStep ? (
              <span className="text-sm text-muted-foreground self-center">
                Tap a choice to continue
              </span>
            ) : (
              <Button
                onClick={nextStep}
                className="gap-2 px-8"
              >
                {currentStep === TOTAL_STEPS ? "Create My Song" : "Continue"}
                <ArrowRight className="h-4 w-4" />
              </Button>
            )}
          </div>

          {/* Micro-trust strip (shown on every step) */}
          <p className="mt-6 text-center text-xs text-muted-foreground">
            Songs from $29 ·{" "}
            <Link
              to="/refund"
              className="underline decoration-muted-foreground/40 hover:decoration-primary hover:text-primary transition-colors"
            >
              Free remake if you're not happy
            </Link>{" "}
            · Delivered within 24 hours
          </p>
        </div>
      </div>
    </Layout>
  );
};

export default CreateSong;
