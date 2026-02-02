import { useEffect } from "react";

export interface UtmParams {
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
}

const UTM_STORAGE_KEY = "utm_params";

/**
 * Captures UTM parameters from URL and stores them in sessionStorage.
 * Call this hook on landing pages (Index, CreateSong).
 */
export function useUtmCapture(): void {
  useEffect(() => {
    // Only capture if we haven't already stored UTMs this session
    const existing = sessionStorage.getItem(UTM_STORAGE_KEY);
    if (existing) return;

    const params = new URLSearchParams(window.location.search);
    const utmSource = params.get("utm_source");
    const utmMedium = params.get("utm_medium");
    const utmCampaign = params.get("utm_campaign");
    const utmContent = params.get("utm_content");
    const utmTerm = params.get("utm_term");

    // Only store if at least one UTM param is present
    if (utmSource || utmMedium || utmCampaign || utmContent || utmTerm) {
      const utmData: UtmParams = {
        utm_source: utmSource,
        utm_medium: utmMedium,
        utm_campaign: utmCampaign,
        utm_content: utmContent,
        utm_term: utmTerm,
      };
      sessionStorage.setItem(UTM_STORAGE_KEY, JSON.stringify(utmData));
    }
  }, []);
}

/**
 * Retrieves stored UTM parameters from sessionStorage.
 * Returns null for each param if not set.
 */
export function getStoredUtmParams(): UtmParams {
  try {
    const stored = sessionStorage.getItem(UTM_STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored) as UtmParams;
    }
  } catch {
    // Ignore parsing errors
  }
  return {
    utm_source: null,
    utm_medium: null,
    utm_campaign: null,
    utm_content: null,
    utm_term: null,
  };
}
