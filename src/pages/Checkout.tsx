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
  ArrowLeft 
} from "lucide-react";
import { FormData } from "@/pages/CreateSong";

type PricingTier = "standard" | "priority";

const Checkout = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const formData = location.state?.formData as FormData | undefined;
  const [selectedTier, setSelectedTier] = useState<PricingTier>("standard");

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

  const handleCheckout = () => {
    // For now, navigate to confirmation
    // TODO: Integrate Stripe payment
    navigate("/confirmation", { 
      state: { 
        formData, 
        tier: selectedTier,
        deliveryTime: selectedTier === "priority" ? "24 hours" : "48 hours"
      } 
    });
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
                    Delivered within 48 hours
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
              <div className="text-4xl font-bold text-foreground mb-4">
                $49
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
                FASTER
              </div>
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-xl font-semibold text-foreground">Priority Song</h3>
                  <p className="text-muted-foreground flex items-center gap-1 mt-1">
                    <Zap className="h-4 w-4" />
                    Delivered within 24 hours
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
              <div className="text-4xl font-bold text-foreground mb-4">
                $79
              </div>
              <ul className="space-y-2 text-muted-foreground">
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-primary" />
                  Everything in Standard
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-primary" />
                  Priority delivery
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
              <div className="flex justify-between text-lg font-semibold">
                <span>Total:</span>
                <span>${selectedTier === "priority" ? "79" : "49"}</span>
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
          >
            <CreditCard className="h-5 w-5" />
            Complete Payment — ${selectedTier === "priority" ? "79" : "49"}
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
