import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { format, subDays, startOfDay, parseISO } from "date-fns";

interface Order {
  id: string;
  status: string;
  lyrics_unlocked_at?: string | null;
  lyrics_price_cents?: number | null;
  download_unlocked_at?: string | null;
  download_price_cents?: number | null;
  bonus_unlocked_at?: string | null;
  bonus_price_cents?: number | null;
}

interface UpsellRevenueChartProps {
  orders: Order[];
}

export function UpsellRevenueChart({ orders }: UpsellRevenueChartProps) {
  const { chartData, totals } = useMemo(() => {
    const last30Days = Array.from({ length: 30 }, (_, i) => {
      const date = startOfDay(subDays(new Date(), 29 - i));
      return {
        date,
        name: format(date, "MMM d"),
        lyrics: 0,
        downloads: 0,
        bonus: 0,
      };
    });

    let lyricsCount = 0;
    let downloadsCount = 0;
    let bonusCount = 0;
    let lyricsRev = 0;
    let downloadsRev = 0;
    let bonusRev = 0;

    const findDay = (iso: string) => {
      const d = startOfDay(parseISO(iso));
      return last30Days.find((row) => row.date.getTime() === d.getTime());
    };

    orders.forEach((o) => {
      if (o.status === "cancelled") return;

      if (o.lyrics_unlocked_at && (o.lyrics_price_cents ?? 0) > 0) {
        const dollars = (o.lyrics_price_cents ?? 0) / 100;
        lyricsRev += dollars;
        lyricsCount += 1;
        const day = findDay(o.lyrics_unlocked_at);
        if (day) day.lyrics += dollars;
      }
      if (o.download_unlocked_at && (o.download_price_cents ?? 0) > 0) {
        const dollars = (o.download_price_cents ?? 0) / 100;
        downloadsRev += dollars;
        downloadsCount += 1;
        const day = findDay(o.download_unlocked_at);
        if (day) day.downloads += dollars;
      }
      if (o.bonus_unlocked_at && (o.bonus_price_cents ?? 0) > 0) {
        const dollars = (o.bonus_price_cents ?? 0) / 100;
        bonusRev += dollars;
        bonusCount += 1;
        const day = findDay(o.bonus_unlocked_at);
        if (day) day.bonus += dollars;
      }
    });

    return {
      chartData: last30Days.map(({ name, lyrics, downloads, bonus }) => ({
        name,
        lyrics: Math.round(lyrics * 100) / 100,
        downloads: Math.round(downloads * 100) / 100,
        bonus: Math.round(bonus * 100) / 100,
      })),
      totals: {
        lyricsRev,
        downloadsRev,
        bonusRev,
        total: lyricsRev + downloadsRev + bonusRev,
        lyricsCount,
        downloadsCount,
        bonusCount,
      },
    };
  }, [orders]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-medium">
          Upsell Revenue (Last 30 Days)
        </CardTitle>
        <p className="text-2xl font-bold">${totals.total.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
        <p className="text-xs text-muted-foreground">
          {totals.lyricsCount} lyrics · {totals.downloadsCount} downloads · {totals.bonusCount} bonus
        </p>
      </CardHeader>
      <CardContent>
        <div className="h-[250px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="lyricsGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(280 70% 55%)" stopOpacity={0.5} />
                  <stop offset="95%" stopColor="hsl(280 70% 55%)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="downloadsGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(210 80% 55%)" stopOpacity={0.5} />
                  <stop offset="95%" stopColor="hsl(210 80% 55%)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="bonusGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(42 90% 55%)" stopOpacity={0.5} />
                  <stop offset="95%" stopColor="hsl(42 90% 55%)" stopOpacity={0} />
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
                content={({ active, payload, label }) => {
                  if (active && payload && payload.length) {
                    const total = payload.reduce((s, p) => s + (Number(p.value) || 0), 0);
                    return (
                      <div className="bg-popover border rounded-lg p-3 shadow-lg space-y-1">
                        <p className="text-sm font-medium">{label}</p>
                        {payload.map((p) => (
                          <p key={p.dataKey as string} className="text-xs" style={{ color: p.color as string }}>
                            {p.name}: ${Number(p.value).toLocaleString()}
                          </p>
                        ))}
                        <p className="text-sm font-bold border-t pt-1 mt-1">
                          Total: ${total.toLocaleString()}
                        </p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
              <Area
                type="monotone"
                dataKey="lyrics"
                name="Lyrics"
                stackId="1"
                stroke="hsl(280 70% 55%)"
                strokeWidth={2}
                fill="url(#lyricsGradient)"
              />
              <Area
                type="monotone"
                dataKey="downloads"
                name="Downloads"
                stackId="1"
                stroke="hsl(210 80% 55%)"
                strokeWidth={2}
                fill="url(#downloadsGradient)"
              />
              <Area
                type="monotone"
                dataKey="bonus"
                name="Bonus"
                stackId="1"
                stroke="hsl(42 90% 55%)"
                strokeWidth={2}
                fill="url(#bonusGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}