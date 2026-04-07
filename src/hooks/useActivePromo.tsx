import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface ActivePromo {
  active: boolean;
  slug?: string;
  name?: string;
  standardPriceCents?: number;
  priorityPriceCents?: number;
  leadPriceCents?: number;
  startsAt?: string;
  endsAt?: string;
  showBanner?: boolean;
  bannerText?: string;
  bannerEmoji?: string;
  bannerBgColor?: string;
  bannerTextColor?: string;
  bonusPriceCents?: number;
}

interface ActivePromoContextType {
  promo: ActivePromo;
  loading: boolean;
  refetch: () => Promise<void>;
}

const ActivePromoContext = createContext<ActivePromoContextType>({
  promo: { active: false },
  loading: true,
  refetch: async () => {},
});

export const ActivePromoProvider = ({ children }: { children: ReactNode }) => {
  const [promo, setPromo] = useState<ActivePromo>({ active: false });
  const [loading, setLoading] = useState(true);

  const fetchPromo = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke("get-active-promo", {
        body: {},
      });
      if (error) {
        console.error("Failed to fetch active promo:", error);
        setPromo({ active: false });
      } else {
        setPromo(data || { active: false });
      }
    } catch (err) {
      console.error("Active promo fetch error:", err);
      setPromo({ active: false });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPromo();
  }, [fetchPromo]);

  return (
    <ActivePromoContext.Provider value={{ promo, loading, refetch: fetchPromo }}>
      {children}
    </ActivePromoContext.Provider>
  );
};

export const useActivePromo = () => useContext(ActivePromoContext);
