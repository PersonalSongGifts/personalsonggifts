import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, RefreshCw, Loader2 } from "lucide-react";

interface DiscountCode {
  code: string;
  percent_off: number | null;
  amount_off: number | null;
  currency: string | null;
  active: boolean;
  created: number | null;
  not_in_stripe: boolean;
  uses: number;
  revenue_cents: number;
  last_used_at: string | null;
}

interface Props {
  adminPassword: string;
}

const money = (cents: number) =>
  `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function DiscountCodesPanel({ adminPassword }: Props) {
  const { toast } = useToast();
  const [codes, setCodes] = useState<DiscountCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [newPercent, setNewPercent] = useState("15");
  const [creating, setCreating] = useState(false);

  // Loads once on mount + manual refresh only. No polling — this dashboard has
  // suffered 503 storms from over-polling.
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await supabase.functions.invoke("admin-promo-codes", {
        body: { action: "stats" },
        headers: { "x-admin-password": adminPassword },
      });
      if (res.error) throw res.error;
      const data = res.data as { codes?: DiscountCode[]; error?: string };
      if (data?.error) throw new Error(data.error);
      setCodes(data?.codes ?? []);
    } catch (e) {
      toast({
        title: "Could not load discount codes",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [adminPassword, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async () => {
    const code = newCode.trim().toUpperCase();
    const percentOff = parseInt(newPercent, 10);
    if (!/^[A-Z0-9]{3,24}$/.test(code)) {
      toast({ title: "Invalid code", description: "3-24 characters, letters and numbers only.", variant: "destructive" });
      return;
    }
    if (!Number.isInteger(percentOff) || percentOff < 1 || percentOff > 99) {
      toast({ title: "Invalid discount", description: "Percent off must be between 1 and 99.", variant: "destructive" });
      return;
    }

    setCreating(true);
    try {
      const res = await supabase.functions.invoke("admin-promo-codes", {
        body: { action: "create", code, percentOff },
        headers: { "x-admin-password": adminPassword },
      });

      // Surface the server message (e.g. the 409 "already exists") rather than a generic error.
      let serverError: string | null = null;
      const data = res.data as { error?: string; success?: boolean } | null;
      if (data?.error) serverError = data.error;
      if (res.error && !serverError) {
        const ctx = (res.error as unknown as { context?: Response }).context;
        if (ctx && typeof ctx.json === "function") {
          try {
            const parsed = await ctx.json();
            if (parsed?.error) serverError = parsed.error;
          } catch { /* ignore */ }
        }
        if (!serverError) serverError = res.error.message;
      }
      if (serverError) throw new Error(serverError);

      toast({ title: "Code created", description: `${code} — ${percentOff}% off` });
      setDialogOpen(false);
      setNewCode("");
      setNewPercent("15");
      await load();
    } catch (e) {
      toast({
        title: "Could not create code",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };

  const discountLabel = (c: DiscountCode) => {
    if (c.percent_off != null) return `${c.percent_off}% off`;
    if (c.amount_off != null) return `${money(c.amount_off)} off`;
    return "—";
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Discount Codes</CardTitle>
          <CardDescription>
            Stripe discount codes customers type at checkout. (Flash price windows live under Promos.)
          </CardDescription>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            <span className="ml-2">Refresh</span>
          </Button>
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Create code
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        {loading && codes.length === 0 ? (
          <div className="py-10 flex justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : codes.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground">No discount codes yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">Code</th>
                  <th className="py-2 pr-4 font-medium">Discount</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 pr-4 font-medium text-right">Uses</th>
                  <th className="py-2 pr-4 font-medium text-right">Revenue</th>
                  <th className="py-2 font-medium">Last used</th>
                </tr>
              </thead>
              <tbody>
                {codes.map((c) => (
                  <tr key={c.code} className="border-b last:border-0">
                    <td className="py-2 pr-4 font-mono font-semibold">{c.code}</td>
                    <td className="py-2 pr-4">{discountLabel(c)}</td>
                    <td className="py-2 pr-4">
                      {c.not_in_stripe ? (
                        <Badge variant="outline">Not in Stripe</Badge>
                      ) : c.active ? (
                        <Badge>Active</Badge>
                      ) : (
                        <Badge variant="secondary">Inactive</Badge>
                      )}
                    </td>
                    <td className="py-2 pr-4 text-right">{c.uses}</td>
                    <td className="py-2 pr-4 text-right">{money(c.revenue_cents)}</td>
                    <td className="py-2 text-muted-foreground">
                      {c.last_used_at ? new Date(c.last_used_at).toLocaleDateString("en-US") : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-4 text-xs text-muted-foreground">
          Usage counted from completed orders. Codes apply to the base song price on Stripe and PayPal.
          Tracking starts from today — earlier orders have no code recorded.
        </p>
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create discount code</DialogTitle>
            <DialogDescription>
              Percentage off the base song price. Codes are unlimited-use.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-code">Code</Label>
              <Input
                id="new-code"
                value={newCode}
                onChange={(e) => setNewCode(e.target.value.toUpperCase())}
                placeholder="SAVE15"
                className="font-mono"
                maxLength={24}
              />
              <p className="text-xs text-muted-foreground">3-24 characters, letters and numbers only.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-percent">Percent off</Label>
              <Input
                id="new-percent"
                type="number"
                min={1}
                max={99}
                value={newPercent}
                onChange={(e) => setNewPercent(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={creating}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
