import { Star, Music2 } from "lucide-react";

/**
 * Compact trust row shown above the fold, directly under the "As Seen On" logos.
 * Rating uses green squares with white stars.
 */
const TrustStrip = () => {
  return (
    <div className="w-full">
      <div className="mx-auto flex w-full max-w-md flex-col items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-soft sm:max-w-none sm:w-auto sm:flex-row sm:justify-center sm:gap-6 sm:px-6">
        {/* Rating */}
        <div className="flex items-center gap-2">
          <div className="flex gap-[3px]">
            {[...Array(5)].map((_, i) => (
              <span
                key={i}
                className="flex h-6 w-6 items-center justify-center rounded-[3px] bg-trust md:h-7 md:w-7"
              >
                <Star className="h-4 w-4 fill-trust-foreground text-trust-foreground md:h-[1.15rem] md:w-[1.15rem]" />
              </span>
            ))}
          </div>
          <span className="text-lg font-semibold text-foreground md:text-xl">4.9</span>
          <span className="text-sm text-muted-foreground md:text-base">Rating</span>
        </div>

        {/* Divider */}
        <div className="hidden h-8 w-px bg-border sm:block" />
        <div className="h-px w-24 bg-border sm:hidden" />

        {/* Songs created */}
        <div className="flex items-center gap-2">
          <Music2 className="h-5 w-5 text-primary" />
          <span className="text-lg font-semibold text-foreground md:text-xl">500,000+</span>
          <span className="text-sm text-muted-foreground md:text-base">Songs Created</span>
        </div>
      </div>
    </div>
  );
};

export default TrustStrip;
