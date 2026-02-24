declare global {
  interface Window {
    ttq: {
      track: (eventName: string, params?: Record<string, unknown>) => void;
      identify: (params: Record<string, unknown>) => void;
      [key: string]: unknown;
    };
  }
}

export const useTikTokPixel = () => {
  const trackEvent = (eventName: string, params?: Record<string, unknown>) => {
    if (typeof window !== 'undefined' && window.ttq) {
      window.ttq.track(eventName, params);
    }
  };

  const identify = (params: Record<string, unknown>) => {
    if (typeof window !== 'undefined' && window.ttq) {
      window.ttq.identify(params);
    }
  };

  return { trackEvent, identify };
};
