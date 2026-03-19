import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Line, ComposedChart } from "recharts";
import { format, startOfDay, parseISO, eachDayOfInterval, min, max } from "date-fns";

interface Order {
  id: string;
  price: number;
  status: string;
  created_at: string;
}

interface AOVChartProps {
  orders: Order[];
}

export function AOVChart({ orders }: AOVChartProps) {
  const chartData = useMemo(() => {
    const activeOrders = orders.filter((o) => o.status !== "cancelled");
    if (activeOrders.length === 0) return [];

    const dates = activeOrders.map((o) => startOfDay(parseISO(o.created_at)));
    const interval = { start: min(dates), end: max(dates) };
    const allDays = eachDayOfInterval(interval);

    // Group by day
    const dayMap = new Map<number, { revenue: number; count: number }>();
    activeOrders.forEach((o) => {
      const key = startOfDay(parseISO(o.created_at)).getTime();
      const existing = dayMap.get(key) || { revenue: 0, count: 0 };
      existing.revenue += o.price;
      existing.count += 1;
      dayMap.set(key, existing);
    });

    const raw = allDays.map((date) => {
      const d = dayMap.get(date.getTime());
      return {
        name: format(date, "MMM d"),
        aov: d && d.count > 0 ? Math.round((d.revenue / d.count) * 100) / 100 : null,
        revenue: d?.revenue ?? 0,
        orders: d?.count ?? 0,
      };
    });

    // Rolling 7-day average
    return raw.map((item, i) => {
      const window = raw.slice(Math.max(0, i - 6), i + 1);
      const withOrders = window.filter((w) => w.orders > 0);
      const totalRev = withOrders.reduce((s, w) => s + w.revenue, 0);
      const totalOrd = withOrders.reduce((s, w) => s + w.orders, 0);
      return {
        ...item,
        aov7d: totalOrd > 0 ? Math.round((totalRev / totalOrd) * 100) / 100 : null,
      };
    });
  }, [orders]);

  const overallAOV = useMemo(() => {
    const active = orders.filter((o) => o.status !== "cancelled");
    if (active.length === 0) return 0;
    return Math.round((active.reduce((s, o) => s + o.price, 0) / active.length) * 100) / 100;
  }, [orders]);

  if (chartData.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-medium">AOV Trend</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-[250px]">
          <p className="text-muted-foreground">No data available</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-medium">AOV Trend</CardTitle>
        <p className="text-2xl font-bold">${overallAOV.toFixed(2)}</p>
        <p className="text-sm text-muted-foreground">Average order value</p>
      </CardHeader>
      <CardContent>
        <div className="h-[250px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData}>
              <defs>
                <linearGradient id="aovGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `$${v}`}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const d = payload[0].payload;
                    return (
                      <div className="bg-popover border rounded-lg p-3 shadow-lg">
                        <p className="text-sm font-medium">{d.name}</p>
                        <p className="text-sm text-primary font-bold">
                          AOV: ${d.aov?.toFixed(2) ?? "—"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          7-day avg: ${d.aov7d?.toFixed(2) ?? "—"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {d.orders} order{d.orders !== 1 ? "s" : ""} · ${d.revenue.toLocaleString()}
                        </p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Area
                type="monotone"
                dataKey="aov"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                fill="url(#aovGradient)"
                connectNulls
              />
              <Line
                type="monotone"
                dataKey="aov7d"
                stroke="hsl(var(--accent-foreground))"
                strokeWidth={2}
                strokeDasharray="5 5"
                dot={false}
                connectNulls
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
