import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Loader2, RefreshCw, CheckCircle2, XCircle, Mail } from "lucide-react";
import { formatAdminDate, formatAdminDateShort } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface Order {
  id: string;
  customer_name: string;
  recipient_name: string;
  sent_at: string | null;
  status: string;
  delivery_status: string | null;
  song_played_at: string | null;
  song_play_count: number | null;
  unplayed_resend_sent_at?: string | null;
  dismissed_at: string | null;
}

interface Props {
  adminPassword: string;
  allOrders: Order[];
}

export function UnplayedResendPanel({ adminPassword, allOrders }: Props) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const { toast } = useToast();

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

  const fetchSetting = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/automation-get-settings`, {
        method: "GET",
        headers: { "x-admin-password": adminPassword },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      // Default to enabled (true) if not set yet
      setEnabled(data.unplayed_resend_enabled !== "false");
    } catch (err) {
      console.error("Failed to fetch unplayed resend setting:", err);
      setEnabled(true); // safe default
    } finally {
      setLoading(false);
    }
  }, [adminPassword, supabaseUrl]);

  useEffect(() => {
    fetchSetting();
  }, [fetchSetting]);

  const handleToggle = async (newValue: boolean) => {
    setToggling(true);
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/automation-get-settings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-password": adminPassword,
        },
        body: JSON.stringify({
          key: "unplayed_resend_enabled",
          value: newValue ? "true" : "false",
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setEnabled(newValue);
      toast({
        title: newValue ? "Re-send Enabled" : "Re-send Paused",
        description: newValue
          ? "Unplayed song re-sends will fire automatically."
          : "No more re-sends will go out until re-enabled.",
      });
    } catch (err) {
      toast({ title: "Failed to update", description: String(err), variant: "destructive" });
    } finally {
      setToggling(false);
    }
  };

  // Compute stats from allOrders (client-side, no extra API calls)
  const resendsSent = allOrders.filter((o) => o.unplayed_resend_sent_at);

  const playedAfterResend = resendsSent.filter(
    (o) =>
      o.song_played_at &&
      o.unplayed_resend_sent_at &&
      new Date(o.song_played_at) > new Date(o.unplayed_resend_sent_at)
  );

  const now = Date.now();
  const eligible = allOrders.filter(
    (o) =>
      o.status === "delivered" &&
      o.delivery_status === "sent" &&
      !o.song_played_at &&
      !o.unplayed_resend_sent_at &&
      !o.dismissed_at &&
      o.sent_at &&
      new Date(o.sent_at).getTime() < now - 24 * 60 * 60 * 1000
  );

  const recoveryRate =
    resendsSent.length > 0
      ? Math.round((playedAfterResend.length / resendsSent.length) * 100)
      : 0;

  // Sort resends by most recent first
  const sortedResends = [...resendsSent].sort((a, b) => {
    const aTime = a.unplayed_resend_sent_at ? new Date(a.unplayed_resend_sent_at).getTime() : 0;
    const bTime = b.unplayed_resend_sent_at ? new Date(b.unplayed_resend_sent_at).getTime() : 0;
    return bTime - aTime;
  });

  const isEnabled = enabled === true;

  return (
    <Card className="border border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Unplayed Song Re-send</CardTitle>
          </div>
          <div className="flex items-center gap-3">
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <Switch
                    id="resend-toggle"
                    checked={isEnabled}
                    onCheckedChange={handleToggle}
                    disabled={toggling}
                  />
                  <Label htmlFor="resend-toggle" className="text-sm cursor-pointer">
                    {toggling ? (
                      <Loader2 className="h-3 w-3 animate-spin inline" />
                    ) : isEnabled ? (
                      "Enabled"
                    ) : (
                      "Paused"
                    )}
                  </Label>
                </div>
                <Badge
                  className={
                    isEnabled
                      ? "bg-green-600 text-white border-0"
                      : "bg-yellow-100 text-yellow-800 border-yellow-300"
                  }
                >
                  {isEnabled ? "Active" : "Paused"}
                </Badge>
              </>
            )}
            <Button variant="ghost" size="sm" onClick={fetchSetting} disabled={loading}>
              <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Automatically emails customers whose song was delivered 24h+ ago but never played. Fires at most once per order.
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Stats Row */}
        <div className="grid grid-cols-4 gap-3">
          <div className="rounded-lg border bg-muted/30 p-3 text-center">
            <div className="text-2xl font-bold text-foreground">{eligible.length}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Eligible Now</div>
          </div>
          <div className="rounded-lg border bg-muted/30 p-3 text-center">
            <div className="text-2xl font-bold text-foreground">{resendsSent.length}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Re-sends Sent</div>
          </div>
          <div className="rounded-lg border bg-muted/30 p-3 text-center">
            <div className="text-2xl font-bold text-green-600">{playedAfterResend.length}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Played After</div>
          </div>
          <div className="rounded-lg border bg-muted/30 p-3 text-center">
            <div className="text-2xl font-bold text-foreground">
              {resendsSent.length > 0 ? `${recoveryRate}%` : "—"}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">Recovery Rate</div>
          </div>
        </div>

        {/* Re-send List */}
        {sortedResends.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            No re-sends have gone out yet.
            {eligible.length > 0 && (
              <p className="mt-1 text-xs">
                {eligible.length} order{eligible.length !== 1 ? "s are" : " is"} eligible and will be picked up on the next cron run.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Re-send History ({sortedResends.length})
            </h4>
            <ScrollArea className="h-64 rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Customer</TableHead>
                    <TableHead className="text-xs">Recipient</TableHead>
                    <TableHead className="text-xs">Re-sent At</TableHead>
                    <TableHead className="text-xs">Played After?</TableHead>
                    <TableHead className="text-xs">Plays</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedResends.map((order) => {
                    const playedAfter =
                      order.song_played_at &&
                      order.unplayed_resend_sent_at &&
                      new Date(order.song_played_at) > new Date(order.unplayed_resend_sent_at);

                    return (
                      <TableRow key={order.id}>
                        <TableCell className="text-xs font-medium py-2">
                          {order.customer_name}
                        </TableCell>
                        <TableCell className="text-xs py-2 text-muted-foreground">
                          {order.recipient_name}
                        </TableCell>
                        <TableCell className="text-xs py-2 text-muted-foreground">
                          {order.unplayed_resend_sent_at
                            ? formatAdminDateShort(order.unplayed_resend_sent_at)
                            : "—"}
                        </TableCell>
                        <TableCell className="py-2">
                          {order.song_played_at ? (
                            <div className="flex items-center gap-1">
                              {playedAfter ? (
                                <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                              ) : (
                                <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground" />
                              )}
                              <span className={`text-xs ${playedAfter ? "text-green-600" : "text-muted-foreground"}`}>
                                {playedAfter ? "Yes ✓" : "Before re-send"}
                              </span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1">
                              <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="text-xs text-muted-foreground">Not yet</span>
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="py-2">
                          {order.song_play_count && order.song_play_count > 0 ? (
                            <Badge variant="outline" className="text-xs px-1.5 py-0">
                              {order.song_play_count}x
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </ScrollArea>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
