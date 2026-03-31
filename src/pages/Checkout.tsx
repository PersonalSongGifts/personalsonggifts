// force rebuild
import { useLocation, useNavigate, Link } from "react-router-dom";
import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import Layout from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Check, 
  Clock, 
  Zap, 
  Shield, 
  Mail, 
  CreditCard,
  ArrowLeft,
  Loader2,
  Tag,
  X
} from "lucide-react";
import { FormData } from "@/pages/CreateSong";
import ValentineDeliveryNotice from "@/components/checkout/ValentineDeliveryNotice";
import { useToast } from "@/hooks/use-toast";
import { useMetaPixel } from "@/hooks/useMetaPixel";
import { useGoogleAnalytics } from "@/hooks/useGoogleAnalytics";
import { useTikTokPixel } from "@/hooks/useTikTokPixel";
import { getStoredUtmParams } from "@/hooks/useUtmCapture";
import { normalizeToE164 } from "@/lib/phoneUtils";
import { useActivePromo } from "@/hooks/useActivePromo";

type PricingTier = "standard" | "priority";

interface AdditionalPromo {
  code: string;
  type: "amount_off" | "percent_off";
  amount_off?: number; // in cents
  percent_off?: number;
  name: string;
}

// Get active promo info based on PST time
function getActivePromo() {
  // Feb 15, 2026 at 1:00 AM PST (UTC-8) = 9:00 AM UTC
  const switchDate = new Date("2026-02-15T09:00:00.000Z");
  const now = new Date();
  
  if (now < switchDate) {
    return { code: "VALENTINES50", emoji: "💘" };
  }
  return { code: "WELCOME50", emoji: "🎵" };
}

// All pricing math in integer cents with Math.floor to avoid float drift.
// Only converted to dollars for display rendering.
const BASE_PRICES_CENTS = { standard: 9999, priority: 15999 };
const SEASONAL_DISCOUNT_PERCENT = 50;

function calculateSeasonalPriceCents(tier: PricingTier): number {
  // Integer arithmetic: 9999 * 50 / 100 = 499950 / 100 = 4999.5 → floor → 4999 ($49.99)
  return Math.floor(BASE_PRICES_CENTS[tier] * (100 - SEASONAL_DISCOUNT_PERCENT) / 100);
}

// Returns discount amount in cents
function calculateAdditionalDiscountCents(afterSeasonalCents: number, promo: AdditionalPromo): number {
  if (promo.type === "amount_off" && promo.amount_off) {
    return Math.min(promo.amount_off, afterSeasonalCents); // both in cents, capped
  }
  if (promo.type === "percent_off" && promo.percent_off) {
    return afterSeasonalCents - Math.floor(afterSeasonalCents * (100 - promo.percent_off) / 100);
  }
  return 0;
}

