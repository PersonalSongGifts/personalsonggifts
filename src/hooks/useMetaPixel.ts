declare global {
  interface Window {
    fbq: (...args: unknown[]) => void;
  }
}

export const useMetaPixel = () => {
  const trackEvent = (eventName: string, params?: Record<string, unknown>) => {
    if (typeof window !== 'undefined' && window.fbq) {
      window.fbq('track', eventName, params);
    }
  };

  return { trackEvent };
};
