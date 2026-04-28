import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Pause, Play, Send, BarChart3, RefreshCw, AlertTriangle, Mail, Clock, RotateCcw, FlaskConical } from "lucide-react";

interface CampaignSettings {
  paused: boolean;
  batch_size: number;
  canary_size: number;
  canary_sent: boolean;
  total_sent: number;
  last_run_at: string | null;
  // Per-slug activation timestamps (e.g. activated_at_flash25)
  [key: string]: unknown;
}

const DEFAULT_SETTINGS: CampaignSettings = {
  paused: true,
  batch_size: 500,
  canary_size: 100,
  canary_sent: false,
  total_sent: 0,
  last_run_at: null,
};

interface Stats {
  promoSlug: string;
  sent: number;
  conversions: number;
  revenueCents: number;
  promo: { ends_at: string; is_active: boolean; starts_at: string; lead_price_cents?: number; standard_price_cents?: number } | null;
  activated_at: string | null;
}

interface Props {
  adminPassword: string;
}

interface WaveDef {
  slug: string;
  label: string;
  description: string;
}

const WAVES: WaveDef[] = [
  { slug: "flash25", label: "Wave 1 — flash25 ($24.99)", description: "Mother's Day campaign opener (~Apr 28)" },
  { slug: "flash20", label: "Wave 2 — flash20 ($19.99)", description: "Final push (~May 7, expires May 9)" },
];

function formatDuration(ms: number): string {
  if (ms <= 0) return "expired";
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  return `${h}h ${m}m`;
}

