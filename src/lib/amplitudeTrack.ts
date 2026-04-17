/**
 * Safe Amplitude event tracking helper.
 * Wraps window.amplitude.track in a try/catch so missing/blocked Amplitude
 * (ad blockers, dev environments) never throws.
 */
export function trackEvent(name: string, props?: Record<string, unknown>): void {
  try {
    const amp = (window as unknown as { amplitude?: { track?: (n: string, p?: Record<string, unknown>) => void } }).amplitude;
    amp?.track?.(name, props);
  } catch (err) {
    // Silently swallow — analytics must never break UX
    if (typeof console !== "undefined") {
      console.debug("[trackEvent] failed", name, err);
    }
  }
}
