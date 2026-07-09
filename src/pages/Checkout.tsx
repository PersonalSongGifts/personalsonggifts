import { useLocation, useNavigate, Link } from "react-router-dom";
import { useState, useMemo, useRef, useEffect } from "react";
import Layout from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Check,
  Shield,
  Mail,
  CreditCard,
  ArrowLeft,
  Loader2,
  Tag,
  Lock,
  Star,
  Zap,
  Play,
  Pause,
  X,
  Sparkles,
  Pencil,
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

// -----------------------------------------------------------------------------
// Pricing constants (frontend). Server is the source of truth for what is charged;
// these values are kept in lock-step with create-checkout / create-paypal-order.
// -----------------------------------------------------------------------------
const BASE_SONG_CENTS = 2900;              // live charge for a Standard custom song
const ADDON_PRICES_CENTS = { forever_memory: 2400, rush: 1000 } as const;
const PACKAGE_ANCHOR_CENTS = 3700;         // struck-through anchor for Forever Memory bump
const FORMER_LIST_ANCHOR_CENTS = 4999;     // PSG's own former live price (real anchor)
type AddonKey = keyof typeof ADDON_PRICES_CENTS;

interface AdditionalPromo {
  code: string;
  type: "amount_off" | "percent_off";
  amount_off?: number; // in cents
  percent_off?: number;
  name: string;
}

// Discount amount in cents applied on top of the live song price.
function calculateAdditionalDiscountCents(baseCents: number, promo: AdditionalPromo): number {
  if (promo.type === "amount_off" && promo.amount_off) {
    return Math.min(promo.amount_off, baseCents);
  }
  if (promo.type === "percent_off" && promo.percent_off) {
    return baseCents - Math.floor(baseCents * (100 - promo.percent_off) / 100);
  }
  return 0;
}