export function Flash20RemarketingPanel({ adminPassword }: Props) {
  const [activeSlug, setActiveSlug] = useState<string>("flash25");
  const [settings, setSettings] = useState<CampaignSettings>(DEFAULT_SETTINGS);
  const [stats, setStats] = useState<Stats | null>(null);
  const [eligibleCount, setEligibleCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [batchSizeInput, setBatchSizeInput] = useState("500");
  const [testEmailsInput, setTestEmailsInput] = useState("");
  const [testCarrierLeadId, setTestCarrierLeadId] = useState("");
  const [lastResult, setLastResult] = useState<Record<string, unknown> | null>(null);
  const [now, setNow] = useState(Date.now());
  const { toast } = useToast();

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

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
      console.error("Failed to fetch remarketing settings:", err);
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
      body: JSON.stringify({ promoSlug: activeSlug, ...body }),
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
        promoSlug: data.promoSlug || activeSlug,
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
  }, [activeSlug]);

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
    toast({ title: "Campaign Resumed", description: "Use 'Send Next Batch' or wait for hourly cron." });
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
      setEligibleCount(data.sampledAndUnsentForThisSlug ?? data.totalEligible ?? 0);
      setLastResult(data);
      toast({
        title: "Dry Run Complete",
        description: `${data.sampledAndUnsentForThisSlug ?? 0} eligible & not-yet-sent for ${activeSlug} (sample cap ${data.sampleCap ?? 2000}). Base query matched ${data.baseQueryMatched ?? "?"}.`,
      });
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
          description: `${data.sent} sent, ${data.failed} failed${skippedSuffix}. ${data.skippedAlreadySentSlug ?? 0} already-sent-this-wave skipped.`,
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
      const body: Record<string, unknown> = { testEmails: emails };
      if (testCarrierLeadId.trim()) body.testCarrierLeadId = testCarrierLeadId.trim();
      const data = await callFn(body);
      setLastResult(data);
      toast({
        title: "Test Sent",
        description: `${data.totalSent} sent, ${data.totalFailed} failed. ${data.carrierLogWritten ? "Carrier seeded — REMEMBER TO REVERT before production." : (data.carrierLeadId ? "Carrier already had log entry." : "No carrier lead — preview page may not show discount.")}`,
      });
    } catch (err) {
      toast({ title: "Test Failed", description: String(err), variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const handleRevertCarrier = async () => {
    if (!testCarrierLeadId.trim()) {
      toast({ title: "Need carrier lead ID", variant: "destructive" });
      return;
    }
    if (!confirm(`Revert carrier lead ${testCarrierLeadId} for ${activeSlug}? Removes the test ${activeSlug}_sent log entry + clears send-claim. Lead becomes eligible for production sends again.`)) return;
    setActionLoading("revert");
    try {
      const data = await callFn({ revertTestCarrier: true, testCarrierLeadId: testCarrierLeadId.trim() });
      setLastResult(data);
      toast({ title: "Carrier Reverted", description: `Removed ${data.deletedLogRows ?? 0} log row(s).` });
    } catch (err) {
      toast({ title: "Revert Failed", description: String(err), variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const handleReset = async () => {
    if (!confirm("Reset campaign settings? Clears per-slug activated_at + counters. Promo rows are NOT touched. Use this between waves before activating the next slug.")) return;
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

  const currentWave = WAVES.find(w => w.slug === activeSlug);

  return (
    <Card className="border-2 border-orange-500/30">
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-lg">⚡ Mother's Day Two-Wave Remarketing</CardTitle>
          <div className="flex items-center gap-2">
            {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            <Badge variant={settings.paused ? "secondary" : "default"} className={settings.paused ? "" : "bg-green-600"}>
              {settings.paused ? "Paused" : "Running"}
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
        {/* Wave selector */}
        <div className="space-y-2 rounded-md border p-3 bg-blue-50 border-blue-200">
          <Label className="text-xs font-semibold flex items-center gap-1">
            <FlaskConical className="h-3 w-3" /> Active Wave
          </Label>
          <Select value={activeSlug} onValueChange={setActiveSlug}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WAVES.map(w => (
                <SelectItem key={w.slug} value={w.slug}>{w.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {currentWave && (
            <p className="text-xs text-muted-foreground">{currentWave.description}</p>
          )}
          <p className="text-xs text-muted-foreground">
            All actions below (dry run, send, test, stats) target the <code className="bg-white px-1 rounded">{activeSlug}</code> promo slug.
          </p>
        </div>

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

        {!stats?.activated_at && (
          <Alert>
            <Clock className="h-4 w-4" />
            <AlertDescription>
              <strong>{activeSlug} promo not yet activated.</strong> The 72-hour clock starts when the first batch (canary or test) sends.
            </AlertDescription>
          </Alert>
        )}

        {/* Stats grid */}
        {stats && (
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-md border p-3 bg-muted/30">
              <div className="text-xs text-muted-foreground">Sent ({stats.promoSlug})</div>
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
              {eligibleCount !== null ? ` / ${totalEligibleForProgress} eligible (sample)` : ""}
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
            {!settings.canary_sent ? `Send Canary (${settings.canary_size})` : "Send Next Batch"}
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
            <Mail className="h-3 w-3" /> Send Test Email ({activeSlug})
          </Label>
          <div className="flex gap-2">
            <Input
              placeholder="email1@example.com, email2@example.com"
              value={testEmailsInput}
              onChange={(e) => setTestEmailsInput(e.target.value)}
              className="h-8 text-sm flex-1"
            />
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="Carrier lead ID (uuid) — preview page will render discounted price for this lead"
              value={testCarrierLeadId}
              onChange={(e) => setTestCarrierLeadId(e.target.value)}
              className="h-8 text-sm flex-1 font-mono"
            />
            <Button onClick={handleTestSend} disabled={!!actionLoading || !testEmailsInput.trim()} size="sm" variant="outline">
              {actionLoading === "test" ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}
              Send Test
            </Button>
            <Button
              onClick={handleRevertCarrier}
              disabled={!!actionLoading || !testCarrierLeadId.trim()}
              size="sm"
              variant="ghost"
              className="text-destructive"
              title="Remove the test {slug}_sent log entry + clear send-claim for the carrier lead"
            >
              {actionLoading === "revert" ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RotateCcw className="h-4 w-4 mr-1" />}
              Revert Carrier
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Test send activates the 72h promo window. Provide a carrier lead ID so the preview page renders the {activeSlug} discount when the test recipient clicks the link. Click "Revert Carrier" before going to production so they don't get double-emailed.
          </p>
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
          <div className="bg-muted rounded-md p-3 text-xs font-mono overflow-auto max-h-60">
            <pre>{JSON.stringify(lastResult, null, 2)}</pre>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
