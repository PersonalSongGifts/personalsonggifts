import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { toZonedTime } from "date-fns-tz";
import { format, subDays, startOfDay } from "date-fns";
import { orderTotalDollars } from "./orderTotals";

const TZ = "America/Los_Angeles";
const DAYS = 14;

interface Order {
  id: string;
  price: number;
  price_cents?: number | null;
  status: string;
  created_at: string;
  lyrics_price_cents?: number | null;
  download_price_cents?: number | null;
  bonus_price_cents?: number | null;
  package_price_cents?: number | null;
  rush_price_cents?: number | null;
}

interface Lead {
  id: string;
  captured_at: string;
  status: string;
  converted_at?: string | null;
}

interface ConversionFunnelProps {
  orders: Order[];
  leads: Lead[];
}

function bucketByDatePST<T>(items: T[], dateKey: keyof T, days: number) {
  const nowPST = toZonedTime(new Date(), TZ);
  const buckets: Record<string, T[]> = {};

  // Initialize buckets
  for (let i = days - 1; i >= 0; i--) {
    const d = startOfDay(subDays(nowPST, i));
    buckets[format(d, "yyyy-MM-dd")] = [];
  }

  for (const item of items) {
    const pst = toZonedTime(new Date(item[dateKey] as string), TZ);
    const key = format(startOfDay(pst), "yyyy-MM-dd");
    if (key in buckets) {
      buckets[key].push(item);
    }
  }

  return buckets;
}

export function ConversionFunnel({ orders, leads }: ConversionFunnelProps) {
  const { conversionData, aovData, stats } = useMemo(() => {
    const activeOrders = orders.filter((o) => o.status !== "cancelled");
    const orderBuckets = bucketByDatePST(activeOrders, "created_at", DAYS);
    const leadBuckets = bucketByDatePST(leads, "captured_at", DAYS);

    const dates = Object.keys(orderBuckets).sort();

    const dailyConversion: { date: string; label: string; rate: number; orders: number; leads: number }[] = [];
    const dailyAov: { date: string; label: string; aov: number; orders: number; revenue: number }[] = [];

    for (const date of dates) {
      const dayOrders = orderBuckets[date];
      const cohort = leadBuckets[date];
      const cohortSize = cohort.length;
      const cohortConverted = cohort.filter((l) => l.status === "converted").length;
      const orderCount = dayOrders.length;
      const revenue = dayOrders.reduce((s, o) => s + orderTotalDollars(o), 0);
      // Bounded cohort rate: leads captured that day that ever purchased.
      const rate = cohortSize > 0 ? (cohortConverted / cohortSize) * 100 : 0;
      const aov = orderCount > 0 ? revenue / orderCount : 0;
      const label = format(new Date(date), "MMM d");

      dailyConversion.push({
        date,
        label,
        rate: Math.round(rate * 10) / 10,
        orders: cohortConverted,
        leads: cohortSize,
      });
      dailyAov.push({ date, label, aov: Math.round(aov), orders: orderCount, revenue: Math.round(revenue) });
    }

    // Stats
    const today = dailyConversion[dailyConversion.length - 1];
    const yesterday = dailyConversion[dailyConversion.length - 2];
    const todayRate = today?.rate ?? 0;
    const yesterdayRate = yesterday?.rate ?? 0;
    const rateDiff = yesterdayRate > 0 ? todayRate - yesterdayRate : null;

    const withCohort = dailyConversion.filter((d) => d.leads > 0);
    const mean = (rows: typeof dailyConversion) =>
      rows.length > 0 ? rows.reduce((s, d) => s + d.rate, 0) / rows.length : 0;
    const avg7 = mean(withCohort.filter((d) => dailyConversion.slice(-7).includes(d)));
    const avg30 = mean(withCohort);

    const best = withCohort.reduce(
      (b, d) => (!b || d.rate > b.rate ? d : b),
      undefined as (typeof dailyConversion)[number] | undefined
    );

    return {
      conversionData: dailyConversion,
      aovData: dailyAov,
      stats: { todayRate, yesterdayRate, rateDiff, avg7, avg30, bestDate: best?.label ?? "—", bestRate: best?.rate ?? 0 },
    };
  }, [orders, leads]);

  const PctBadge = ({ diff }: { diff: number | null }) => {
    if (diff === null) return <span className="text-xs text-muted-foreground ml-2">N/A</span>;
    const isUp = diff > 0;
    const isFlat = Math.abs(diff) < 0.5;
    const Icon = isFlat ? Minus : isUp ? TrendingUp : TrendingDown;
    const color = isFlat ? "text-muted-foreground" : isUp ? "text-green-600" : "text-red-600";
    return (
      <span className={`inline-flex items-center gap-1 text-sm font-medium ml-2 ${color}`}>
        <Icon className="h-3.5 w-3.5" />
        {isFlat ? "Flat" : `${Math.abs(Math.round(diff * 10) / 10)}pp ${isUp ? "up" : "down"}`}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Conversion Rate */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-medium flex items-center justify-between">
            <span>Conversion Rate (Last {DAYS} Days)</span>
            <span className="text-xs font-normal text-muted-foreground">leads captured that day → ever purchased · PST</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Summary stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Today</p>
              <div className="flex items-baseline">
                <span className="text-xl font-bold">{stats.todayRate}%</span>
                <PctBadge diff={stats.rateDiff} />
              </div>
            </div>
            <div>
              <p className="text-muted-foreground">7-Day Avg</p>
              <span className="text-xl font-bold">{Math.round(stats.avg7 * 10) / 10}%</span>
            </div>
            <div>
              <p className="text-muted-foreground">{DAYS}-Day Avg</p>
              <span className="text-xl font-bold">{Math.round(stats.avg30 * 10) / 10}%</span>
            </div>
            <div>
              <p className="text-muted-foreground">Best Day</p>
              <span className="text-xl font-bold">{stats.bestRate}%</span>
              <span className="text-xs text-muted-foreground ml-1">{stats.bestDate}</span>
            </div>
          </div>

          {/* Chart */}
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={conversionData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload?.length) {
                      const d = payload[0].payload;
                      return (
                        <div className="bg-popover border rounded-lg p-3 shadow-lg">
                          <p className="text-sm font-medium">{d.label}</p>
                          <p className="text-sm text-primary font-bold">{d.rate}%</p>
                          <p className="text-xs text-muted-foreground">{d.orders} converted / {d.leads} leads captured</p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Line type="monotone" dataKey="rate" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* AOV Trend */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-medium flex items-center justify-between">
            <span>Average Order Value (Last {DAYS} Days)</span>
            <span className="text-xs font-normal text-muted-foreground">incl. upsells, excl. tips · PST</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={aovData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload?.length) {
                      const d = payload[0].payload;
                      return (
                        <div className="bg-popover border rounded-lg p-3 shadow-lg">
                          <p className="text-sm font-medium">{d.label}</p>
                          <p className="text-sm text-primary font-bold">${d.aov}</p>
                          <p className="text-xs text-muted-foreground">{d.orders} orders · ${d.revenue.toLocaleString()} revenue</p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Line type="monotone" dataKey="aov" stroke="hsl(var(--chart-2, var(--primary)))" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
