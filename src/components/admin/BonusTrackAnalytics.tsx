import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Music, Unlock, DollarSign, TrendingUp } from "lucide-react";

interface Order {
  bonus_song_url?: string | null;
  bonus_preview_url?: string | null;
  bonus_unlocked_at?: string | null;
  bonus_price_cents?: number | null;
  bonus_automation_status?: string | null;
  customer_email?: string;
  id: string;
  created_at: string;
}

interface BonusTrackAnalyticsProps {
  orders: Order[];
}

export function BonusTrackAnalytics({ orders }: BonusTrackAnalyticsProps) {
  const generated = orders.filter(
    (o) => o.bonus_song_url || o.bonus_preview_url || o.bonus_automation_status === "completed"
  );
  const unlocked = orders.filter((o) => o.bonus_unlocked_at);
  const unlockRate = generated.length > 0
    ? ((unlocked.length / generated.length) * 100).toFixed(1)
    : "0";
  const totalRevenue = unlocked.reduce(
    (sum, o) => sum + (o.bonus_price_cents || 0),
    0
  );

  const recentUnlocks = [...unlocked]
    .sort((a, b) => new Date(b.bonus_unlocked_at!).getTime() - new Date(a.bonus_unlocked_at!).getTime())
    .slice(0, 8);

  const inProgress = orders.filter(
    (o) => o.bonus_automation_status && !["completed", "failed", "permanently_failed"].includes(o.bonus_automation_status)
  );
  const failed = orders.filter(
    (o) => o.bonus_automation_status === "failed" || o.bonus_automation_status === "permanently_failed"
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Music className="h-4 w-4" />
          Bonus Track Analytics
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Key Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="p-3 bg-muted/50 rounded-lg text-center">
            <p className="text-2xl font-bold">{generated.length}</p>
            <p className="text-xs text-muted-foreground">Generated</p>
          </div>
          <div className="p-3 bg-muted/50 rounded-lg text-center">
            <p className="text-2xl font-bold">{unlocked.length}</p>
            <p className="text-xs text-muted-foreground">Unlocked</p>
          </div>
          <div className="p-3 bg-muted/50 rounded-lg text-center">
            <p className="text-2xl font-bold flex items-center justify-center gap-1">
              <TrendingUp className="h-4 w-4" />
              {unlockRate}%
            </p>
            <p className="text-xs text-muted-foreground">Unlock Rate</p>
          </div>
          <div className="p-3 bg-muted/50 rounded-lg text-center">
            <p className="text-2xl font-bold flex items-center justify-center gap-1">
              <DollarSign className="h-4 w-4" />
              {(totalRevenue / 100).toFixed(2)}
            </p>
            <p className="text-xs text-muted-foreground">Revenue</p>
          </div>
        </div>

        {/* Pipeline Status */}
        {(inProgress.length > 0 || failed.length > 0) && (
          <div className="flex items-center gap-3 text-sm">
            {inProgress.length > 0 && (
              <Badge variant="secondary">{inProgress.length} in progress</Badge>
            )}
            {failed.length > 0 && (
              <Badge variant="destructive">{failed.length} failed</Badge>
            )}
          </div>
        )}

        {/* Recent Unlocks */}
        {recentUnlocks.length > 0 && (
          <div>
            <h4 className="text-sm font-medium mb-2">Recent Unlocks</h4>
            <div className="space-y-1.5">
              {recentUnlocks.map((o) => (
                <div key={o.id} className="flex items-center justify-between text-sm py-1 border-b border-border/50 last:border-0">
                  <div className="flex items-center gap-2">
                    <Unlock className="h-3 w-3 text-green-500" />
                    <span className="font-mono text-xs">{o.id.substring(0, 8).toUpperCase()}</span>
                    <span className="text-muted-foreground truncate max-w-[180px]">{o.customer_email}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">
                      ${((o.bonus_price_cents || 0) / 100).toFixed(2)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(o.bonus_unlocked_at!).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {generated.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No bonus tracks generated yet.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
