import { useLocation, Link } from "react-router-dom";
import Layout from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Check, Clock, Mail, Heart } from "lucide-react";
import { FormData } from "@/pages/CreateSong";

const Confirmation = () => {
  const location = useLocation();
  const { formData, tier, deliveryTime } = location.state as {
    formData: FormData;
    tier: string;
    deliveryTime: string;
  } || {};

  if (!formData) {
    return (
      <Layout showPromoBanner={false}>
        <div className="min-h-[60vh] flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-semibold mb-4">No order found</h1>
            <Button asChild>
              <Link to="/">Return Home</Link>
            </Button>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout showPromoBanner={false}>
      <div className="py-12 md:py-20">
        <div className="container mx-auto px-4 max-w-2xl text-center">
          {/* Success icon */}
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-primary/10 flex items-center justify-center">
            <Check className="h-10 w-10 text-primary" />
          </div>

          <h1 className="text-3xl md:text-4xl font-display text-foreground mb-4">
            Your Song Is Being Crafted
          </h1>
          
          <p className="text-body-lg text-muted-foreground mb-8">
            Thank you, {formData.yourName}! We're honored to help you create something special for {formData.recipientName}.
          </p>

          {/* Order details card */}
          <Card className="p-6 md:p-8 text-left mb-8 bg-card shadow-card">
            <h3 className="font-semibold text-foreground mb-6 text-center">What Happens Next</h3>
            
            <div className="space-y-6">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
                  <Heart className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h4 className="font-medium text-foreground">We're crafting your song</h4>
                  <p className="text-muted-foreground text-sm">
                    Our team is carefully creating a one-of-a-kind song from your story.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
                  <Clock className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h4 className="font-medium text-foreground">Expected delivery: Within {deliveryTime}</h4>
                  <p className="text-muted-foreground text-sm">
                    You'll receive your completed song at {formData.yourEmail}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
                  <Mail className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h4 className="font-medium text-foreground">Check your inbox</h4>
                  <p className="text-muted-foreground text-sm">
                    We'll send you a confirmation email shortly. Check your spam folder if you don't see it.
                  </p>
                </div>
              </div>
            </div>
          </Card>

          {/* Support note */}
          <p className="text-muted-foreground mb-8">
            Questions? Email us at{" "}
            <a 
              href="mailto:hello@personalsonggifts.com" 
              className="text-primary hover:underline"
            >
              hello@personalsonggifts.com
            </a>
            {" "}— we respond within 24 hours.
          </p>

          <Button asChild variant="outline" size="lg">
            <Link to="/">Return Home</Link>
          </Button>
        </div>
      </div>
    </Layout>
  );
};

export default Confirmation;
