import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Globe, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface GeoBucket {
  key: string;
  conversions: number;
  revenue: number;
  aov: number;
}

interface GeoData {
  totalConversions: number;
  totalRevenue: number;
  aov: number;
  byRegion: GeoBucket[];
  byTimezone: GeoBucket[];
  byCountry: GeoBucket[];
}

interface FollowupGeoBreakdownProps {
  adminPassword: string;
}

export function FollowupGeoBreakdown({ adminPassword }: FollowupGeoBreakdownProps) {
  const [data, setData] = useState<GeoData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: res, error } = await supabase.functions.invoke("admin-orders", {
          method: "POST",
          body: { action: "get_followup_geo_breakdown", adminPassword },
        });
        if (!cancelled && !error) setData(res as GeoData);
      } catch (e) {
        console.error("Failed to load followup geo breakdown:", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [adminPassword]);

  const renderTable = (rows: GeoBucket[], label: string) => {
    const total = rows.reduce((s, r) => s + r.conversions, 0);
    if (rows.length === 0) {
      return <p className="text-muted-foreground text-sm py-4 text-center">No conversion data</p>;
    }
    return (
      <div className="space-y-1.5">
        <div className="grid grid-cols-12 text-xs font-medium text-muted-foreground pb-2 border-b">
          <div className="col-span-5">{label}</div>
          <div className="col-span-2 text-right">Conv.</div>
          <div className="col-span-2 text-right">Share</div>
          <div className="col-span-2 text-right">Revenue</div>
          <div className="col-span-1 text-right">AOV</div>
        </div>
        {rows.map((r) => {
          const pct = total > 0 ? Math.round((r.conversions / total) * 100) : 0;
          return (
            <div key={r.key} className="grid grid-cols-12 text-sm py-1 hover:bg-muted/40 rounded">
              <div className="col-span-5 truncate font-medium">{r.key}</div>
              <div className="col-span-2 text-right">{r.conversions}</div>
              <div className="col-span-2 text-right text-muted-foreground">{pct}%</div>
              <div className="col-span-2 text-right">${r.revenue.toLocaleString()}</div>
              <div className="col-span-1 text-right text-muted-foreground">${r.aov}</div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe className="h-5 w-5" />
          Follow-up Conversions by Geography
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            Loading geographic breakdown…
          </div>
        ) : !data || data.totalConversions === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            No follow-up conversions yet.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <p className="text-2xl font-bold">{data.totalConversions}</p>
                <p className="text-xs text-muted-foreground">Total conversions</p>
              </div>
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <p className="text-2xl font-bold">${data.totalRevenue.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Revenue</p>
              </div>
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <p className="text-2xl font-bold">${data.aov}</p>
                <p className="text-xs text-muted-foreground">Avg. order value</p>
              </div>
            </div>

            <Tabs defaultValue="region">
              <TabsList className="mb-4">
                <TabsTrigger value="region">By region</TabsTrigger>
                <TabsTrigger value="timezone">By timezone</TabsTrigger>
                <TabsTrigger value="country">By country</TabsTrigger>
              </TabsList>
              <TabsContent value="region">{renderTable(data.byRegion, "Region")}</TabsContent>
              <TabsContent value="timezone">
                <p className="text-xs text-muted-foreground mb-2">
                  Top 25 timezones (proxy for location).
                </p>
                {renderTable(data.byTimezone, "Timezone")}
              </TabsContent>
              <TabsContent value="country">
                <p className="text-xs text-muted-foreground mb-2">
                  Country comes from Stripe billing address — may show "Unknown" for older orders.
                </p>
                {renderTable(data.byCountry, "Country")}
              </TabsContent>
            </Tabs>
          </>
        )}
      </CardContent>
    </Card>
  );
}
