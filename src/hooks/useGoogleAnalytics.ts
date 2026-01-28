declare global {
  interface Window {
    gtag: (...args: unknown[]) => void;
  }
}

export const useGoogleAnalytics = () => {
  const trackEvent = (eventName: string, params?: Record<string, unknown>) => {
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('event', eventName, params);
    }
  };

  return { trackEvent };
};
