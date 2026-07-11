declare global {
  interface Window {
    fbq: (...args: unknown[]) => void;
  }
}

export const useMetaPixel = () => {
  const trackEvent = (
    eventName: string,
    params?: Record<string, unknown>,
    options?: { eventID?: string },
  ) => {
    if (typeof window !== 'undefined' && window.fbq) {
      window.fbq('track', eventName, params, options);
    }
  };

  const trackCustomEvent = (
    eventName: string,
    params?: Record<string, unknown>,
    options?: { eventID?: string },
  ) => {
    if (typeof window !== 'undefined' && window.fbq) {
      window.fbq('trackCustom', eventName, params, options);
    }
  };

  return { trackEvent, trackCustomEvent };
};
