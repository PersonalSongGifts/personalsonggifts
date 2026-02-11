import { useMemo } from "react";

/**
 * Valentine's delivery FOMO notice — informational urgency, not aggressive sales.
 * Shows on checkout page only, directly above the Pay button.
 * 
 * - Static "7 of 40" per session (no live decrement)
 * - Auto-hides after Valentine's delivery cutoff
 * - Replaces with post-cutoff message if past deadline
 */

// Valentine's delivery cutoff: Feb 12, 2026 11:59 PM PST = Feb 13, 2026 07:59 AM UTC
const VALENTINES_CUTOFF_UTC = new Date("2026-02-13T07:59:00.000Z");

export default function ValentineDeliveryNotice() {
  const now = useMemo(() => new Date(), []);
  const isPastCutoff = now > VALENTINES_CUTOFF_UTC;

  // Don't show anything well after Valentine's Day (Feb 15+)
  const VALENTINES_DAY_END = new Date("2026-02-15T08:00:00.000Z");
  if (now > VALENTINES_DAY_END) return null;

  if (isPastCutoff) {
    return (
      <div className="w-full rounded-lg bg-muted/60 border border-border px-4 py-3 text-center">
        <p className="text-sm text-muted-foreground">
          Orders placed now may arrive after Valentine's Day.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full rounded-lg bg-[hsl(350,60%,97%)] border border-[hsl(350,40%,90%)] px-4 py-4 space-y-1.5">
      <p className="text-sm font-semibold text-foreground">
        💝 Valentine's delivery update
      </p>
      <p className="text-sm text-foreground/90 leading-relaxed">
        We're nearly booked for Valentine's Day.{" "}
        <span className="font-semibold">6 of 40</span> Valentine's Day orders are still available.
      </p>
      <p className="text-xs text-muted-foreground">
        Orders placed now are still eligible for Valentine's delivery.
      </p>
    </div>
  );
}
