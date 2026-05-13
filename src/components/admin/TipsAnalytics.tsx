import { useCallback, useEffect, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Heart, Loader2, Download, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Tipper {
  id: string;
  paidAt: string;
  customerName: string;
  customerEmail: string;
  shortOrderId: string;
  orderId: string;
  occasion: string;
  pricingTier: string;
  recipientName: string;
  amountCents: number;
  refundable: boolean;
}

interface Stats {
  totals: {
    count: number;
    sumCents: number;
    avgCents: number;
    deliveriesInWindow: number;
    tipsPerDelivery: number;
  };
  daily: { date: string; cents: number; count: number }[];
  byOccasion: { occasion: string; deliveries: number; tips: number; tipsPerDelivery: number; avgCents: number; sumCents: number }[];
  byPricingTier: { pricingTier: string; deliveries: number; tips: number; tipsPerDelivery: number; avgCents: number; sumCents: number }[];
  tippers: Tipper[];
  tippersTotal: number;
}

interface Props {
  adminPassword: string;
}

const fmtUSD = (cents: number) =>
  `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`;
const fmtPstDateTime = (iso: string) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit",
  }).format(new Date(iso));

export function TipsAnalytics({ adminPassword }: Props) {
  const [windowDays, setWindowDays] = useState<number | null>(30);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [tippersOffset, setTippersOffset] = useState(0);
  const [allTippers, setAllTippers] = useState<Tipper[]>([]);
  const [confirmRefund, setConfirmRefund] = useState<Tipper | null>(null);
  const [refunding, setRefunding] = useState(false);
  const [exporting, setExporting] = useState(false);
  const { toast } = useToast();
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

  const call = useCallback(
    async (body: object) => {
      const res = await fetch(`${supabaseUrl}/functions/v1/admin-tips-stats`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-password": adminPassword },
        body: JSON.stringify(body),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      return j as Stats;
    },
    [adminPassword, supabaseUrl],
  );

  const load = useCallback(async () => {
    if (!adminPassword) return;
    setLoading(true);
    try {
      const data = await call({ windowDays, tippersLimit: 100, tippersOffset: 0 });
      setStats(data);
      setAllTippers(data.tippers);
      setTippersOffset(data.tippers.length);
    } catch (e) {
      toast({ title: "Failed to load tips", description: String(e), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [adminPassword, call, toast, windowDays]);

  useEffect(() => { load(); }, [load]);

  const loadMore = async () => {
    setLoading(true);
    try {
      const data = await call({ windowDays, tippersLimit: 100, tippersOffset });
      setAllTippers((prev) => [...prev, ...data.tippers]);
      setTippersOffset((prev) => prev + data.tippers.length);
    } catch (e) {
      toast({ title: "Failed to load more", description: String(e), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/admin-tips-stats`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-password": adminPassword },
        body: JSON.stringify({ windowDays, format: "csv" }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `tips-${windowDays ?? "all"}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast({ title: "Export failed", description: String(e), variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  const doRefund = async () => {
    if (!confirmRefund) return;
    setRefunding(true);
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/admin-refund-tip`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-password": adminPassword },
        body: JSON.stringify({ tipId: confirmRefund.id }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      toast({ title: "Refund issued", description: `Tip ${confirmRefund.shortOrderId} refunded.` });
      setConfirmRefund(null);
      load();
    } catch (e) {
      toast({ title: "Refund failed", description: String(e), variant: "destructive" });
    } finally {
      setRefunding(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Heart className="h-5 w-5 text-primary fill-primary/20" />
          <CardTitle>Tips</CardTitle>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={String(windowDays ?? "all")}
            onValueChange={(v) => setWindowDays(v === "all" ? null : Number(v))}
          >
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
              <SelectItem value="all">All time</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={load} disabled={loading} title="Refresh">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button variant="outline" onClick={exportCsv} disabled={exporting || !stats}>
            {exporting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />}
            Export CSV
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {!stats && loading ? (
          <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
        ) : stats ? (
          <>
            {/* Top stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat label="Tips collected" value={fmtUSD(stats.totals.sumCents)} />
              <Stat label="Number of tips" value={String(stats.totals.count)} />
              <Stat label="Average tip" value={fmtUSD(stats.totals.avgCents)} />
              <Stat
                label="Tips per delivery"
                value={fmtPct(stats.totals.tipsPerDelivery)}
                hint={`${stats.totals.count} tips ÷ ${stats.totals.deliveriesInWindow} deliveries`}
              />
            </div>

            {/* Daily trend */}
            <div>
              <h4 className="text-sm font-semibold text-muted-foreground mb-2">Daily tip revenue (PST)</h4>
              <div className="h-56 w-full">
                <ResponsiveContainer>
                  <LineChart data={stats.daily}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis dataKey="date" fontSize={11} />
                    <YAxis tickFormatter={(v) => `$${(v / 100).toFixed(0)}`} fontSize={11} />
                    <Tooltip
                      formatter={(value: number) => fmtUSD(value)}
                      labelFormatter={(l) => `Date: ${l}`}
                    />
                    <Line type="monotone" dataKey="cents" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Breakdowns */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <BreakdownTable
                title="Tips per delivery — by occasion"
                rows={stats.byOccasion.map((r) => ({
                  label: r.occasion, deliveries: r.deliveries, tips: r.tips,
                  tipsPerDelivery: r.tipsPerDelivery, avgCents: r.avgCents,
                }))}
              />
              <BreakdownTable
                title="Tips per delivery — by pricing tier"
                rows={stats.byPricingTier.map((r) => ({
                  label: r.pricingTier, deliveries: r.deliveries, tips: r.tips,
                  tipsPerDelivery: r.tipsPerDelivery, avgCents: r.avgCents,
                }))}
              />
            </div>

            {/* Recent tippers */}
            <div>
              <h4 className="text-sm font-semibold text-muted-foreground mb-2">
                Recent tippers ({allTippers.length} of {stats.tippersTotal})
              </h4>
              <div className="border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date (PST)</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Order</TableHead>
                      <TableHead>Occasion</TableHead>
                      <TableHead>Recipient</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-right">Refund</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allTippers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center text-muted-foreground py-6">
                          No tips in this window.
                        </TableCell>
                      </TableRow>
                    ) : allTippers.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell className="whitespace-nowrap">{fmtPstDateTime(t.paidAt)}</TableCell>
                        <TableCell>{t.customerName || "—"}</TableCell>
                        <TableCell className="text-xs">{t.customerEmail || "—"}</TableCell>
                        <TableCell className="font-mono text-xs">{t.shortOrderId}</TableCell>
                        <TableCell>{t.occasion}</TableCell>
                        <TableCell>{t.recipientName || "—"}</TableCell>
                        <TableCell className="text-right font-medium">{fmtUSD(t.amountCents)}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={!t.refundable}
                            onClick={() => setConfirmRefund(t)}
                          >
                            Mark refunded
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {tippersOffset < stats.tippersTotal && (
                <div className="text-center mt-3">
                  <Button variant="outline" onClick={loadMore} disabled={loading}>
                    {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Load 100 more
                  </Button>
                </div>
              )}
            </div>
          </>
        ) : null}
      </CardContent>

      <AlertDialog open={!!confirmRefund} onOpenChange={(o) => !o && setConfirmRefund(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Refund this tip?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmRefund && (
                <>This will refund {fmtUSD(confirmRefund.amountCents)} to {confirmRefund.customerEmail || "the customer"} via Stripe and mark the tip as refunded. This can't be undone here.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={refunding}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={doRefund} disabled={refunding}>
              {refunding ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Refund
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border p-3 bg-card">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
      {hint ? <div className="text-[11px] text-muted-foreground mt-1">{hint}</div> : null}
    </div>
  );
}

function BreakdownTable({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; deliveries: number; tips: number; tipsPerDelivery: number; avgCents: number }[];
}) {
  return (
    <div>
      <h4 className="text-sm font-semibold text-muted-foreground mb-2">{title}</h4>
      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead></TableHead>
              <TableHead className="text-right">Deliveries</TableHead>
              <TableHead className="text-right">Tips</TableHead>
              <TableHead className="text-right">Per delivery</TableHead>
              <TableHead className="text-right">Avg tip</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-4">No data.</TableCell></TableRow>
            ) : rows.map((r) => (
              <TableRow key={r.label}>
                <TableCell className="capitalize">{r.label}</TableCell>
                <TableCell className="text-right">{r.deliveries}</TableCell>
                <TableCell className="text-right">{r.tips}</TableCell>
                <TableCell className="text-right">{`${(r.tipsPerDelivery * 100).toFixed(1)}%`}</TableCell>
                <TableCell className="text-right">{r.tips ? fmtUSD(r.avgCents) : "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}