import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Smartphone, Monitor, Tablet, Clock } from "lucide-react";

interface Order {
  id: string;
  price: number;
  status: string;
  created_at: string;
  device_type?: string | null;
  source?: string | null;
}

interface Lead {
  id: string;
  captured_at: string;
  converted_at: string | null;
  status: string;
  order_id: string | null;
}

interface FunnelInsightsProps {
  orders: Order[];
  leads: Lead[];
}

const DEVICE_ICONS: Record<string, React.ElementType> = {
  mobile: Smartphone,
  desktop: Monitor,
  tablet: Tablet,
};

export function FunnelInsights({ orders, leads }: FunnelInsightsProps) {
  const { deviceStats, timeToConvert } = useMemo(() => {
    const active = orders.filter((o) => o.status !== "cancelled");

    // --- Device conversion rates ---
    // Count leads by device isn't available, but we can show order split + AOV by device
    const deviceBuckets: Record<string, { count: number; revenue: number }> = {};
    for (const o of active) {
      const device = o.device_type || "unknown";
      if (!deviceBuckets[device]) deviceBuckets[device] = { count: 0, revenue: 0 };
      deviceBuckets[device].count++;
      deviceBuckets[device].revenue += o.price;
    }

    const deviceStats = Object.entries(deviceBuckets)
      .filter(([key]) => key !== "unknown")
      .map(([device, { count, revenue }]) => ({
        device,
        count,
        revenue,
        aov: count > 0 ? Math.round(revenue / count) : 0,
        pct: active.length > 0 ? Math.round((count / active.length) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count);

    // --- Time to convert (lead → order) ---
    const convertedLeads = leads.filter((l) => l.status === "converted" && l.converted_at);
    const deltas: number[] = [];
    for (const lead of convertedLeads) {
      const captured = new Date(lead.captured_at).getTime();
      const converted = new Date(lead.converted_at!).getTime();
      const hoursToConvert = (converted - captured) / (1000 * 60 * 60);
      if (hoursToConvert >= 0 && hoursToConvert < 720) { // cap at 30 days
        deltas.push(hoursToConvert);
      }
    }

    deltas.sort((a, b) => a - b);
    const median = deltas.length > 0 ? deltas[Math.floor(deltas.length / 2)] : null;
    const avg = deltas.length > 0 ? deltas.reduce((s, d) => s + d, 0) / deltas.length : null;
    const within1h = deltas.filter((d) => d <= 1).length;
    const within24h = deltas.filter((d) => d <= 24).length;
    const sameSession = deltas.filter((d) => d <= 0.083).length; // 5 min

    const timeToConvert = {
      median,
      avg,
      total: deltas.length,
      sameSession,
      within1h,
      within24h,
    };

    return { deviceStats, timeToConvert };
  }, [orders, leads]);

  function formatHours(h: number | null): string {
    if (h === null) return "N/A";
    if (h < 1) return `${Math.round(h * 60)}m`;
    if (h < 48) return `${Math.round(h)}h`;
    return `${Math.round(h / 24)}d`;
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Device Performance */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-medium">Orders by Device</CardTitle>
        </CardHeader>
        <CardContent>
          {deviceStats.length > 0 ? (
            <div className="space-y-3">
              {deviceStats.map((d) => {
                const Icon = DEVICE_ICONS[d.device] || Monitor;
                return (
                  <div key={d.device} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium capitalize">{d.device}</span>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <span>{d.count} orders ({d.pct}%)</span>
                      <span className="text-muted-foreground">${d.revenue.toLocaleString()}</span>
                      <span className="font-medium">AOV ${d.aov}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-4 text-sm">No device data</p>
          )}
        </CardContent>
      </Card>

      {/* Time to Convert */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Lead → Purchase Speed
          </CardTitle>
        </CardHeader>
        <CardContent>
          {timeToConvert.total > 0 ? (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Median Time</p>
                <p className="text-xl font-bold">{formatHours(timeToConvert.median)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Average Time</p>
                <p className="text-xl font-bold">{formatHours(timeToConvert.avg)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Same Session (&lt;5m)</p>
                <p className="text-xl font-bold">
                  {timeToConvert.sameSession}
                  <span className="text-sm font-normal text-muted-foreground ml-1">
                    ({Math.round((timeToConvert.sameSession / timeToConvert.total) * 100)}%)
                  </span>
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Within 24h</p>
                <p className="text-xl font-bold">
                  {timeToConvert.within24h}
                  <span className="text-sm font-normal text-muted-foreground ml-1">
                    ({Math.round((timeToConvert.within24h / timeToConvert.total) * 100)}%)
                  </span>
                </p>
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-4 text-sm">No conversion data yet</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
