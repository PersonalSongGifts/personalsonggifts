import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { format, subDays, startOfDay, parseISO } from "date-fns";

interface Order {
  id: string;
  price: number;
  status: string;
  created_at: string;
}

interface RevenueChartProps {
  orders: Order[];
}

export function RevenueChart({ orders }: RevenueChartProps) {
  const chartData = useMemo(() => {
    const last30Days = Array.from({ length: 30 }, (_, i) => {
      const date = startOfDay(subDays(new Date(), 29 - i));
      return {
        date,
        dateStr: format(date, "MMM d"),
        revenue: 0,
        orders: 0,
      };
    });

    orders.forEach((order) => {
      if (order.status === "cancelled") return;
      
      const orderDate = startOfDay(parseISO(order.created_at));
      const dayData = last30Days.find(
        (d) => d.date.getTime() === orderDate.getTime()
      );
      
      if (dayData) {
        dayData.revenue += order.price;
        dayData.orders += 1;
      }
    });

    return last30Days.map(({ dateStr, revenue, orders }) => ({
      name: dateStr,
      revenue,
      orders,
    }));
  }, [orders]);

  const totalRevenue = chartData.reduce((sum, day) => sum + day.revenue, 0);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-medium">
          Revenue (Last 30 Days)
        </CardTitle>
        <p className="text-2xl font-bold">${totalRevenue.toLocaleString()}</p>
      </CardHeader>
      <CardContent>
        <div className="h-[250px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
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
                tickFormatter={(value) => `$${value}`}
              />
              <Tooltip 
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    return (
                      <div className="bg-popover border rounded-lg p-3 shadow-lg">
                        <p className="text-sm font-medium">{payload[0].payload.name}</p>
                        <p className="text-sm text-primary font-bold">
                          ${payload[0].value?.toLocaleString()}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {payload[0].payload.orders} order(s)
                        </p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Area
                type="monotone"
                dataKey="revenue"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                fill="url(#revenueGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
