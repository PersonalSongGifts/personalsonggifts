import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { toZonedTime } from "date-fns-tz";
import { startOfDay, differenceInCalendarDays } from "date-fns";

const TZ = "America/Los_Angeles";
const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface Order {
  id: string;
  price: number;
  status: string;
  created_at: string;
}

interface SalesHeatmapProps {
  orders: Order[];
}

export function SalesHeatmap({ orders }: SalesHeatmapProps) {
  const { dayData, hourData } = useMemo(() => {
    const active = orders.filter((o) => o.status !== "cancelled");

    // Day of week: count orders per JS day (0=Sun..6=Sat) and track unique dates
    const dayBuckets: Record<number, number> = {};
    const dayDates: Record<number, Set<string>> = {};
    // Hour of day: count orders per hour 0-23
    const hourBuckets: Record<number, number> = {};

    for (let d = 0; d < 7; d++) {
      dayBuckets[d] = 0;
      dayDates[d] = new Set();
    }
    for (let h = 0; h < 24; h++) {
      hourBuckets[h] = 0;
    }

    for (const order of active) {
      const pst = toZonedTime(new Date(order.created_at), TZ);
      const jsDay = pst.getDay(); // 0=Sun
      const hour = pst.getHours();
      const dateKey = startOfDay(pst).toISOString();

      dayBuckets[jsDay]++;
      dayDates[jsDay].add(dateKey);
      hourBuckets[hour]++;
    }

    // Convert JS day (0=Sun) to Mon-first order
    const jsDayToIndex = [6, 0, 1, 2, 3, 4, 5]; // Sun→6, Mon→0, etc.

    const dayData = DAY_NAMES.map((name, i) => {
      // Find the JS day number for this index
      const jsDay = [1, 2, 3, 4, 5, 6, 0][i]; // Mon=1, Tue=2, ..., Sun=0
      const count = dayBuckets[jsDay];
      const numDays = dayDates[jsDay].size || 1;
      const avg = Math.round((count / numDays) * 10) / 10;
      return { name, avg, total: count, numDays };
    });

    // Find max average for highlighting
    const maxAvg = Math.max(...dayData.map((d) => d.avg));

    const hourData = Array.from({ length: 24 }, (_, h) => {
      const ampm = h === 0 ? "12a" : h < 12 ? `${h}a` : h === 12 ? "12p" : `${h - 12}p`;
      return { name: ampm, orders: hourBuckets[h], hour: h };
    });

    const maxHour = Math.max(...hourData.map((d) => d.orders));

    return {
      dayData: dayData.map((d) => ({ ...d, isMax: d.avg === maxAvg && maxAvg > 0 })),
      hourData: hourData.map((d) => ({ ...d, isMax: d.orders === maxHour && maxHour > 0 })),
    };
  }, [orders]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Day of Week */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-medium">Avg Orders by Day of Week</CardTitle>
          <p className="text-xs text-muted-foreground">PST · excludes cancelled</p>
        </CardHeader>
        <CardContent>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dayData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload?.[0]) {
                      const d = payload[0].payload;
                      return (
                        <div className="bg-popover border rounded-lg p-3 shadow-lg text-sm">
                          <p className="font-medium">{d.name}</p>
                          <p className="text-primary font-bold">{d.avg} avg orders/day</p>
                          <p className="text-xs text-muted-foreground">
                            {d.total} total across {d.numDays} {d.name}s
                          </p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar dataKey="avg" radius={[4, 4, 0, 0]}>
                  {dayData.map((entry, index) => (
                    <Cell
                      key={index}
                      fill={entry.isMax ? "hsl(var(--primary))" : "hsl(var(--primary) / 0.5)"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Hour of Day */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-medium">Orders by Hour of Day</CardTitle>
          <p className="text-xs text-muted-foreground">PST · excludes cancelled</p>
        </CardHeader>
        <CardContent>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hourData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  interval={1}
                />
                <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload?.[0]) {
                      const d = payload[0].payload;
                      const label =
                        d.hour === 0
                          ? "12:00 AM"
                          : d.hour < 12
                            ? `${d.hour}:00 AM`
                            : d.hour === 12
                              ? "12:00 PM"
                              : `${d.hour - 12}:00 PM`;
                      return (
                        <div className="bg-popover border rounded-lg p-3 shadow-lg text-sm">
                          <p className="font-medium">{label} PST</p>
                          <p className="text-primary font-bold">{d.orders} orders</p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar dataKey="orders" radius={[3, 3, 0, 0]}>
                  {hourData.map((entry, index) => (
                    <Cell
                      key={index}
                      fill={entry.isMax ? "hsl(var(--primary))" : "hsl(var(--primary) / 0.5)"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
