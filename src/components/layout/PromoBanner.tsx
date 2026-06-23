import { useState, useEffect, useMemo } from "react";
import { X } from "lucide-react";
import { Link } from "react-router-dom";
import { useActivePromo } from "@/hooks/useActivePromo";

interface TimeLeft {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  total: number;
}

function getTimeLeft(endIso: string): TimeLeft {
  const total = new Date(endIso).getTime() - Date.now();
  const clamped = Math.max(0, total);
  const seconds = Math.floor((clamped / 1000) % 60);
  const minutes = Math.floor((clamped / (1000 * 60)) % 60);
  const hours = Math.floor((clamped / (1000 * 60 * 60)) % 24);
  const days = Math.floor(clamped / (1000 * 60 * 60 * 24));
  return { days, hours, minutes, seconds, total: clamped };
}

function formatTimeLeft({ days, hours, minutes, seconds }: TimeLeft): string {
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0 || days > 0) parts.push(`${hours.toString().padStart(2, "0")}h`);
  parts.push(`${minutes.toString().padStart(2, "0")}m`);
  parts.push(`${seconds.toString().padStart(2, "0")}s`);
  return parts.join(" ");
}

const PromoBanner = () => {
  const [isVisible, setIsVisible] = useState(true);
  const { promo, loading } = useActivePromo();
  const [timeLeft, setTimeLeft] = useState<TimeLeft | null>(null);

  const endIso = promo.endsAt;

  useEffect(() => {
    if (!endIso) return;

    const update = () => setTimeLeft(getTimeLeft(endIso));
    update();

    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [endIso]);

  if (!isVisible || loading || !promo.active || !promo.showBanner) return null;

  const bannerText = `${promo.bannerEmoji || "🔥"} ${promo.bannerText || "Limited Time Sale!"}`;
  const endLabel = endIso
    ? new Date(endIso).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
        timeZoneName: "short",
      })
    : null;

  return (
    <div
      className={`relative py-2.5 px-4 ${promo.bannerBgColor ? '' : 'bg-primary'} ${promo.bannerTextColor ? '' : 'text-primary-foreground'}`}
      style={{
        ...(promo.bannerBgColor ? { backgroundColor: promo.bannerBgColor } : {}),
        ...(promo.bannerTextColor ? { color: promo.bannerTextColor } : {}),
      }}
    >
      <div className="container mx-auto flex flex-col sm:flex-row items-center justify-center gap-1.5 sm:gap-2 text-sm md:text-base text-center">
        <span className="font-medium">
          {bannerText}
        </span>
        {timeLeft && timeLeft.total > 0 && (
          <span
            className="inline-flex items-center rounded px-2 py-0.5 text-xs sm:text-sm font-bold bg-white/20 whitespace-nowrap"
            title={endLabel ? `Sale ends ${endLabel}` : undefined}
            aria-label={endLabel ? `Sale ends ${endLabel}` : undefined}
          >
            Ends in {formatTimeLeft(timeLeft)}
          </span>
        )}
        <Link 
          to="/create" 
          className="underline underline-offset-2 hover:no-underline font-semibold ml-0 sm:ml-1"
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
