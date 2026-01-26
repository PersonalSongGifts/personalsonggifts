import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import Layout from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Check, Clock, Mail, Music, Loader2, AlertCircle } from "lucide-react";

interface OrderDetails {
  orderId: string;
  recipientName: string;
  occasion: string;
  genre: string;
  pricingTier: string;
  customerEmail: string;
  expectedDelivery: string;
}

const PaymentSuccess = () => {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get("session_id");
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [orderDetails, setOrderDetails] = useState<OrderDetails | null>(null);

  useEffect(() => {
    if (!sessionId) {
      setError("No session ID found. Please contact support if you completed a payment.");
      setLoading(false);
      return;
    }

    const processPayment = async () => {
      try {
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/process-payment`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            },
            body: JSON.stringify({ sessionId }),
          }
        );

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || "Failed to process payment");
        }

        const data = await response.json();
        setOrderDetails(data);
      } catch (err) {
        console.error("Payment processing error:", err);
        setError(err instanceof Error ? err.message : "Something went wrong");
      } finally {
        setLoading(false);
      }
    };

    processPayment();
  }, [sessionId]);

  if (loading) {
    return (
      <Layout showPromoBanner={false}>
        <div className="min-h-[60vh] flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Processing your order...</h2>
            <p className="text-muted-foreground">Please wait while we confirm your payment.</p>
          </div>
        </div>
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout showPromoBanner={false}>
        <div className="min-h-[60vh] flex items-center justify-center">
          <div className="text-center max-w-md">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Something went wrong</h2>
            <p className="text-muted-foreground mb-6">{error}</p>
            <div className="space-y-3">
              <Button asChild>
                <Link to="/checkout">Try Again</Link>
              </Button>
              <p className="text-sm text-muted-foreground">
                If you've been charged, please contact{" "}
                <a href="mailto:hello@personalsonggifts.com" className="text-primary underline">
                  hello@personalsonggifts.com
                </a>
              </p>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  if (!orderDetails) {
    return null;
  }

  const deliveryTime = orderDetails.pricingTier === "priority" ? "3 hours" : "24 hours";
  const expectedDate = new Date(orderDetails.expectedDelivery);

  return (
    <Layout showPromoBanner={false}>
      <div className="py-12 md:py-16">
        <div className="container mx-auto px-4 max-w-2xl text-center">
          {/* Success icon */}
          <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <Check className="h-10 w-10 text-primary" />
          </div>

          <h1 className="text-3xl md:text-4xl font-display text-foreground mb-4">
            Thank You! Your Song Is On Its Way 🎵
          </h1>
          
          <p className="text-lg text-muted-foreground mb-8">
            We've received your order and our songwriters are getting started on your 
            personalized song for <span className="text-foreground font-medium">{orderDetails.recipientName}</span>.
          </p>

          {/* Order details card */}
          <Card className="p-6 mb-8 text-left">
            <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
              <Music className="h-5 w-5 text-primary" />
              Order Details
            </h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Order ID:</span>
                <span className="text-foreground font-mono">{orderDetails.orderId.slice(0, 8).toUpperCase()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Song for:</span>
                <span className="text-foreground">{orderDetails.recipientName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Occasion:</span>
                <span className="text-foreground capitalize">{orderDetails.occasion.replace("-", " ")}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Style:</span>
                <span className="text-foreground capitalize">{orderDetails.genre.replace("-", " ")}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Package:</span>
                <span className="text-foreground capitalize">{orderDetails.pricingTier}</span>
              </div>
            </div>
          </Card>

          {/* Delivery info */}
          <Card className="p-6 mb-8 bg-primary/5 border-primary/20">
            <div className="flex items-center justify-center gap-3 mb-3">
              <Clock className="h-5 w-5 text-primary" />
              <h3 className="font-semibold text-foreground">Expected Delivery</h3>
            </div>
            <p className="text-2xl font-bold text-primary mb-2">
              Within {deliveryTime}
            </p>
            <p className="text-sm text-muted-foreground">
              By {expectedDate.toLocaleDateString("en-US", { 
                weekday: "long",
                month: "long", 
                day: "numeric",
                hour: "numeric",
                minute: "2-digit"
              })}
            </p>
          </Card>

          {/* Email confirmation */}
          <div className="flex items-center justify-center gap-2 text-muted-foreground mb-8">
            <Mail className="h-5 w-5" />
            <p>
              Confirmation sent to <span className="text-foreground">{orderDetails.customerEmail}</span>
            </p>
          </div>

          {/* CTA */}
          <Button asChild size="lg">
            <Link to="/">Return Home</Link>
          </Button>

          <p className="text-sm text-muted-foreground mt-6">
            Questions? Contact us at{" "}
            <a href="mailto:hello@personalsonggifts.com" className="text-primary underline">
              hello@personalsonggifts.com
            </a>
          </p>
        </div>
      </div>
    </Layout>
  );
};

export default PaymentSuccess;
