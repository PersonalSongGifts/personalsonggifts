import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Lightbulb, Search } from "lucide-react";

interface Order {
  id: string;
  customer_name: string;
  recipient_name: string;
  occasion: string;
  genre: string;
  singer_preference: string;
  special_qualities: string;
  favorite_memory: string;
  special_message?: string | null;
  created_at: string;
  price: number;
  status: string;
}

interface CustomOccasionInsightsProps {
  orders: Order[];
}

export function CustomOccasionInsights({ orders }: CustomOccasionInsightsProps) {
  const [search, setSearch] = useState("");

  const customOrders = useMemo(() => {
    return orders
      .filter((o) => o.occasion?.toLowerCase() === "custom" && o.status !== "cancelled")
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [orders]);

  const filtered = useMemo(() => {
    if (!search.trim()) return customOrders;
    const q = search.toLowerCase();
    return customOrders.filter(
      (o) =>
        o.special_qualities?.toLowerCase().includes(q) ||
        o.favorite_memory?.toLowerCase().includes(q) ||
        o.special_message?.toLowerCase().includes(q) ||
        o.customer_name?.toLowerCase().includes(q) ||
        o.recipient_name?.toLowerCase().includes(q)
    );
  }, [customOrders, search]);

  // Genre breakdown for custom orders
  const genreBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    customOrders.forEach((o) => {
      const g = o.genre || "Unknown";
      counts[g] = (counts[g] || 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
  }, [customOrders]);

  if (customOrders.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-primary" />
            Custom Occasion Insights
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">No custom occasion orders yet.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-primary" />
              Custom Occasion Insights
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-0.5">
              {customOrders.length} orders with "Custom" occasion — what are people really celebrating?
            </p>
          </div>
          {/* Genre breakdown badges */}
          <div className="flex flex-wrap gap-1.5">
            {genreBreakdown.map(([genre, count]) => (
              <Badge key={genre} variant="secondary" className="text-xs">
                {genre} ×{count}
              </Badge>
            ))}
          </div>
        </div>

        {/* Search */}
        <div className="relative mt-3">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search what people wrote…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {/* Scrollable list */}
        <div className="overflow-y-auto max-h-[520px] divide-y divide-border">
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No results</p>
          ) : (
            filtered.map((order) => (
              <div key={order.id} className="px-6 py-4 hover:bg-muted/30 transition-colors">
                <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{order.customer_name}</span>
                    <span className="text-xs text-muted-foreground">→ {order.recipient_name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">{order.genre}</Badge>
                    <Badge variant="outline" className="text-xs capitalize">{order.singer_preference}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {new Date(order.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </span>
                  </div>
                </div>

                {order.special_qualities && (
                  <div className="mb-1.5">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">What makes them special</span>
                    <p className="text-sm mt-0.5 leading-relaxed">{order.special_qualities}</p>
                  </div>
                )}

                {order.favorite_memory && (
                  <div className="mb-1.5">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Favorite memory</span>
                    <p className="text-sm mt-0.5 leading-relaxed text-muted-foreground">{order.favorite_memory}</p>
                  </div>
                )}

                {order.special_message && (
                  <div>
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Special message</span>
                    <p className="text-sm mt-0.5 leading-relaxed italic text-muted-foreground">{order.special_message}</p>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
        {filtered.length > 0 && (
          <div className="px-6 py-2 border-t text-xs text-muted-foreground">
            Showing {filtered.length} of {customOrders.length} custom occasion orders
          </div>
        )}
      </CardContent>
    </Card>
  );
}
