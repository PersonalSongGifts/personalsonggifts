import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Pause, Play, Send, BarChart3, RefreshCw, AlertTriangle, Mail, Clock, RotateCcw } from "lucide-react";

interface CampaignSettings {
  paused: boolean;
  batch_size: number;
  canary_size: number;
  canary_sent: boolean;
  total_sent: number;
  activated_at: string | null;
  last_run_at: string | null;
}

const DEFAULT_SETTINGS: CampaignSettings = {
  paused: true,
  batch_size: 500,
  canary_size: 100,
  canary_sent: false,
  total_sent: 0,
  activated_at: null,
  last_run_at: null,
};

interface Stats {
  sent: number;
  conversions: number;
  revenueCents: number;
  promo: { ends_at: string; is_active: boolean; starts_at: string } | null;
  activated_at: string | null;
}

interface Props {
  adminPassword: string;
}

function formatDuration(ms: number): string {
  if (ms <= 0) return "expired";
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  return `${h}h ${m}m`;
}

export function Flash20RemarketingPanel({ adminPassword }: Props) {
  const [settings, setSettings] = useState<CampaignSettings>(DEFAULT_SETTINGS);
  const [stats, setStats] = useState<Stats | null>(null);
  const [eligibleCount, setEligibleCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [batchSizeInput, setBatchSizeInput] = useState("500");
  const [testEmailsInput, setTestEmailsInput] = useState("");
  const [lastResult, setLastResult] = useState<Record<string, unknown> | null>(null);
  const [now, setNow] = useState(Date.now());
  const { toast } = useToast();

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

  // Tick countdown every minute
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const fetchSettings = useCallback(async () => {
    setFetchError(null);
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/automation-get-settings`, {
        method: "GET",
        headers: { "x-admin-password": adminPassword },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.flash20_remarketing) {
        try {
          const parsed = JSON.parse(data.flash20_remarketing);
          setSettings({ ...DEFAULT_SETTINGS, ...parsed });
          setBatchSizeInput(String(parsed.batch_size || 500));
        } catch {
          setSettings(DEFAULT_SETTINGS);
        }
      }
    } catch (err) {
      console.error("Failed to fetch flash20 settings:", err);
      setFetchError(String(err));
    } finally {
      setLoading(false);
    }
  }, [adminPassword, supabaseUrl]);

  const updateSetting = async (updates: Partial<CampaignSettings>) => {
    const merged = { ...settings, ...updates };
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/automation-get-settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-password": adminPassword },
        body: JSON.stringify({ key: "flash20_remarketing", value: JSON.stringify(merged) }),
      });
      if (!res.ok) throw new Error("Failed to update");
      setSettings(merged);
      return true;
    } catch (err) {
      toast({ title: "Update Failed", description: String(err), variant: "destructive" });
      return false;
    }
  };

  const callFn = async (body: Record<string, unknown>) => {
    const res = await fetch(`${supabaseUrl}/functions/v1/send-flash20-remarketing`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-password": adminPassword },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json();
  };

  const refreshStats = useCallback(async () => {
    try {
      const data = await callFn({ stats: true });
      setStats({
        sent: data.sent || 0,
        conversions: data.conversions || 0,
        revenueCents: data.revenueCents || 0,
        promo: data.promo || null,
        activated_at: data.activated_at || null,
      });
    } catch (err) {
      console.error("stats failed", err);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchSettings();
    refreshStats();
  }, [fetchSettings, refreshStats]);

  const handlePause = async () => {
    setActionLoading("pause");
    await updateSetting({ paused: true });
    toast({ title: "Campaign Paused" });
    setActionLoading(null);
  };

  const handleResume = async () => {
    setActionLoading("resume");
    await updateSetting({ paused: false });
    toast({ title: "Campaign Resumed", description: "Click 'Run Next Batch' to send." });
    setActionLoading(null);
  };

  const handleUpdateBatchSize = async () => {
    const size = parseInt(batchSizeInput, 10);
    if (isNaN(size) || size < 1 || size > 1000) {
      toast({ title: "Invalid batch size", description: "Must be 1-1000 (hard cap)", variant: "destructive" });
      return;
    }
    setActionLoading("batchSize");
    await updateSetting({ batch_size: size });
    toast({ title: "Batch size updated", description: `${size} per run` });
    setActionLoading(null);
  };

  const handleDryRun = async () => {
    setActionLoading("dryRun");
    try {
      const data = await callFn({ dryRun: true });
      setEligibleCount(data.totalEligible);
      setLastResult(data);
      toast({ title: "Dry Run Complete", description: `${data.totalEligible} eligible leads` });
    } catch (err) {
      toast({ title: "Dry Run Failed", description: String(err), variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const handleRunBatch = async () => {
    setActionLoading("send");
    try {
      const data = await callFn({ send: true });
      setLastResult(data);
      if (data.paused) {
        toast({ title: "Campaign is Paused", description: "Resume first." });
      } else {
        const skippedTotal = data.skipped
          ? Object.values(data.skipped as Record<string, number>).reduce((a, b) => a + b, 0)
          : 0;
        const skippedSuffix = skippedTotal > 0 ? `, ${skippedTotal} skipped` : "";
        toast({
          title: data.canaryBatch ? "Canary Batch Sent" : "Batch Sent",
          description: `${data.sent} sent, ${data.failed} failed${skippedSuffix}, ${data.remaining} remaining`,
        });
        await fetchSettings();
        await refreshStats();
      }
    } catch (err) {
      toast({ title: "Batch Failed", description: String(err), variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const handleTestSend = async () => {
    const emails = testEmailsInput.split(",").map(e => e.trim()).filter(Boolean);
    if (emails.length === 0) {
      toast({ title: "No emails", variant: "destructive" });
      return;
    }
    setActionLoading("test");
    try {
      const data = await callFn({ testEmails: emails });
      setLastResult(data);
      toast({ title: "Test Sent", description: `${data.totalSent} sent, ${data.totalFailed} failed` });
    } catch (err) {
      toast({ title: "Test Failed", description: String(err), variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const handleReset = async () => {
    if (!confirm("Reset Flash20 campaign counters? (Does NOT clear last_promo_email_sent_at on leads)")) return;
    setActionLoading("reset");
    try {
      await callFn({ reset: true });
      await fetchSettings();
      await refreshStats();
      toast({ title: "Campaign Reset" });
    } catch (err) {
      toast({ title: "Reset Failed", description: String(err), variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const totalEligibleForProgress = (eligibleCount ?? 0) + settings.total_sent;
  const progressPercent = totalEligibleForProgress > 0
    ? Math.min(100, (settings.total_sent / totalEligibleForProgress) * 100)
    : 0;

  const promoEndsAt = stats?.promo?.ends_at ? new Date(stats.promo.ends_at).getTime() : null;
  const timeRemaining = promoEndsAt ? promoEndsAt - now : null;

  return (
    <Card className="border-2 border-orange-500/30">
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-lg">⚡ $19.99 Flash Sale (72h) Remarketing</CardTitle>
          <div className="flex items-center gap-2">
            {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            <Badge variant={settings.paused ? "secondary" : "default"} className={settings.paused ? "" : "bg-green-600"}>
              {settings.paused ? "Paused" : "Running"}
            </Badge>
            <Badge variant="outline" className="border-blue-500 text-blue-700">
              <RefreshCw className="h-3 w-3 mr-1" />
              Auto-drain: every 5 min
            </Badge>
            {stats?.promo?.is_active && timeRemaining !== null && timeRemaining > 0 && (
              <Badge variant="outline" className="border-orange-500 text-orange-700">
                <Clock className="h-3 w-3 mr-1" />
                {formatDuration(timeRemaining)} left
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {fetchError && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="flex items-center justify-between">
              <span>Failed to load: {fetchError}</span>
              <Button onClick={fetchSettings} variant="outline" size="sm">
                <RefreshCw className="h-3 w-3 mr-1" /> Retry
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {!settings.activated_at && (
          <Alert>
            <Clock className="h-4 w-4" />
            <AlertDescription>
              <strong>Promo not yet activated.</strong> The 72-hour clock starts when the first batch (canary or test) sends.
            </AlertDescription>
          </Alert>
        )}

        {/* Stats grid */}
        {stats && (
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-md border p-3 bg-muted/30">
              <div className="text-xs text-muted-foreground">Sent</div>
              <div className="text-2xl font-semibold">{stats.sent.toLocaleString()}</div>
            </div>
            <div className="rounded-md border p-3 bg-muted/30">
              <div className="text-xs text-muted-foreground">Converted</div>
              <div className="text-2xl font-semibold">{stats.conversions.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground">
                {stats.sent > 0 ? `${((stats.conversions / stats.sent) * 100).toFixed(2)}%` : "—"}
              </div>
            </div>
            <div className="rounded-md border p-3 bg-muted/30">
              <div className="text-xs text-muted-foreground">Revenue</div>
              <div className="text-2xl font-semibold">${(stats.revenueCents / 100).toFixed(2)}</div>
            </div>
          </div>
        )}

        {/* Progress */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">
              {settings.total_sent} sent
              {eligibleCount !== null ? ` / ${totalEligibleForProgress} eligible` : ""}
            </span>
            <span className="text-muted-foreground">
              {!settings.canary_sent ? `Canary pending (first ${settings.canary_size})` : "Post-canary batches"}
            </span>
          </div>
          <Progress value={progressPercent} />
          {settings.last_run_at && (
            <p className="text-xs text-muted-foreground">
              Last run: {new Date(settings.last_run_at).toLocaleString()}
            </p>
          )}
        </div>

        {/* Controls */}
        <div className="flex flex-wrap gap-2">
          {settings.paused ? (
            <Button onClick={handleResume} disabled={!!actionLoading} size="sm">
              {actionLoading === "resume" ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Play className="h-4 w-4 mr-1" />}
              Resume
            </Button>
          ) : (
            <Button onClick={handlePause} disabled={!!actionLoading} variant="destructive" size="sm">
              {actionLoading === "pause" ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Pause className="h-4 w-4 mr-1" />}
              Pause
            </Button>
          )}
          <Button onClick={handleDryRun} disabled={!!actionLoading} variant="outline" size="sm">
            {actionLoading === "dryRun" ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <BarChart3 className="h-4 w-4 mr-1" />}
            Dry Run
          </Button>
          <Button onClick={handleRunBatch} disabled={!!actionLoading || settings.paused} variant="outline" size="sm">
            {actionLoading === "send" ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}
            {!settings.canary_sent ? `Send Canary (${settings.canary_size})` : "Run Next Batch"}
          </Button>
          <Button onClick={() => { fetchSettings(); refreshStats(); }} disabled={!!actionLoading} variant="ghost" size="sm">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button onClick={handleReset} disabled={!!actionLoading} variant="ghost" size="sm" className="text-destructive">
            <RotateCcw className="h-4 w-4 mr-1" />
            Reset
          </Button>
        </div>

        {/* Test Send */}
        <div className="space-y-2 rounded-md border p-3 bg-muted/30">
          <Label className="text-xs font-semibold flex items-center gap-1">
            <Mail className="h-3 w-3" /> Send Test Email
          </Label>
          <div className="flex gap-2">
            <Input
              placeholder="email1@example.com, email2@example.com"
              value={testEmailsInput}
              onChange={(e) => setTestEmailsInput(e.target.value)}
              className="h-8 text-sm flex-1"
            />
            <Button onClick={handleTestSend} disabled={!!actionLoading || !testEmailsInput.trim()} size="sm" variant="outline">
              {actionLoading === "test" ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}
              Send Test
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Note: Sending a test ALSO activates the 72h promo window.</p>
        </div>

        {/* Batch Size */}
        <div className="flex items-end gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Batch Size (max 1000)</Label>
            <Input
              type="number"
              value={batchSizeInput}
              onChange={(e) => setBatchSizeInput(e.target.value)}
              className="w-24 h-8 text-sm"
            />
          </div>
          <Button
            onClick={handleUpdateBatchSize}
            disabled={!!actionLoading || batchSizeInput === String(settings.batch_size)}
            variant="outline" size="sm"
          >
            {actionLoading === "batchSize" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
          </Button>
        </div>

        {/* Last Result */}
        {lastResult && (
          <div className="bg-muted rounded-md p-3 text-xs font-mono overflow-auto max-h-40">
            <pre>{JSON.stringify(lastResult, null, 2)}</pre>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