// -----------------------------------------------------------------------------
// Inline sample tracks — three short previews for the "Hear what your song
// could sound like" module. Files live in /public/audio/ (shared with homepage).
// -----------------------------------------------------------------------------
const SAMPLE_TRACKS: { id: string; title: string; occasion: string; src: string }[] = [
  { id: "s1", title: "My Favorite Yes", occasion: "Anniversary", src: "/audio/my-favorite-yes.mp3" },
  { id: "s2", title: "Because of You Mama", occasion: "Mother's Day", src: "/audio/because-of-you-mama.mp3" },
  { id: "s3", title: "You Led the Way", occasion: "Father's Day", src: "/audio/you-led-the-way.mp3" },
];

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

  // Delivery speed: "standard" (24h, free) or "express" (1h, +$10 rush addon).
  // NOTE: pricingTier sent to the server is ALWAYS "standard"; express only
  // toggles the rush addon. There is no priority tier from this page anymore.
  const [deliverySpeed, setDeliverySpeed] = useState<"standard" | "express">("standard");
  const rushSelected = deliverySpeed === "express";
  const deliveryRadioRef = useRef<HTMLDivElement>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPayPalLoading, setIsPayPalLoading] = useState(false);

  const [promoOpen, setPromoOpen] = useState(false);
  const [promoCode, setPromoCode] = useState("");
  const [additionalPromo, setAdditionalPromo] = useState<AdditionalPromo | null>(null);
  const [promoError, setPromoError] = useState("");
  const [isValidating, setIsValidating] = useState(false);

  const [selectedAddons, setSelectedAddons] = useState<Record<AddonKey, boolean>>({
    forever_memory: false,
    rush: false,
  });
  const packageSelected = selectedAddons.forever_memory;
  const toggleAddon = (key: AddonKey) =>
    setSelectedAddons((prev) => ({ ...prev, [key]: !prev[key] }));

  // Simple preview player state (one <audio> at a time).
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  useEffect(() => () => { audioRef.current?.pause(); }, []);
  const togglePlay = (t: typeof SAMPLE_TRACKS[number]) => {
    if (playingId === t.id) { audioRef.current?.pause(); setPlayingId(null); return; }
    audioRef.current?.pause();
    const a = new Audio(t.src);
    audioRef.current = a;
    a.addEventListener("ended", () => setPlayingId(null));
    void a.play();
    setPlayingId(t.id);
  };

  const userTimezone = useMemo(() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone; }
    catch { return "America/New_York"; }
  }, []);
  const phoneE164 = useMemo(() => normalizeToE164(formData?.phoneNumber), [formData?.phoneNumber]);

  const { promo: activeFlashPromo, refetch: refetchPromo } = useActivePromo();

  // Live base price in cents — server-parity: flash promo overrides the flat $29.
  const baseSongCents = activeFlashPromo.active
    ? (activeFlashPromo.standardPriceCents || BASE_SONG_CENTS)
    : BASE_SONG_CENTS;

  const additionalSavingsCents = additionalPromo
    ? calculateAdditionalDiscountCents(baseSongCents, additionalPromo)
    : 0;
  const songTotalCents = Math.max(0, baseSongCents - additionalSavingsCents);

  const isFullyFreeCode = additionalPromo?.percent_off === 100;

  const packageChargeCents = packageSelected && !isFullyFreeCode
    ? ADDON_PRICES_CENTS.forever_memory
    : 0;
  const rushChargeCents = rushSelected && !isFullyFreeCode
    ? ADDON_PRICES_CENTS.rush
    : 0;
  const addonsChargeCents = packageChargeCents + rushChargeCents;

  const grandTotalCents = songTotalCents + addonsChargeCents;
  const grandTotal = grandTotalCents / 100;
  const isZeroTotal = grandTotalCents <= 0;

  // Only show a struck-through base anchor + "You save" when a GENUINE flash
  // promo is discounting the base song below its flat $29 price. Ryan has
  // never sold at $58, so a permanent "$58 → $29" anchor would be a
  // fictitious former-price claim (FTC 16 CFR 233). Default state: flat $29.
  const hasFlashBaseDiscount = activeFlashPromo.active && baseSongCents < BASE_SONG_CENTS;
  const flashAnchorCents = hasFlashBaseDiscount ? BASE_SONG_CENTS : 0;
  const anchorSavingsCents = hasFlashBaseDiscount
    ? Math.max(0, BASE_SONG_CENTS - baseSongCents)
    : 0;
  // Former-list ($49.99 → live song price) savings — only counted when the
  // struck-through anchor is actually rendered on the song line item below,
  // so the "You save" total always matches what the customer visibly sees.
  const formerListSavingsCents =
    !hasFlashBaseDiscount && songTotalCents < FORMER_LIST_ANCHOR_CENTS
      ? FORMER_LIST_ANCHOR_CENTS - songTotalCents
      : 0;
  const packageSavingsCents = packageSelected
    ? Math.max(0, PACKAGE_ANCHOR_CENTS - ADDON_PRICES_CENTS.forever_memory)
    : 0;
  const promoSavingsCents = additionalSavingsCents;
  const totalSavingsCents =
    anchorSavingsCents + formerListSavingsCents + packageSavingsCents + promoSavingsCents;

  const recipientName = formData?.recipientName?.trim() || "your loved one";

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
        toast({ title: "Promo code applied", description: discountDesc });
      } else {
        setPromoError(data.error || "Invalid promo code");
      }
    } catch (err) {
      console.error("Promo validation error:", err);
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

  // No-form-data fallback.
  if (!formData) {
    return (
      <Layout showPromoBanner={false}>
        <div className="min-h-[60vh] flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-semibold mb-4">No order found</h1>
            <p className="text-muted-foreground mb-6">Please start by creating your song.</p>
            <Button asChild><Link to="/create">Create Your Song</Link></Button>
          </div>
        </div>
      </Layout>
    );
  }

  const buildPayloadCommon = () => {
    const utmParams = getStoredUtmParams();
    return {
      pricingTier: "standard" as const,
      formData: {
        ...formData,
        smsOptIn: formData.smsOptIn && !!phoneE164,
        phoneE164: phoneE164 || undefined,
        timezone: userTimezone,
      },
      additionalPromoCode: additionalPromo?.code || undefined,
      promoSlug: activeFlashPromo.active ? activeFlashPromo.slug : undefined,
      utmSource: utmParams.utm_source || undefined,
      utmMedium: utmParams.utm_medium || undefined,
      utmCampaign: utmParams.utm_campaign || undefined,
      utmContent: utmParams.utm_content || undefined,
      utmTerm: utmParams.utm_term || undefined,
      addons: {
        forever_memory: packageSelected,
        rush: rushSelected,
      },
    };
  };

  const firePixels = () => {
    const value = grandTotal;
    trackMetaEvent("InitiateCheckout", { value, currency: "USD" });
    trackGAEvent("begin_checkout", {
      currency: "USD",
      value,
      items: [{
        item_name: rushSelected ? "Custom Song (Express)" : "Custom Song (Standard)",
        item_category: formData.occasion,
        price: value,
        quantity: 1,
      }],
    });
    trackTikTokEvent("InitiateCheckout", { content_type: "product", value, currency: "USD" });
  };

  const handleCheckout = async () => {
    if (isSubmitting || isPayPalLoading) return;
    setIsSubmitting(true);
    firePixels();
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-checkout`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify(buildPayloadCommon()),
        }
      );
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (errorData.error === "promo_expired") {
          toast({ title: "This sale has ended", description: "Prices have been updated.", variant: "destructive" });
          await refetchPromo();
          setIsSubmitting(false);
          return;
        }
        throw new Error(errorData.error || "Failed to create checkout session");
      }
      const { url } = await response.json();
      if (url) window.location.href = url;
      else throw new Error("No checkout URL received");
    } catch (err) {
      console.error("Checkout error:", err);
      toast({
        title: "Something went wrong",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
      setIsSubmitting(false);
    }
  };

  const handlePayPalCheckout = async () => {
    if (isPayPalLoading || isSubmitting) return;
    setIsPayPalLoading(true);
    firePixels();
    try {
      const createResponse = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-paypal-order`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify(buildPayloadCommon()),
        }
      );
      if (!createResponse.ok) {
        const errorData = await createResponse.json().catch(() => ({}));
        if (errorData.error === "promo_expired") {
          toast({ title: "This sale has ended", description: "Prices have been updated.", variant: "destructive" });
          await refetchPromo();
          setIsPayPalLoading(false);
          return;
        }
        throw new Error(errorData.error || "Failed to create PayPal order");
      }
      const { orderID: paypalOrderID } = await createResponse.json();
      window.location.href = `https://www.paypal.com/checkoutnow?token=${paypalOrderID}`;
    } catch (err) {
      console.error("PayPal checkout error:", err);
      toast({
        title: "Something went wrong",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
      setIsPayPalLoading(false);
    }
  };

  const selectExpressAndScroll = () => {
    setDeliverySpeed("express");
    deliveryRadioRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  return (
    <Layout showPromoBanner={false}>
      <div className="py-6 md:py-10">
        <div className="container mx-auto px-4 max-w-2xl">
          {/* Back */}
          <Button variant="ghost" onClick={() => navigate(-1)} className="mb-4 gap-2 -ml-2">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>

          {/* 1. Header */}
          <div className="text-center mb-6">
            <h1 className="text-3xl md:text-4xl font-display text-foreground mb-2">Almost there!</h1>
            <p className="text-muted-foreground">
              You're one step away from {recipientName}'s personalized song
            </p>
          </div>

          {/* 2. Your Custom Song Order — recap (no price) */}
          <Card className="p-5 md:p-6 mb-6 border-primary/20 shadow-sm">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex-1 min-w-0">
                {hasFlashBaseDiscount && (
                  <span className="inline-block mb-1 text-[10px] font-semibold uppercase tracking-wider bg-accent/20 text-accent-foreground px-2 py-0.5 rounded-full">
                    {activeFlashPromo.name}
                  </span>
                )}
                <h3 className="font-semibold text-foreground text-base md:text-lg">
                  Your Custom Song Order
                </h3>
              </div>
              <button
                type="button"
                onClick={() => navigate("/create")}
                aria-label="Edit song details"
                className="text-muted-foreground hover:text-primary p-1 -m-1 rounded"
              >
                <Pencil className="h-4 w-4" />
              </button>
            </div>
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Song for</dt>
                <dd className="text-foreground font-medium text-right truncate">{recipientName}</dd>
              </div>
              {formData.occasion && (
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Occasion</dt>
                  <dd className="text-foreground font-medium text-right truncate">{formData.occasion}</dd>
                </div>
              )}
              {formData.genre && (
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Style</dt>
                  <dd className="text-foreground font-medium text-right truncate">{formData.genre}</dd>
                </div>
              )}
            </dl>
          </Card>

          {/* 3. Guarantee block */}
          <Card className="p-4 mb-6 bg-secondary/40 border-primary/20">
            <div className="flex items-start gap-3">
              <Shield className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <div className="font-semibold text-foreground text-sm">Love it or your money back — 14-day guarantee</div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Unlimited free revisions, plus a full refund on request within 14 days if you're not happy.{" "}
                  <Link to="/refund" className="underline decoration-muted-foreground/40 hover:text-primary hover:decoration-primary">
                    Our Love-It Guarantee
                  </Link>
                </p>
              </div>
            </div>
          </Card>

          {/* 4. Upgrade Your Gift — Forever Memory Package */}
          <div className="mb-6">
            <p className="text-[11px] font-bold uppercase tracking-widest text-primary mb-2">Upgrade Your Gift</p>
            <Card
              onClick={() => toggleAddon("forever_memory")}
              className={`p-5 cursor-pointer transition-all ${packageSelected ? "ring-2 ring-primary border-primary bg-primary/5" : "hover:border-primary/50"}`}
            >
              <div className="flex items-start gap-3">
                <div className={`mt-1 w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${packageSelected ? "bg-primary border-primary" : "border-muted-foreground"}`}>
                  {packageSelected && <Check className="h-3.5 w-3.5 text-primary-foreground" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider bg-primary text-primary-foreground px-2 py-0.5 rounded-full">
                        Most Popular
                      </span>
                      <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
                        Save $13
                      </span>
                    </div>
                    <div className="text-right whitespace-nowrap">
                      <div className="text-xs text-muted-foreground line-through">{fmt(PACKAGE_ANCHOR_CENTS)}</div>
                      <div className="text-lg font-bold text-primary">{fmt(ADDON_PRICES_CENTS.forever_memory)} today</div>
                    </div>
                  </div>
                  <h4 className="font-semibold text-foreground mb-2">Forever Memory Package</h4>
                  <ul className="space-y-1.5 text-sm text-foreground">
                    <li className="flex items-start gap-2">
                      <Sparkles className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                      <span>Custom cover art from your photo</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Sparkles className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                      <span>Bonus version in a second style</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Sparkles className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                      <span>Printable lyric keepsake with QR code — scan to play</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Sparkles className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                      <span>Full lyrics + song download included</span>
                    </li>
                  </ul>
                  {packageSelected && (
                    <p className="flex items-center gap-1.5 text-xs text-primary mt-3">
                      <Check className="h-3.5 w-3.5" />
                      {isFullyFreeCode
                        ? "Added — included FREE with your promo code."
                        : `Added — ${fmt(ADDON_PRICES_CENTS.forever_memory)} in your total below.`}
                    </p>
                  )}
                </div>
              </div>
            </Card>
          </div>

          {/* 5. Delivery Speed selector */}
          <div className="mb-6" ref={deliveryRadioRef}>
            <h3 className="font-semibold text-foreground mb-3">Delivery speed</h3>
            <div role="radiogroup" aria-label="Delivery speed" className="space-y-2">
              <Card
                role="radio"
                aria-checked={!rushSelected}
                tabIndex={0}
                onClick={() => setDeliverySpeed("standard")}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setDeliverySpeed("standard"); }}
                className={`p-4 cursor-pointer transition-all ${!rushSelected ? "ring-2 ring-primary border-primary" : "hover:border-primary/50"}`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${!rushSelected ? "bg-primary border-primary" : "border-muted-foreground"}`}>
                    {!rushSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold text-foreground">Standard delivery</div>
                    <div className="text-xs text-muted-foreground">Ready within 24 hours</div>
                  </div>
                  <div className="text-sm font-semibold text-primary">FREE</div>
                </div>
              </Card>
              <Card
                role="radio"
                aria-checked={rushSelected}
                tabIndex={0}
                onClick={() => setDeliverySpeed("express")}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setDeliverySpeed("express"); }}
                className={`p-4 cursor-pointer transition-all ${rushSelected ? "ring-2 ring-primary border-primary" : "hover:border-primary/50"}`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${rushSelected ? "bg-primary border-primary" : "border-muted-foreground"}`}>
                    {rushSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold text-foreground flex items-center gap-1.5">
                      Express delivery
                      <Zap className="h-3.5 w-3.5 text-primary" />
                      <span className="text-[10px] font-bold uppercase tracking-wider bg-primary/10 text-primary px-1.5 py-0.5 rounded">guaranteed</span>
                    </div>
                    <div className="text-xs text-muted-foreground">Ready within 1 hour</div>
                  </div>
                  <div className="text-sm font-semibold text-foreground">+{fmt(ADDON_PRICES_CENTS.rush)}</div>
                </div>
              </Card>
            </div>
          </div>

          <div className="mb-6">
            <ValentineDeliveryNotice />
          </div>

          {/* 6. Social proof strip */}
          <Card className="p-4 mb-6">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="flex gap-0.5">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                ))}
              </div>
              <span className="text-xs font-semibold text-foreground">500,000+ songs delivered</span>
            </div>
            <p className="text-sm italic text-foreground mb-0.5">
              "I gave this to my mom for her 70th birthday and she played it on repeat for a week straight."
            </p>
            <p className="text-xs text-muted-foreground">— Rachel M.</p>
          </Card>

          {/* 7. Audio preview */}
          <div className="mb-6">
            <h3 className="font-semibold text-foreground mb-1">Hear what your song could sound like</h3>
            <p className="text-xs text-muted-foreground mb-3">Real songs made for real people — yours will be unique.</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {SAMPLE_TRACKS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => togglePlay(t)}
                  className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card hover:border-primary/50 transition-colors text-left"
                >
                  <span className="flex-shrink-0 w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                    {playingId === t.id ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-foreground truncate">{t.title}</span>
                    <span className="block text-xs text-muted-foreground truncate">{t.occasion}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* 8a. Promo code (collapsible) */}
          <div className="mb-6">
            {additionalPromo ? (
              <div className="flex items-center justify-between bg-primary/10 rounded-md px-3 py-2">
                <span className="text-primary font-medium text-sm flex items-center gap-1.5">
                  <Tag className="h-3.5 w-3.5" />
                  {additionalPromo.name} ({additionalPromo.type === "amount_off"
                    ? `$${((additionalPromo.amount_off || 0) / 100).toFixed(2)} off`
                    : `${additionalPromo.percent_off}% off`})
                </span>
                <Button variant="ghost" size="sm" onClick={handleRemovePromo} className="h-6 w-6 p-0">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : promoOpen ? (
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground flex items-center gap-1">
                  <Tag className="h-3 w-3" />
                  Promo code
                </label>
                <div className="flex gap-2">
                  <Input
                    placeholder="Enter code"
                    value={promoCode}
                    onChange={(e) => { setPromoCode(e.target.value); setPromoError(""); }}
                    onKeyDown={(e) => { if (e.key === "Enter") handleApplyPromo(); }}
                    className="flex-1"
                  />
                  <Button variant="outline" onClick={handleApplyPromo} disabled={!promoCode.trim() || isValidating}>
                    {isValidating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Apply"}
                  </Button>
                </div>
                {promoError && <p className="text-destructive text-xs">{promoError}</p>}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setPromoOpen(true)}
                className="text-sm text-muted-foreground underline decoration-muted-foreground/40 hover:text-primary hover:decoration-primary"
              >
                Have a promo code?
              </button>
            )}
          </div>

          {/* 8b. Email confirmation callout */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-6 flex items-start gap-3">
            <Mail className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-blue-900">Your song will be delivered to:</p>
              <p className="text-sm font-bold text-blue-900 mt-0.5 truncate">{formData.yourEmail}</p>
              <p className="text-[11px] text-blue-700 mt-0.5">Double-check this is correct.</p>
            </div>
          </div>

          {/* 9. Order Summary (bottom, with real $49.99 anchor) */}
          <Card className="p-5 md:p-6 mb-6 border-primary/20 shadow-sm">
            <h3 className="font-semibold text-foreground text-base md:text-lg mb-3">Order Summary</h3>

            <ul className="space-y-2 mb-3 text-sm">
              <li className="flex items-start gap-2">
                <Check className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                <span className="text-foreground">One-time payment — no subscription</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                <span className="text-foreground" data-testid="delivery-bullet">
                  {rushSelected ? (
                    <>Delivered within 1 hour <Zap className="inline h-3.5 w-3.5 text-primary" /></>
                  ) : (
                    <>Delivered within 24 hours</>
                  )}
                </span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                <span className="text-foreground">Unlimited plays — share with anyone</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                <span className="text-foreground">Free revision if it's not perfect</span>
              </li>
            </ul>

            <p className="text-xs text-muted-foreground mb-4 italic">
              That's about $0.29 per listen after just 100 plays — most customers play it hundreds of times.
            </p>

            <div className="border-t border-border pt-3 space-y-1.5 text-sm">
              {/* Song line item with real $49.99 anchor when no flash promo */}
              <div className="flex justify-between items-start gap-3">
                <span className="text-foreground">Your Song for {recipientName}</span>
                <span className="text-right whitespace-nowrap">
                  {!hasFlashBaseDiscount && songTotalCents < FORMER_LIST_ANCHOR_CENTS && (
                    <span className="text-xs text-muted-foreground line-through mr-2">{fmt(FORMER_LIST_ANCHOR_CENTS)}</span>
                  )}
                  {hasFlashBaseDiscount && (
                    <span className="text-xs text-muted-foreground line-through mr-2">{fmt(flashAnchorCents)}</span>
                  )}
                  <span className="text-foreground font-medium">{fmt(songTotalCents)}</span>
                </span>
              </div>
              {!hasFlashBaseDiscount && songTotalCents < FORMER_LIST_ANCHOR_CENTS && (
                <div className="flex justify-end">
                  <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
                    Save {fmt(FORMER_LIST_ANCHOR_CENTS - songTotalCents)}
                  </span>
                </div>
              )}
              {packageSelected && (
                <div className="flex justify-between text-foreground">
                  <span>Forever Memory Package</span>
                  <span>{isFullyFreeCode ? <span className="text-primary font-medium">FREE</span> : fmt(packageChargeCents)}</span>
                </div>
              )}
              {rushSelected && (
                <div className="flex justify-between text-foreground">
                  <span>Express delivery</span>
                  <span>{isFullyFreeCode ? <span className="text-primary font-medium">FREE</span> : fmt(rushChargeCents)}</span>
                </div>
              )}
              {totalSavingsCents > 0 && (
                <div className="flex justify-between text-primary font-medium">
                  <span>You save</span>
                  <span data-testid="you-save">{fmt(totalSavingsCents)}</span>
                </div>
              )}
              <div className="flex justify-between text-lg font-bold pt-2 border-t border-border">
                <span>Total</span>
                <span data-testid="summary-total">{fmt(grandTotalCents)}</span>
              </div>
            </div>
          </Card>

          {/* 10. CTA block */}
          <div className="space-y-3">
            <Button
              onClick={handleCheckout}
              size="lg"
              className="w-full text-base md:text-lg py-6 font-semibold gap-2"
              disabled={isSubmitting || isPayPalLoading}
            >
              {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <CreditCard className="h-5 w-5" />}
              {isSubmitting ? "Processing..." : `Get My Song Now — ${fmt(grandTotalCents)}`}
            </Button>

            {isZeroTotal ? (
              <p className="text-center text-xs text-muted-foreground">
                Free orders are processed via card checkout — no card required.
              </p>
            ) : (
              <>
                <div className="flex items-center gap-3">
                  <div className="flex-1 border-t border-border" />
                  <span className="text-xs text-muted-foreground">or</span>
                  <div className="flex-1 border-t border-border" />
                </div>
                <Button
                  onClick={handlePayPalCheckout}
                  size="lg"
                  variant="outline"
                  className="w-full text-base md:text-lg py-6 font-semibold gap-2 bg-[#FFC439] hover:bg-[#F0B72F] text-[#003087] border-[#FFC439] hover:border-[#F0B72F]"
                  disabled={isSubmitting || isPayPalLoading}
                >
                  {isPayPalLoading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M7.076 21.337H2.47a.641.641 0 0 1-.633-.74L4.944.901C5.026.382 5.474 0 5.998 0h7.46c2.57 0 4.578.543 5.69 1.81 1.01 1.15 1.304 2.42 1.012 4.287-.023.143-.047.288-.077.437-.983 5.05-4.349 6.797-8.647 6.797h-2.19c-.524 0-.968.382-1.05.9l-1.12 7.106zm14.146-14.42a3.35 3.35 0 0 0-.607-.541c-.013.076-.026.175-.041.254-.93 4.778-4.005 7.201-9.138 7.201h-2.19a.563.563 0 0 0-.556.479l-1.187 7.527h-.506l-.24 1.516a.56.56 0 0 0 .554.647h3.882c.46 0 .85-.334.922-.788.06-.26.76-4.852.816-5.09a.932.932 0 0 1 .923-.788h.58c3.76 0 6.705-1.528 7.565-5.946.36-1.847.174-3.388-.777-4.471z" />
                    </svg>
                  )}
                  {isPayPalLoading ? "Connecting to PayPal..." : `Pay with PayPal — ${fmt(grandTotalCents)}`}
                </Button>
              </>
            )}

            {/* 10. Need it sooner nudge */}
            {!rushSelected && (
              <button
                type="button"
                onClick={selectExpressAndScroll}
                data-testid="need-sooner"
                className="w-full text-center text-sm text-primary hover:underline flex items-center justify-center gap-1.5 py-1"
              >
                <Zap className="h-3.5 w-3.5" />
                Need it sooner? Get it in 1 hour for {fmt(ADDON_PRICES_CENTS.rush)} →
              </button>
            )}
          </div>

          {/* Trust chips */}
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground mt-4">
            <span className="flex items-center gap-1"><Lock className="h-3.5 w-3.5" /> Secure checkout</span>
            <span className="flex items-center gap-1"><Check className="h-3.5 w-3.5 text-primary" /> Instant confirmation</span>
            <span className="flex items-center gap-1"><Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" /> 500,000+ songs delivered</span>
          </div>

          <p className="text-center text-[11px] text-muted-foreground mt-3">
            All prices in USD. Local currency shown at checkout.
          </p>
        </div>
      </div>
    </Layout>
  );
};

export default Checkout;
