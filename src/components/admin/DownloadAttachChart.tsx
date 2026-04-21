import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { format, subDays, startOfDay, parseISO } from "date-fns";

interface Order {
  id: string;
  status: string;
  delivered_at?: string | null;
  download_unlocked_at?: string | null;
  download_price_cents?: number | null;
}

interface DownloadAttachChartProps {
  orders: Order[];
}

const DAYS = 30;

export function DownloadAttachChart({ orders }: DownloadAttachChartProps) {
  const { chartData, totals } = useMemo(() => {
    const days = Array.from({ length: DAYS }, (_, i) => {
      const date = startOfDay(subDays(new Date(), DAYS - 1 - i));
      return {
        date,
        name: format(date, "MMM d"),
        paid: 0,
        comped: 0,
        delivered: 0,
        revenue: 0,
        attachRate: 0,
      };
    });

    const findDay = (iso: string) => {
      const d = startOfDay(parseISO(iso)).getTime();
      return days.find((row) => row.date.getTime() === d);
    };

    let paidTotal = 0;
    let compedTotal = 0;
    let deliveredTotal = 0;
    let revenueTotal = 0;

    orders.forEach((o) => {
      if (o.status === "cancelled") return;

      // Bucket delivered orders (denominator for attach rate)
      if (o.delivered_at) {
        const day = findDay(o.delivered_at);
        if (day) {
          day.delivered += 1;
          deliveredTotal += 1;
        }
      }

      // Bucket downloads by unlock day
      if (o.download_unlocked_at) {
        const day = findDay(o.download_unlocked_at);
        const cents = o.download_price_cents ?? 0;
        if (cents > 0) {
          paidTotal += 1;
          revenueTotal += cents / 100;
          if (day) {
            day.paid += 1;
            day.revenue += cents / 100;
          }
        } else {
          compedTotal += 1;
          if (day) day.comped += 1;
        }
      }
    });

    days.forEach((d) => {
      d.attachRate =
        d.delivered > 0 ? Math.round((d.paid / d.delivered) * 1000) / 10 : 0;
      d.revenue = Math.round(d.revenue * 100) / 100;
    });

    const overallAttach =
      deliveredTotal > 0 ? Math.round((paidTotal / deliveredTotal) * 1000) / 10 : 0;

    return {
      chartData: days,
      totals: {
        paid: paidTotal,
        comped: compedTotal,
        delivered: deliveredTotal,
        revenue: revenueTotal,
        attachRate: overallAttach,
      },
    };
  }, [orders]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-medium">
          Download Upsell Performance ($19.99) — Last 30 Days
        </CardTitle>
        <p className="text-2xl font-bold">
          ${totals.revenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            · {totals.attachRate}% attach
          </span>
        </p>
        <p className="text-xs text-muted-foreground">
          {totals.paid} paid · {totals.comped} comped · {totals.delivered} delivered orders
        </p>
      </CardHeader>
      <CardContent>
        <div className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                yAxisId="left"
                tick={{ fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `${v}%`}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload || !payload.length) return null;
                  const row = payload[0]?.payload as (typeof chartData)[number];
                  return (
                    <div className="bg-popover border rounded-lg p-3 shadow-lg space-y-1">
                      <p className="text-sm font-medium">{label}</p>
                      <p className="text-xs" style={{ color: "hsl(210 80% 55%)" }}>
                        Paid: {row.paid} (${row.revenue.toLocaleString()})
                      </p>
                      <p className="text-xs" style={{ color: "hsl(280 30% 65%)" }}>
                        Comped: {row.comped}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Delivered orders: {row.delivered}
                      </p>
                      <p className="text-sm font-bold border-t pt-1 mt-1">
                        Attach rate: {row.attachRate}%
                      </p>
                    </div>
                  );
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
              <Bar
                yAxisId="left"
                dataKey="paid"
                name="Paid ($19.99)"
                stackId="dl"
                fill="hsl(210 80% 55%)"
                radius={[0, 0, 0, 0]}
              />
              <Bar
                yAxisId="left"
                dataKey="comped"
                name="Comped"
                stackId="dl"
                fill="hsl(280 30% 65%)"
                radius={[4, 4, 0, 0]}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="attachRate"
                name="Attach rate %"
                stroke="hsl(142 70% 40%)"
                strokeWidth={2}
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}