import { useState } from "react";
import { X } from "lucide-react";
import { Link } from "react-router-dom";
import { useActivePromo } from "@/hooks/useActivePromo";

const PromoBanner = () => {
  const [isVisible, setIsVisible] = useState(true);
  const { promo, loading } = useActivePromo();

  if (!isVisible || loading || !promo.active || !promo.showBanner) return null;

  const bannerText = `${promo.bannerEmoji || "🔥"} ${promo.bannerText || "Limited Time Sale!"}`;

  return (
    <div
      className={`py-2.5 px-4 relative ${promo.bannerBgColor ? '' : 'bg-primary'} ${promo.bannerTextColor ? '' : 'text-primary-foreground'}`}
      style={{
        ...(promo.bannerBgColor ? { backgroundColor: promo.bannerBgColor } : {}),
        ...(promo.bannerTextColor ? { color: promo.bannerTextColor } : {}),
      }}
    >
      <div className="container mx-auto flex items-center justify-center gap-2 text-sm md:text-base">
        <span className="font-medium">
          {bannerText}
        </span>
        <Link 
          to="/create" 
          className="underline underline-offset-2 hover:no-underline font-semibold ml-1"
        >
          Create Your Song →
        </Link>
      </div>
      <button
        onClick={() => setIsVisible(false)}
        className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-primary-foreground/10 rounded-full transition-colors"
        aria-label="Dismiss banner"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
};

export default PromoBanner;
