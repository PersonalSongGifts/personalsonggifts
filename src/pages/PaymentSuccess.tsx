import { useEffect, useState, useRef, useCallback } from "react";
import { useSearchParams, Link } from "react-router-dom";
import Layout from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Check, Clock, Mail, Music, Loader2, AlertCircle, Pencil, Gift, Zap } from "lucide-react";
import { useMetaPixel } from "@/hooks/useMetaPixel";
import { useGoogleAnalytics } from "@/hooks/useGoogleAnalytics";
import { useTikTokPixel } from "@/hooks/useTikTokPixel";

interface OrderDetails {
  orderId: string;
  recipientName: string;
  occasion: string;
  genre: string;
  pricingTier: string;
  customerEmail: string;
  expectedDelivery?: string;
  songUrl?: string;
  price?: number;
  revisionToken?: string;
  package_unlocked?: boolean;
  package_addon_cents?: number;
  rush_addon?: boolean;
  rush_addon_cents?: number;
}

const MAX_POLL_ATTEMPTS = 10;
const POLL_INTERVAL_MS = 1500;

const PaymentSuccess = () => {
  // Clean up persisted form data after successful purchase
  useEffect(() => { sessionStorage.removeItem("songFormData"); }, []);
  const [searchParams, setSearchParams] = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const paypalToken = searchParams.get("token"); // PayPal returns ?token=<orderID>
  const source = searchParams.get("source"); // "lead" if from lead conversion
  const { trackEvent: trackMetaEvent } = useMetaPixel();
  const { trackEvent: trackGAEvent } = useGoogleAnalytics();
  const { trackEvent: trackTikTokEvent } = useTikTokPixel();
  const hasTrackedPurchase = useRef(false);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [orderDetails, setOrderDetails] = useState<OrderDetails | null>(null);
  const [isLeadConversion, setIsLeadConversion] = useState(false);
  const [pollAttempts, setPollAttempts] = useState(0);
  const [showProcessingMessage, setShowProcessingMessage] = useState(false);
  const [pkgLoading, setPkgLoading] = useState(false);
  const [pkgAdded, setPkgAdded] = useState(false);
  const [pkgCode, setPkgCode] = useState("");
  const [showPkgCode, setShowPkgCode] = useState(false);
  const [pkgError, setPkgError] = useState<string | null>(null);
  const [pkgConfirming, setPkgConfirming] = useState(false);

  const trackAddonPurchase = useCallback((
    kind: "pkg" | "rush",
    pkgSession: string,
    amountCents: number | null,
  ) => {
    if (!amountCents || amountCents <= 0) return;
    const dedupePrefix = kind === "pkg" ? "psg_pkg_purchase_tracked_" : "psg_rush_purchase_tracked_";
    const txnPrefix = kind === "pkg" ? "pkg_" : "rush_";
    const itemName = kind === "pkg" ? "Forever Memory Package" : "Rush Delivery";
    const contentId = kind === "pkg" ? "forever-memory-package" : "rush-delivery";
    const key = `${dedupePrefix}${pkgSession}`;
    try { if (sessionStorage.getItem(key)) return; } catch { /* ignore */ }
    const value = amountCents / 100;
    trackMetaEvent('Purchase', { value, currency: 'USD', transaction_id: `${txnPrefix}${pkgSession}` });
    trackGAEvent('purchase', {
      transaction_id: `${txnPrefix}${pkgSession}`,
      value,
      currency: 'USD',
      items: [{ item_name: itemName, price: value, quantity: 1 }],
    });
    trackTikTokEvent('CompletePayment', {
      content_type: 'product',
      content_id: contentId,
      value,
      currency: 'USD',
    });
    try { sessionStorage.setItem(key, "1"); } catch { /* ignore */ }
  }, [trackMetaEvent, trackGAEvent, trackTikTokEvent]);
  const trackPackagePurchase = useCallback(
    (pkgSession: string, amountCents: number | null) => trackAddonPurchase("pkg", pkgSession, amountCents),
    [trackAddonPurchase],
  );

  const trackPurchaseEvent = useCallback((data: OrderDetails) => {
    const dedupeKey = `psg_purchase_tracked_${sessionId || paypalToken || data.orderId}`;
    try {
      if (sessionStorage.getItem(dedupeKey)) return;
    } catch { /* sessionStorage unavailable — fall through to ref guard */ }

    if (hasTrackedPurchase.current) return;

    const purchaseValue = data.price ?? (data.pricingTier === "priority" ? 79 : 49);
    if (purchaseValue <= 0) {
      hasTrackedPurchase.current = true;
      try { sessionStorage.setItem(dedupeKey, "1"); } catch { /* ignore */ }
      return; // $0 test orders must not pollute ad pixels
    }

    trackMetaEvent('Purchase', {
      value: purchaseValue,
      currency: 'USD',
      transaction_id: data.orderId,
    });

    trackGAEvent('purchase', {
      transaction_id: data.orderId,
      value: purchaseValue,
      currency: 'USD',
      items: [{
        item_name: `${data.pricingTier === "priority" ? "Priority" : "Standard"} Song for ${data.recipientName}`,
        item_category: data.occasion,
        price: purchaseValue,
        quantity: 1,
      }],
    });

    trackTikTokEvent('CompletePayment', {
      content_type: 'product',
      content_id: data.orderId,
      value: purchaseValue,
      currency: 'USD',
    });

    // Amplitude purchase tracking
    const amp = (window as any).amplitude;
    if (amp) {
      amp.track('Purchase Completed', {
        order_id: data.orderId,
        revenue: purchaseValue,
        currency: 'USD',
        pricing_tier: data.pricingTier,
        occasion: data.occasion,
        genre: data.genre,
        recipient_name: data.recipientName,
        is_lead_conversion: !!data.songUrl && source === 'lead',
      });

      if (amp.Revenue) {
        const rev = new amp.Revenue()
          .setProductId(data.pricingTier || 'standard')
          .setPrice(purchaseValue)
          .setQuantity(1);
        amp.revenue(rev);
      }
    }

    hasTrackedPurchase.current = true;
    try { sessionStorage.setItem(dedupeKey, "1"); } catch { /* ignore */ }
  }, [sessionId, paypalToken, trackMetaEvent, trackGAEvent, trackTikTokEvent]);

  const handleAddPackage = async () => {
    if (!orderDetails?.orderId) return;
    setPkgLoading(true);
    setPkgError(null);
    try {
      const returnPath = window.location.pathname + window.location.search;
      const r = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-package-checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: orderDetails.orderId, returnPath, promoCode: pkgCode.trim() || undefined }),
      });
      const data = await r.json();
      if (data.alreadyUnlocked) { setPkgAdded(true); return; }
      if (data.url) { window.location.href = data.url; return; }
      setPkgError(data.error || "Something went wrong. Please try again.");
      console.error("Package checkout failed:", data.error);
    } catch (e) {
      console.error("Package checkout error:", e);
      setPkgError("Network error. Please try again.");
    } finally {
      setPkgLoading(false);
    }
  };

  useEffect(() => {
    if (!sessionId && !paypalToken) {
      setError("We couldn't find your order details. If you completed a payment, please contact support and we'll help right away.");
      setLoading(false);
      return;
    }

    // Handle PayPal return
    if (paypalToken) {
      const capturePayPal = async () => {
        try {
          const response = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/capture-paypal-payment`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
              },
              body: JSON.stringify({ orderID: paypalToken }),
            }
          );

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || "Failed to process PayPal payment");
          }

          const data = await response.json();
          setOrderDetails(data);
          if (data.package_unlocked) {
            setPkgAdded(true);
            if (paypalToken && (data.package_addon_cents ?? 0) > 0) {
              trackAddonPurchase("pkg", `chk_pp_${paypalToken}`, data.package_addon_cents ?? null);
            }
          }
          if (paypalToken && data.rush_addon && (data.rush_addon_cents ?? 0) > 0) {
            trackAddonPurchase("rush", `chk_pp_${paypalToken}`, data.rush_addon_cents ?? null);
          }
          trackPurchaseEvent(data);
        } catch (err) {
          console.error("PayPal payment processing error:", err);
          setError(err instanceof Error ? err.message : "Something went wrong");
        } finally {
          setLoading(false);
        }
      };

      capturePayPal();
      return;
    }

    if (!sessionId) {
      setError("We couldn't find your order details. If you completed a payment, please contact support and we'll help right away.");
      setLoading(false);
      return;
    }

    // For lead conversions, use the existing endpoint
    if (source === "lead") {
      const processLeadPayment = async () => {
        try {
          const response = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/process-lead-payment`,
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
          setIsLeadConversion(true);
          trackPurchaseEvent(data);
        } catch (err) {
          console.error("Payment processing error:", err);
          setError(err instanceof Error ? err.message : "Something went wrong");
        } finally {
          setLoading(false);
        }
      };

      processLeadPayment();
      return;
    }

    // For regular orders, poll process-payment which checks if order exists
    // The webhook creates the order, this just retrieves it
    const pollForOrder = async (attempt: number) => {
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
        if (data.package_unlocked) {
          setPkgAdded(true);
          if (sessionId && (data.package_addon_cents ?? 0) > 0) {
            trackPackagePurchase(`chk_${sessionId}`, data.package_addon_cents ?? null);
          }
        }
        if (sessionId && data.rush_addon && (data.rush_addon_cents ?? 0) > 0) {
          trackAddonPurchase("rush", `chk_${sessionId}`, data.rush_addon_cents ?? null);
        }
        trackPurchaseEvent(data);
        setLoading(false);
        return true; // Success
      } catch (err) {
        console.error(`Poll attempt ${attempt} failed:`, err);
        
        // Show processing message after a few attempts
        if (attempt >= 3) {
          setShowProcessingMessage(true);
        }
        
        // If we've exhausted attempts, show error
        if (attempt >= MAX_POLL_ATTEMPTS) {
          setError(
            "Your payment was successful, but we're still processing your order. " +
            "You'll receive a confirmation email shortly. If you don't hear from us within an hour, please contact support."
          );
          setLoading(false);
          return true; // Stop polling
        }
        
        return false; // Continue polling
      }
    };

    // Start polling
    let currentAttempt = 0;
    const poll = async () => {
      currentAttempt++;
      setPollAttempts(currentAttempt);
      const success = await pollForOrder(currentAttempt);
      
      if (!success) {
        setTimeout(poll, POLL_INTERVAL_MS);
      }
    };

    poll();
  }, [sessionId, paypalToken, source, trackPurchaseEvent]);

  useEffect(() => {
    const pkgSession = searchParams.get("package_session_id");
    if (!pkgSession) return;
    setPkgConfirming(true);
    (async () => {
      const maxAttempts = 3;
      const delayMs = 2500;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const r = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verify-package-purchase`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionId: pkgSession }),
          });
          if (r.ok) {
            const data = await r.json().catch(() => ({} as any));
            setPkgAdded(true);
            trackPackagePurchase(pkgSession, typeof data?.amountCents === "number" ? data.amountCents : null);
            break;
          }
          throw new Error(`HTTP ${r.status}`);
        } catch (e) {
          console.error(`Package verification attempt ${attempt} failed:`, e);
          if (attempt < maxAttempts) {
            await new Promise(res => setTimeout(res, delayMs));
          }
        }
      }
      setPkgConfirming(false);
      setSearchParams(prev => { const p = new URLSearchParams(prev); p.delete("package_session_id"); return p; }, { replace: true });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <Layout showPromoBanner={false}>
        <div className="min-h-[60vh] flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">
              {showProcessingMessage ? "Finalizing your order..." : "Processing your order..."}
            </h2>
            <p className="text-muted-foreground">
              {showProcessingMessage 
                ? "Almost there! Just a moment while we confirm everything."
                : "Please wait while we confirm your payment."
              }
            </p>
          </div>
        </div>
      </Layout>
    );
  }

  if (error) {
    // If we have a payment identifier in the URL, the customer's card WAS charged.
    // Never suggest they retry checkout — that would risk a double purchase.
    const paymentAttempted = !!(sessionId || paypalToken);
    const supportRef = sessionId || paypalToken || "";
    const supportSubject = encodeURIComponent(
      `Order finalization help${supportRef ? ` — ref ${supportRef.slice(0, 20)}` : ""}`
    );
    const supportBody = encodeURIComponent(
      `Hi — my payment went through but the confirmation page is still loading.\n\n` +
      `Reference: ${supportRef}\n\nPlease help me finalize my order. Thanks!`
    );
    const mailto = `mailto:support@personalsonggifts.com?subject=${supportSubject}&body=${supportBody}`;

    if (paymentAttempted) {
      return (
        <Layout showPromoBanner={false}>
          <div className="min-h-[60vh] flex items-center justify-center">
            <div className="text-center max-w-md">
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Check className="h-8 w-8 text-primary" />
              </div>
              <h2 className="text-xl font-semibold mb-2">
                Your payment went through — we're finalizing your order
              </h2>
              <p className="text-muted-foreground mb-4">
                Your card or PayPal was charged successfully. If this page doesn't
                update in a minute, your order is still safe — email us with this
                page open and we'll sort it instantly.
              </p>
              <p className="text-sm font-semibold text-destructive mb-6">
                Please do not pay again.
              </p>
              {supportRef && (
                <p className="text-xs text-muted-foreground mb-4">
                  Reference for support:{" "}
                  <span className="font-mono">{supportRef.slice(0, 24)}{supportRef.length > 24 ? "…" : ""}</span>
                </p>
              )}
              <div className="space-y-3">
                <Button onClick={() => window.location.reload()}>Refresh this page</Button>
                <p className="text-sm text-muted-foreground">
                  Still stuck? Email{" "}
                  <a href={mailto} className="text-primary underline">
                    support@personalsonggifts.com
                  </a>
                </p>
              </div>
            </div>
          </div>
        </Layout>
      );
    }

    return (
      <Layout showPromoBanner={false}>
        <div className="min-h-[60vh] flex items-center justify-center">
          <div className="text-center max-w-md">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">We couldn't find your order</h2>
            <p className="text-muted-foreground mb-6">{error}</p>
            <div className="space-y-3">
              <Button asChild>
                <Link to="/create">Start a new song</Link>
              </Button>
              <p className="text-sm text-muted-foreground">
                If you've been charged, please contact{" "}
                <a href={mailto} className="text-primary underline">
                  support@personalsonggifts.com
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

  const deliveryTime = isLeadConversion
    ? "Instant"
    : orderDetails.rush_addon
      ? "1 hour"
      : orderDetails.pricingTier === "priority" ? "24 hours" : "48 hours";
  const expectedDate = orderDetails.expectedDelivery
    ? new Date(orderDetails.expectedDelivery)
    : null;

  // Guard against past/near-now timestamps (rush windows that already elapsed, clock skew, etc.)
  const NEAR_NOW_MS = 5 * 60 * 1000; // 5 minutes
  const showConcreteDate =
    !!expectedDate && expectedDate.getTime() > Date.now() + NEAR_NOW_MS;
  const softDeliveryLabel = orderDetails.rush_addon ? "Within the hour" : "Shortly";

  // Delivery-speed label (fix #4): derived from pricing_tier + rush_addon.
  const deliverySpeedLabel = orderDetails.rush_addon
    ? "Express (1 hour)"
    : orderDetails.pricingTier === "priority"
      ? "Priority (24 hours)"
      : "Standard (48 hours)";

  // Actual amount paid (fix #2): song price + captured add-ons. If unknown, show em dash.
  const totalPaidCents =
    typeof orderDetails.price === "number"
      ? Math.round(orderDetails.price * 100)
        + (orderDetails.package_addon_cents || 0)
        + (orderDetails.rush_addon_cents || 0)
      : null;

  return (
    <Layout showPromoBanner={false}>
      <div className="py-12 md:py-16">
        <div className="container mx-auto px-4 max-w-2xl text-center">
          {/* Success icon */}
          <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <Check className="h-10 w-10 text-primary" />
          </div>

          <h1 className="text-3xl md:text-4xl font-display text-foreground mb-4">
            {isLeadConversion 
              ? "🎉 Your Full Song is Ready!" 
              : "Thank You! Your Song Is On Its Way 🎵"}
          </h1>
          
          <p className="text-lg text-muted-foreground mb-8">
            {isLeadConversion ? (
              <>Your personalized song for <span className="text-foreground font-medium">{orderDetails.recipientName}</span> is now unlocked and ready to share!</>
            ) : (
              <>We've received your order and our songwriters are getting started on your 
              personalized song for <span className="text-foreground font-medium">{orderDetails.recipientName}</span>.</>
            )}
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
              <div className="flex justify-between">
                <span className="text-muted-foreground">Price paid:</span>
                <span className="text-foreground font-medium">
                  ${(
                    (orderDetails.price ?? (orderDetails.pricingTier === "priority" ? 79.99 : 49.99))
                    + ((orderDetails.package_addon_cents || 0) + (orderDetails.rush_addon_cents || 0)) / 100
                  ).toFixed(2)} USD
                </span>
              </div>
            </div>
          </Card>

          {/* Delivery info or direct link */}
          {isLeadConversion && orderDetails.songUrl ? (
            <Card className="p-6 mb-8 bg-primary/5 border-primary/20">
              <div className="flex items-center justify-center gap-3 mb-3">
                <Music className="h-5 w-5 text-primary" />
                <h3 className="font-semibold text-foreground">Your Song is Ready!</h3>
              </div>
              <p className="text-muted-foreground mb-4">
                We've also sent the full song to your email.
              </p>
              <Button asChild size="lg" className="w-full">
                <Link to={`/song/${orderDetails.orderId.slice(0, 8)}`}>
                  🎵 Listen to Your Full Song
                </Link>
              </Button>
            </Card>
          ) : (
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
              {orderDetails.rush_addon && (
                <p className="mt-2 flex items-center justify-center gap-1.5 text-xs text-primary">
                  <Zap className="h-3.5 w-3.5" />
                  1-hour delivery active
                </p>
              )}
            </Card>
          )}

          {/* Forever Memory Package upsell */}
          {(() => {
            const flagEnabled = import.meta.env.VITE_MEMORY_PACKAGE_ENABLED === "true" || searchParams.get("preview") === "1";
            if (!orderDetails?.orderId) return null;
            // Owned confirmation must ALWAYS render (regardless of flag) — paid customers must see what they bought.
            if (pkgConfirming && !pkgAdded) {
              return (
                <Card className="p-6 mb-8 border-primary/30 bg-gradient-to-br from-primary/5 to-accent/5 text-center">
                  <div className="flex items-center justify-center gap-2">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground">Confirming your package purchase…</p>
                  </div>
                </Card>
              );
            }
            if (pkgAdded) {
              return (
                <Card className="p-6 mb-8 border-primary/30 bg-gradient-to-br from-primary/5 to-accent/5 text-center">
                  <div className="flex items-center justify-center gap-2 mb-1">
                    <Check className="h-5 w-5 text-primary" />
                    <h3 className="font-semibold text-foreground">Forever Memory Package added ✓</h3>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {isLeadConversion
                      ? <>Your printable keepsake, custom album covers, full lyrics, download, and acoustic version are all waiting on {orderDetails.recipientName}'s song page right now.</>
                      : <>Your printable keepsake, custom album covers, full lyrics, download, and acoustic version will all be waiting on {orderDetails.recipientName}'s song page when the song is ready.</>}
                  </p>
                </Card>
              );
            }
            // Sell card only when flag enabled and package not yet owned.
            if (!flagEnabled) return null;
            return (
              <Card className="p-6 mb-8 border-primary/30 bg-gradient-to-br from-primary/5 to-accent/5 text-center">
                <p className="text-xs uppercase tracking-wide text-primary font-semibold mb-2">Complete the gift</p>
                <div className="flex items-center justify-center gap-2 mb-3">
                  <Gift className="h-5 w-5 text-primary" />
                  <h3 className="text-xl font-bold text-foreground">Forever Memory Package</h3>
                </div>
                <ul className="text-sm text-left max-w-xs mx-auto space-y-1.5 mb-4">
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-primary shrink-0" />
                    <span className="text-muted-foreground">Printable lyric art keepsake</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-primary shrink-0" />
                    <span className="text-muted-foreground">Custom album cover made from your photo</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-primary shrink-0" />
                    <span className="text-muted-foreground">Full lyrics</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-primary shrink-0" />
                    <span className="text-muted-foreground">High-quality download</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-primary shrink-0" />
                    <span className="text-muted-foreground">Acoustic version</span>
                  </li>
                </ul>
                <div className="flex items-baseline justify-center gap-2 mb-1">
                  <span className="text-3xl font-bold text-primary">$24</span>
                  <span className="text-sm text-muted-foreground line-through">$45 value</span>
                </div>
                <p className="text-xs text-muted-foreground mb-4">
                  {isLeadConversion
                    ? <>Everything unlocks on {orderDetails.recipientName}'s song page — available right now.</>
                    : <>Everything unlocks on {orderDetails.recipientName}'s song page as soon as the song is ready.</>}
                </p>
                <Button size="lg" disabled={pkgLoading} onClick={handleAddPackage} className="gap-2">
                  {pkgLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gift className="h-4 w-4" />}
                  Add the Forever Memory Package
                </Button>
                <div className="mt-3">
                  {!showPkgCode ? (
                    <button
                      type="button"
                      onClick={() => setShowPkgCode(true)}
                      className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
                    >
                      Have a promo code?
                    </button>
                  ) : (
                    <div className="flex flex-col items-center gap-1">
                      <Input
                        value={pkgCode}
                        onChange={(e) => { setPkgCode(e.target.value); if (pkgError) setPkgError(null); }}
                        placeholder="Promo code"
                        className="max-w-[200px] text-center"
                      />
                      {pkgError && <p className="text-xs text-red-600">{pkgError}</p>}
                    </div>
                  )}
                </div>
              </Card>
            );
          })()}

          {/* Email whitelist notice — only for new orders, not instant lead conversions */}
          {!isLeadConversion && (
            <div className="flex gap-3 p-4 mb-8 rounded-lg text-left" style={{ backgroundColor: "hsl(48 100% 96%)", border: "1px solid hsl(48 60% 80%)" }}>
              <Mail className="h-5 w-5 shrink-0 mt-0.5" style={{ color: "hsl(32 95% 44%)" }} />
              <div className="text-sm" style={{ color: "hsl(30 50% 20%)" }}>
                <p className="font-semibold mb-1">One important thing</p>
                <p className="mb-2">
                  Your finished song will arrive from <strong>support@personalsonggifts.com</strong>. Sometimes email providers send it to spam or junk by mistake, so if you don't see it in your inbox, check there first. Adding us to your contacts makes sure you won't miss it!
                </p>
                <p>
                  Questions? Reach out anytime at{" "}
                  <a href="mailto:support@personalsonggifts.com" className="underline font-medium">
                    support@personalsonggifts.com
                  </a>
                </p>
              </div>
            </div>
          )}

          {/* Revision link — show for new orders with a revision token */}
          {!isLeadConversion && orderDetails.revisionToken && (
            <Card
              className="p-6 mb-8 text-center"
              style={{
                background: "linear-gradient(135deg, hsl(220 30% 97%), hsl(210 25% 94%))",
                border: "1px solid hsl(220 20% 90%)",
              }}
            >
              <div className="flex items-center justify-center gap-2 mb-2">
                <Pencil className="h-5 w-5 text-primary" />
                <h3 className="font-semibold text-foreground">Need to Make Changes?</h3>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                Update your song details before we start creating it.
              </p>
              {orderDetails.rush_addon && (
                <p className="text-xs text-primary mb-4">
                  Heads up: your song starts production in ~5 minutes — make any edits right away. Edits reschedule delivery.
                </p>
              )}
              <Button asChild variant="outline" size="sm">
                <Link to={`/song/revision/${orderDetails.revisionToken}`}>
                  <Pencil className="h-4 w-4 mr-2" />
                  Edit Song Details
                </Link>
              </Button>
            </Card>
          )}

          {/* CTA */}
          <Button asChild size="lg">
            <Link to="/">Return Home</Link>
          </Button>

          <p className="text-sm text-muted-foreground mt-6">
            Questions? Contact us at{" "}
            <a href="mailto:support@personalsonggifts.com" className="text-primary underline">
              support@personalsonggifts.com
            </a>
          </p>
        </div>
      </div>
    </Layout>
  );
};

export default PaymentSuccess;
