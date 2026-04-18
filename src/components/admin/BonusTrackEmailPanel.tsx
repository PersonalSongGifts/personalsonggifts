import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Music2, Send, FlaskConical, RefreshCw } from "lucide-react";

interface Stats {
  enabled: boolean;
  eligible: number;
  sent: number;
  playedAfter: number;
  unlockedAfter: number;
}

interface Props {
  adminPassword: string;
}

export function BonusTrackEmailPanel({ adminPassword }: Props) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [sending, setSending] = useState(false);
  const [testing, setTesting] = useState(false);
  const [batchSize, setBatchSize] = useState(25);
  const [testEmail, setTestEmail] = useState("");
  const { toast } = useToast();
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

  const call = useCallback(async (body: object) => {
    const res = await fetch(`${supabaseUrl}/functions/v1/send-bonus-track-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-password": adminPassword },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
    return json;
  }, [adminPassword, supabaseUrl]);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const data = await call({ mode: "stats" });
      setStats(data);
    } catch (e) {
      toast({ title: "Failed to load stats", description: String(e), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [call, toast]);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  const handleToggle = async (enabled: boolean) => {
    setToggling(true);
    try {
      await call({ mode: "setEnabled", enabled });
      setStats(s => s ? { ...s, enabled } : s);
      toast({
        title: enabled ? "Bonus emails enabled" : "Bonus emails paused",
        description: enabled ? "You can now run a batch send." : "No more emails will go out.",
      });
    } catch (e) {
      toast({ title: "Failed", description: String(e), variant: "destructive" });
    } finally {
      setToggling(false);
    }
  };

  const handleSend = async () => {
    if (!confirm(`Send bonus-track emails to ${batchSize} eligible customers?`)) return;
    setSending(true);
    try {
      const result = await call({ mode: "send", limit: batchSize });
      toast({
        title: "Batch complete",
        description: `Sent ${result.success} / attempted ${result.attempted}. Failed: ${result.failed}.`,
      });
      fetchStats();
    } catch (e) {
      toast({ title: "Send failed", description: String(e), variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const handleTest = async () => {
    if (!testEmail.trim()) {
      toast({ title: "Enter a test email first", variant: "destructive" });
      return;
    }
    setTesting(true);
    try {
      const result = await call({ mode: "test", testEmails: [testEmail.trim()] });
      const ok = result.results?.[0]?.ok;
      toast({
        title: ok ? "Test sent" : "Test failed",
        description: ok ? `Sample based on order ${result.usedOrder}` : result.results?.[0]?.error,
        variant: ok ? "default" : "destructive",
      });
    } catch (e) {
      toast({ title: "Test failed", description: String(e), variant: "destructive" });
    } finally {
      setTesting(false);
    }
  };

  const isEnabled = stats?.enabled === true;

  return (
    <Card className="border border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Music2 className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Bonus Track Email Campaign</CardTitle>
          </div>
          <div className="flex items-center gap-3">
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <Switch
                    id="bonus-email-toggle"
                    checked={isEnabled}
                    onCheckedChange={handleToggle}
                    disabled={toggling}
                  />
                  <Label htmlFor="bonus-email-toggle" className="text-sm cursor-pointer">
                    {toggling ? <Loader2 className="h-3 w-3 animate-spin inline" /> : isEnabled ? "Enabled" : "Paused"}
                  </Label>
                </div>
                <Badge className={isEnabled ? "bg-green-600 text-white border-0" : "bg-yellow-100 text-yellow-800 border-yellow-300"}>
                  {isEnabled ? "Active" : "Paused"}
                </Badge>
              </>
            )}
            <Button variant="ghost" size="sm" onClick={fetchStats} disabled={loading}>
              <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Notifies past customers (delivered 2+ days ago) that a bonus 2nd version of their song was generated and is sitting on their song page. Sends once per order. Manual batch trigger.
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Stats */}
        <div className="grid grid-cols-4 gap-3">
          <div className="rounded-lg border bg-muted/30 p-3 text-center">
            <div className="text-2xl font-bold text-foreground">{stats?.eligible ?? "—"}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Eligible Now</div>
          </div>
          <div className="rounded-lg border bg-muted/30 p-3 text-center">
            <div className="text-2xl font-bold text-foreground">{stats?.sent ?? "—"}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Emails Sent</div>
          </div>
          <div className="rounded-lg border bg-muted/30 p-3 text-center">
            <div className="text-2xl font-bold text-green-600">{stats?.playedAfter ?? "—"}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Played After</div>
          </div>
          <div className="rounded-lg border bg-muted/30 p-3 text-center">
            <div className="text-2xl font-bold text-green-600">{stats?.unlockedAfter ?? "—"}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Unlocked After</div>
          </div>
        </div>

        {/* Test send */}
        <div className="rounded-lg border p-3 space-y-2">
          <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Test send</Label>
          <div className="flex gap-2">
            <Input
              type="email"
              placeholder="your@email.com"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              className="text-sm"
            />
            <Button onClick={handleTest} disabled={testing} variant="outline" size="sm">
              {testing ? <Loader2 className="h-3 w-3 animate-spin" /> : <FlaskConical className="h-3 w-3 mr-1" />}
              Send test
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">Renders the email using a real eligible order's data and sends to this address only.</p>
        </div>

        {/* Batch send */}
        <div className="rounded-lg border p-3 space-y-2">
          <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Batch send</Label>
          <div className="flex gap-2 items-center">
            <Input
              type="number"
              min={1}
              max={200}
              value={batchSize}
              onChange={(e) => setBatchSize(Math.max(1, Math.min(200, Number(e.target.value) || 1)))}
              className="text-sm w-24"
            />
            <span className="text-xs text-muted-foreground">customers per batch (max 200)</span>
            <div className="flex-1" />
            <Button onClick={handleSend} disabled={sending || !isEnabled || (stats?.eligible ?? 0) === 0} size="sm">
              {sending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Send className="h-3 w-3 mr-1" />}
              Send batch
            </Button>
          </div>
          {!isEnabled && (
            <p className="text-[11px] text-yellow-700">Enable the toggle above before sending.</p>
          )}
          {isEnabled && (stats?.eligible ?? 0) === 0 && (
            <p className="text-[11px] text-muted-foreground">No eligible customers right now.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
