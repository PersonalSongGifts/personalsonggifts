import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";

interface Order {
  id: string;
  genre: string;
}

interface GenreChartProps {
  orders: Order[];
}

const GENRE_COLORS: Record<string, string> = {
  "Pop": "#EC4899",
  "Country": "#F59E0B",
  "Rock": "#EF4444",
  "R&B": "#8B5CF6",
  "Jazz": "#6366F1",
  "Acoustic": "#10B981",
  "Rap/Hip-Hop": "#F97316",
  "Indie": "#14B8A6",
  "Latin": "#E11D48",
  "K-Pop": "#A855F7",
  "EDM/Dance": "#06B6D4",
};

const DEFAULT_COLORS = [
  "#8B5CF6",
  "#EC4899", 
  "#F59E0B",
  "#10B981",
  "#3B82F6",
  "#EF4444",
  "#6366F1",
  "#14B8A6",
];

export function GenreChart({ orders }: GenreChartProps) {
  const chartData = useMemo(() => {
    const genreCounts: Record<string, number> = {};
    
    orders.forEach((order) => {
      const genre = order.genre || "Other";
      genreCounts[genre] = (genreCounts[genre] || 0) + 1;
    });

    return Object.entries(genreCounts)
      .map(([name, count]) => ({ 
        name, 
        count,
        color: GENRE_COLORS[name] || DEFAULT_COLORS[Object.keys(genreCounts).indexOf(name) % DEFAULT_COLORS.length]
      }))
      .sort((a, b) => b.count - a.count);
  }, [orders]);

  const topGenre = chartData.length > 0 ? chartData[0].name : "N/A";

  if (chartData.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-medium">Genre Popularity</CardTitle>
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
        <CardTitle className="text-base font-medium">Genre Popularity</CardTitle>
        <p className="text-sm text-muted-foreground">
          Top genre: <span className="font-medium text-foreground">{topGenre}</span>
        </p>
      </CardHeader>
      <CardContent>
        <div className="h-[250px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
              <XAxis 
                dataKey="name" 
                tick={{ fontSize: 11 }} 
                tickLine={false} 
                axisLine={false}
                angle={-45}
                textAnchor="end"
                height={60}
                interval={0}
              />
              <YAxis 
                tick={{ fontSize: 12 }} 
                tickLine={false} 
                axisLine={false}
                allowDecimals={false}
              />
              <Tooltip 
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const total = orders.length;
                    const count = payload[0].value as number;
                    const percentage = total > 0 ? Math.round((count / total) * 100) : 0;
                    return (
                      <div className="bg-popover border rounded-lg p-3 shadow-lg">
                        <p className="text-sm font-medium">{payload[0].payload.name}</p>
                        <p className="text-sm font-bold">
                          {count} order{count !== 1 ? "s" : ""} ({percentage}%)
                        </p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