const Checkout = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { trackEvent: trackMetaEvent } = useMetaPixel();
  const { trackEvent: trackGAEvent } = useGoogleAnalytics();
  const { trackEvent: trackTikTokEvent } = useTikTokPixel();
  const formData = useMemo(() => {
    const stateData = location.state?.formData as FormData | undefined;
    if (stateData) return stateData;
    try {
      const stored = sessionStorage.getItem("songFormData");
      if (stored) return JSON.parse(stored) as FormData;
    } catch { /* ignore parse errors */ }
    return undefined;
  }, [location.state]);
  const [selectedTier, setSelectedTier] = useState<PricingTier>("standard");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPayPalLoading, setIsPayPalLoading] = useState(false);
  const paypalButtonRef = useRef<HTMLDivElement>(null);
  const paypalRendered = useRef(false);
  const [promoCode, setPromoCode] = useState("");
  const [additionalPromo, setAdditionalPromo] = useState<AdditionalPromo | null>(null);
  const [promoError, setPromoError] = useState("");
  const [isValidating, setIsValidating] = useState(false);
  
  // Auto-detect user timezone
  const userTimezone = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return "America/New_York";
    }
  }, []);
  
  // Normalize phone to E.164
  const phoneE164 = useMemo(() => normalizeToE164(formData?.phoneNumber), [formData?.phoneNumber]);
  
  const seasonalPromo = getActivePromo();
  const { promo: activeFlashPromo, refetch: refetchPromo } = useActivePromo();
  
  // Stacked pricing calculation -- all math in integer cents, converted to dollars only for display
  const pricing = useMemo(() => {
    const baseCents = BASE_PRICES_CENTS[selectedTier];

    // If flash promo is active, use promo prices directly
    if (activeFlashPromo.active) {
      const promoCents = selectedTier === "priority"
        ? (activeFlashPromo.priorityPriceCents || 0)
        : (activeFlashPromo.standardPriceCents || 0);
      return {
        base: baseCents / 100,
        afterSeasonal: promoCents / 100,
        seasonalSavings: (baseCents - promoCents) / 100,
        additionalSavings: 0,
        total: promoCents / 100,
      };
    }

    const afterSeasonalCents = calculateSeasonalPriceCents(selectedTier);
    const seasonalSavingsCents = baseCents - afterSeasonalCents;

    let additionalSavingsCents = 0;
    if (additionalPromo) {
      additionalSavingsCents = calculateAdditionalDiscountCents(afterSeasonalCents, additionalPromo);
    }

    const totalCents = Math.max(0, afterSeasonalCents - additionalSavingsCents);

    return {
      base: baseCents / 100,
      afterSeasonal: afterSeasonalCents / 100,
      seasonalSavings: seasonalSavingsCents / 100,
      additionalSavings: additionalSavingsCents / 100,
      total: totalCents / 100,
    };
  }, [selectedTier, additionalPromo, activeFlashPromo]);
  
  const handleApplyPromo = async () => {
    const code = promoCode.trim();
    if (!code) return;
    
    setPromoError("");
    setIsValidating(true);
    
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/validate-promo-code`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ code }),
        }
      );
      
      const data = await response.json();
      
      if (data.valid) {
        // For 100% off test codes, treat as percent_off
        const promo: AdditionalPromo = {
          code: data.name || code.toUpperCase(),
          type: data.type,
          amount_off: data.amount_off,
          percent_off: data.percent_off,
          name: data.name || code.toUpperCase(),
        };
        setAdditionalPromo(promo);
        
        const discountDesc = data.type === "amount_off" 
          ? `$${(data.amount_off / 100).toFixed(2)} off` 
          : `${data.percent_off}% off`;
        toast({ title: "Promo code applied!", description: `${discountDesc} stacked on top of ${seasonalPromo.code}.` });
      } else {
        setPromoError(data.error || "Invalid promo code");
      }
    } catch (error) {
      console.error("Promo validation error:", error);
      setPromoError("Unable to validate code. Please try again.");
    } finally {
      setIsValidating(false);
    }
  };
  
  const handleRemovePromo = () => {
    setAdditionalPromo(null);
    setPromoCode("");
    setPromoError("");
  };

  // Redirect if no form data
  if (!formData) {
    return (
      <Layout showPromoBanner={false}>
        <div className="min-h-[60vh] flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-semibold mb-4">No order found</h1>
            <p className="text-muted-foreground mb-6">
              Please start by creating your song.
            </p>
            <Button asChild>
              <Link to="/create">Create Your Song</Link>
            </Button>
          </div>
        </div>
      </Layout>
    );
  }

  const handleCheckout = async () => {
    if (isSubmitting || !formData) return;
    
    setIsSubmitting(true);
    
    const checkoutValue = pricing.total;
    trackMetaEvent('InitiateCheckout', {
      value: checkoutValue,
      currency: 'USD',
    });
    
    trackGAEvent('begin_checkout', {
      currency: 'USD',
      value: checkoutValue,
      items: [{
        item_name: `${selectedTier === "priority" ? "Priority" : "Standard"} Song`,
        item_category: formData?.occasion,
        price: checkoutValue,
        quantity: 1,
      }],
    });

    trackTikTokEvent('InitiateCheckout', {
      content_type: 'product',
      value: checkoutValue,
      currency: 'USD',
    });
    
    try {
      const utmParams = getStoredUtmParams();

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-checkout`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({
            pricingTier: selectedTier,
            formData: {
              ...formData,
              smsOptIn: formData.smsOptIn && !!phoneE164,
              phoneE164: phoneE164 || undefined,
              timezone: userTimezone,
            },
            // Send additional promo code for server-side stacking
            additionalPromoCode: additionalPromo?.code || undefined,
            utmSource: utmParams.utm_source || undefined,
            utmMedium: utmParams.utm_medium || undefined,
            utmCampaign: utmParams.utm_campaign || undefined,
            utmContent: utmParams.utm_content || undefined,
            utmTerm: utmParams.utm_term || undefined,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to create checkout session");
      }

      const { url } = await response.json();
      
      if (url) {
        window.location.href = url;
      } else {
        throw new Error("No checkout URL received");
      }
    } catch (error) {
      console.error("Checkout error:", error);
      toast({
        title: "Something went wrong",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
      setIsSubmitting(false);
    }
  };

  const handlePayPalCheckout = async () => {
    if (isPayPalLoading || isSubmitting || !formData) return;
    
    setIsPayPalLoading(true);
    
    const checkoutValue = pricing.total;
    trackMetaEvent('InitiateCheckout', { value: checkoutValue, currency: 'USD' });
    trackGAEvent('begin_checkout', {
      currency: 'USD',
      value: checkoutValue,
      items: [{
        item_name: `${selectedTier === "priority" ? "Priority" : "Standard"} Song`,
        item_category: formData?.occasion,
        price: checkoutValue,
        quantity: 1,
      }],
    });
    trackTikTokEvent('InitiateCheckout', { content_type: 'product', value: checkoutValue, currency: 'USD' });
    
    try {
      const utmParams = getStoredUtmParams();

      // Step 1: Create PayPal order on server
      const createResponse = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-paypal-order`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({
            pricingTier: selectedTier,
            formData: {
              ...formData,
              smsOptIn: formData.smsOptIn && !!phoneE164,
              phoneE164: phoneE164 || undefined,
              timezone: userTimezone,
            },
            additionalPromoCode: additionalPromo?.code || undefined,
            utmSource: utmParams.utm_source || undefined,
            utmMedium: utmParams.utm_medium || undefined,
            utmCampaign: utmParams.utm_campaign || undefined,
            utmContent: utmParams.utm_content || undefined,
            utmTerm: utmParams.utm_term || undefined,
          }),
        }
      );

      if (!createResponse.ok) {
        const errorData = await createResponse.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to create PayPal order");
      }

      const { orderID: paypalOrderID } = await createResponse.json();

      // Step 2: Redirect to PayPal approval URL
      // We'll use PayPal's hosted checkout page
      window.location.href = `https://www.paypal.com/checkoutnow?token=${paypalOrderID}`;
    } catch (error) {
      console.error("PayPal checkout error:", error);
      toast({
        title: "Something went wrong",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
      setIsPayPalLoading(false);
    }
  };

  return (
    <Layout showPromoBanner={false}>
      <div className="py-8 md:py-12">
        <div className="container mx-auto px-4 max-w-4xl">
          {/* Back button */}
          <Button
            variant="ghost"
            onClick={() => navigate(-1)}
            className="mb-6 gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>

          <h1 className="text-3xl md:text-4xl font-display text-foreground text-center mb-2">
            Complete Your Order
          </h1>
          <p className="text-center text-muted-foreground mb-10">
            Choose your delivery speed and complete payment
          </p>

          {/* 50% Off Badge */}
          <div className="flex justify-center mb-6">
            <div className="bg-primary/10 text-primary font-semibold px-4 py-2 rounded-full text-sm flex items-center gap-2">
              <span className="bg-primary text-primary-foreground px-2 py-0.5 rounded text-xs">50% OFF</span>
              {activeFlashPromo.active ? `${activeFlashPromo.bannerEmoji || "🔥"} ${activeFlashPromo.name} — prices slashed!` : `${seasonalPromo.emoji} ${seasonalPromo.code} auto-applied at checkout`}
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-6 mb-3">
            {/* Standard tier */}
            <Card 
              onClick={() => setSelectedTier("standard")}
              className={`p-6 cursor-pointer transition-all duration-200 ${
                selectedTier === "standard" 
                  ? "ring-2 ring-primary border-primary" 
                  : "hover:border-primary/50"
              }`}
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-xl font-semibold text-foreground">Standard Song</h3>
                  <p className="text-muted-foreground flex items-center gap-1 mt-1">
                    <Clock className="h-4 w-4" />
                    Typically within 48 hours
                  </p>
                </div>
                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                  selectedTier === "standard" 
                    ? "bg-primary border-primary" 
                    : "border-muted-foreground"
                }`}>
                  {selectedTier === "standard" && (
                    <Check className="h-4 w-4 text-primary-foreground" />
                  )}
                </div>
              </div>
              <div className="mb-4">
                <span className="text-lg text-muted-foreground line-through">$99.99 USD</span>
                <span className="text-4xl font-bold text-foreground ml-2">
                  ${selectedTier === "standard" ? pricing.total.toFixed(2) : (calculateSeasonalPriceCents("standard") / 100).toFixed(2)}
                </span>
                <span className="text-sm text-muted-foreground ml-1">USD</span>
              </div>
              <ul className="space-y-2 text-muted-foreground">
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-primary" />
                  Unique custom song
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-primary" />
                  Private playback link
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-primary" />
                  Unlimited plays
                </li>
              </ul>
            </Card>

            {/* Priority tier */}
            <Card 
              onClick={() => setSelectedTier("priority")}
              className={`p-6 cursor-pointer transition-all duration-200 relative ${
                selectedTier === "priority" 
                  ? "ring-2 ring-primary border-primary" 
                  : "hover:border-primary/50"
              }`}
            >
              <div className="absolute -top-3 right-4 bg-primary text-primary-foreground text-xs font-semibold px-3 py-1 rounded-full">
                FASTEST
              </div>
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-xl font-semibold text-foreground">Priority Song</h3>
                  <p className="text-muted-foreground flex items-center gap-1 mt-1">
                    <Zap className="h-4 w-4" />
                    24-hour rush delivery
                  </p>
                </div>
                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                  selectedTier === "priority" 
                    ? "bg-primary border-primary" 
                    : "border-muted-foreground"
                }`}>
                  {selectedTier === "priority" && (
                    <Check className="h-4 w-4 text-primary-foreground" />
                  )}
                </div>
              </div>
              <div className="mb-4">
                <span className="text-lg text-muted-foreground line-through">$159.99 USD</span>
                <span className="text-4xl font-bold text-foreground ml-2">
                  ${selectedTier === "priority" ? pricing.total.toFixed(2) : (calculateSeasonalPriceCents("priority") / 100).toFixed(2)}
                </span>
                <span className="text-sm text-muted-foreground ml-1">USD</span>
              </div>
              <ul className="space-y-2 text-muted-foreground">
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-primary" />
                  Everything in Standard
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-primary" />
                  24-hour rush delivery
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-primary" />
                  First in queue
                </li>
              </ul>
            </Card>
          </div>

          <p className="text-center text-xs text-muted-foreground mb-2">
            All prices in USD. Local currency shown at checkout.
          </p>

          {/* Valentine's delivery urgency notice */}
          <div className="mb-8">
            <ValentineDeliveryNotice />
          </div>

          {/* Order summary */}
          <Card className="p-6 mb-8 bg-secondary/30">
            <h3 className="font-semibold text-foreground mb-4">Order Summary</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Song for:</span>
                <span className="text-foreground">{formData.recipientName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Occasion:</span>
                <span className="text-foreground capitalize">{formData.occasion.replace("-", " ")}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Style:</span>
                <span className="text-foreground capitalize">{formData.genre.replace("-", " ")}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Delivery to:</span>
                <span className="text-foreground">{formData.yourEmail}</span>
              </div>
              <div className="border-t border-border my-4" />
              
              {/* Promo item */}
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Unlimited plays & full usage rights</span>
                  <span className="bg-primary/10 text-primary text-xs font-semibold px-2 py-0.5 rounded">FREE</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground line-through">$15</span>
                  <span className="text-primary font-semibold">$0</span>
                </div>
              </div>
              
              {/* Promo Code Input */}
              <div className="border-t border-border my-4" />
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground flex items-center gap-1">
                  <Tag className="h-3 w-3" />
                  Have an additional promo code?
                </label>
                {additionalPromo ? (
                  <div className="flex items-center justify-between bg-primary/10 rounded-md px-3 py-2">
                    <span className="text-primary font-medium">
                      {additionalPromo.name} ({additionalPromo.type === "amount_off" 
                        ? `$${((additionalPromo.amount_off || 0) / 100).toFixed(2)} off` 
                        : `${additionalPromo.percent_off}% off`})
                    </span>
                    <Button variant="ghost" size="sm" onClick={handleRemovePromo} className="h-6 w-6 p-0">
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Input
                      placeholder="Enter code"
                      value={promoCode}
                      onChange={(e) => {
                        setPromoCode(e.target.value);
                        setPromoError("");
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleApplyPromo();
                      }}
                      className="flex-1"
                    />
                    <Button variant="outline" onClick={handleApplyPromo} disabled={!promoCode.trim() || isValidating}>
                      {isValidating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Apply"}
                    </Button>
                  </div>
                )}
                {promoError && <p className="text-destructive text-xs">{promoError}</p>}
              </div>
              
              <div className="border-t border-border my-4" />
              
              {/* Subtotal */}
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Subtotal:</span>
                <span className="text-muted-foreground">${pricing.base.toFixed(2)} USD</span>
              </div>
              
              {/* Seasonal discount line */}
              <div className="flex justify-between items-center text-primary">
                <span>{activeFlashPromo.active ? `${activeFlashPromo.bannerEmoji || "🔥"} ${activeFlashPromo.name}` : `${seasonalPromo.emoji} ${seasonalPromo.code}`} Discount:</span>
                <span>-${pricing.seasonalSavings.toFixed(2)}</span>
              </div>
              
              {/* Additional promo discount line */}
              {additionalPromo && pricing.additionalSavings > 0 && (
                <div className="flex justify-between items-center text-primary">
                  <span>🎟️ {additionalPromo.name} Discount:</span>
                  <span>-${pricing.additionalSavings.toFixed(2)}</span>
                </div>
              )}
              
              <div className="border-t border-border my-4" />
              <div className="flex justify-between text-lg font-semibold">
                <span>Total:</span>
                <span>${pricing.total.toFixed(2)} USD</span>
              </div>
            </div>
          </Card>

          {/* Reassurance */}
          <div className="grid md:grid-cols-3 gap-4 mb-8">
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <Shield className="h-5 w-5 text-primary flex-shrink-0" />
              <span>Our team reviews every song before delivery</span>
            </div>
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <Check className="h-5 w-5 text-primary flex-shrink-0" />
              <span>Satisfaction guaranteed</span>
            </div>
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <Mail className="h-5 w-5 text-primary flex-shrink-0" />
              <span>Support: support@personalsonggifts.com</span>
            </div>
          </div>

          {/* Payment buttons */}
          <div className="space-y-3">
            {/* Card/Stripe button */}
            <Button 
              onClick={handleCheckout}
              size="lg" 
              className="w-full text-lg py-6 font-semibold gap-2"
              disabled={isSubmitting || isPayPalLoading}
            >
              {isSubmitting ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <CreditCard className="h-5 w-5" />
              )}
              {isSubmitting ? "Processing..." : `Pay with Card — $${pricing.total.toFixed(2)} USD`}
            </Button>

            {/* Divider */}
            <div className="flex items-center gap-3">
              <div className="flex-1 border-t border-border" />
              <span className="text-sm text-muted-foreground">or</span>
              <div className="flex-1 border-t border-border" />
            </div>

            {/* PayPal button */}
            <Button
              onClick={handlePayPalCheckout}
              size="lg"
              variant="outline"
              className="w-full text-lg py-6 font-semibold gap-2 bg-[#FFC439] hover:bg-[#F0B72F] text-[#003087] border-[#FFC439] hover:border-[#F0B72F]"
              disabled={isSubmitting || isPayPalLoading}
            >
              {isPayPalLoading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M7.076 21.337H2.47a.641.641 0 0 1-.633-.74L4.944.901C5.026.382 5.474 0 5.998 0h7.46c2.57 0 4.578.543 5.69 1.81 1.01 1.15 1.304 2.42 1.012 4.287-.023.143-.047.288-.077.437-.983 5.05-4.349 6.797-8.647 6.797h-2.19c-.524 0-.968.382-1.05.9l-1.12 7.106zm14.146-14.42a3.35 3.35 0 0 0-.607-.541c-.013.076-.026.175-.041.254-.93 4.778-4.005 7.201-9.138 7.201h-2.19a.563.563 0 0 0-.556.479l-1.187 7.527h-.506l-.24 1.516a.56.56 0 0 0 .554.647h3.882c.46 0 .85-.334.922-.788.06-.26.76-4.852.816-5.09a.932.932 0 0 1 .923-.788h.58c3.76 0 6.705-1.528 7.565-5.946.36-1.847.174-3.388-.777-4.471z"/>
                </svg>
              )}
              {isPayPalLoading ? "Connecting to PayPal..." : `Pay with PayPal — $${pricing.total.toFixed(2)} USD`}
            </Button>
          </div>

          <p className="text-center text-sm text-muted-foreground mt-4">
            🔒 Secure checkout powered by Stripe & PayPal
          </p>
        </div>
      </div>
    </Layout>
  );
};

export default Checkout;
