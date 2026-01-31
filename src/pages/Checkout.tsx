import { useLocation, useNavigate, Link } from "react-router-dom";
import { useState } from "react";
import Layout from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { 
  Check, 
  Clock, 
  Zap, 
  Shield, 
  Mail, 
  CreditCard,
  ArrowLeft,
  Loader2
} from "lucide-react";
import { FormData } from "@/pages/CreateSong";
import { useToast } from "@/hooks/use-toast";
import { useMetaPixel } from "@/hooks/useMetaPixel";
import { useGoogleAnalytics } from "@/hooks/useGoogleAnalytics";

type PricingTier = "standard" | "priority";

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

const Checkout = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { trackEvent: trackMetaEvent } = useMetaPixel();
  const { trackEvent: trackGAEvent } = useGoogleAnalytics();
  const formData = location.state?.formData as FormData | undefined;
  const [selectedTier, setSelectedTier] = useState<PricingTier>("standard");
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const activePromo = getActivePromo();

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
    
    // Fire InitiateCheckout event (Meta Pixel) - use discounted values
    const checkoutValue = selectedTier === "priority" ? 79.99 : 49.99;
    trackMetaEvent('InitiateCheckout', {
      value: checkoutValue,
      currency: 'USD',
    });
    
    // Fire begin_checkout event (Google Analytics)
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
    
    try {
      // Call the create-checkout edge function
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
            formData,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to create checkout session");
      }

      const { url } = await response.json();
      
      // Redirect to Stripe Checkout
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
              {activePromo.emoji} {activePromo.code} auto-applied at checkout
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-6 mb-10">
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
                <span className="text-lg text-muted-foreground line-through">$99.99</span>
                <span className="text-4xl font-bold text-foreground ml-2">$49.99</span>
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
                <span className="text-lg text-muted-foreground line-through">$159.99</span>
                <span className="text-4xl font-bold text-foreground ml-2">$79.99</span>
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
              
              <div className="border-t border-border my-4" />
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Subtotal:</span>
                <span className="text-muted-foreground">${selectedTier === "priority" ? "159.99" : "99.99"}</span>
              </div>
              <div className="flex justify-between items-center text-primary">
                <span>{activePromo.emoji} {activePromo.code} Discount (50% Off):</span>
                <span>-${selectedTier === "priority" ? "80.00" : "50.00"}</span>
              </div>
              <div className="border-t border-border my-4" />
              <div className="flex justify-between text-lg font-semibold">
                <span>Total:</span>
                <span>${selectedTier === "priority" ? "79.99" : "49.99"}</span>
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
              <span>Support: hello@personalsonggifts.com</span>
            </div>
          </div>

          {/* Checkout button */}
          <Button 
            onClick={handleCheckout}
            size="lg" 
            className="w-full text-lg py-6 font-semibold gap-2"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <CreditCard className="h-5 w-5" />
            )}
            {isSubmitting ? "Processing..." : `Complete Payment — $${selectedTier === "priority" ? "79.99" : "49.99"}`}
          </Button>

          <p className="text-center text-sm text-muted-foreground mt-4">
            🔒 Secure checkout powered by Stripe
          </p>
        </div>
      </div>
    </Layout>
  );
};

export default Checkout;
