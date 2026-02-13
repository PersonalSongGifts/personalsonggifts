import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Pause, Play, Send, BarChart3, RefreshCw, AlertTriangle, Mail } from "lucide-react";

interface CampaignSettings {
  paused: boolean;
  batch_size: number;
  canary_size: number;
  canary_sent: boolean;
  total_sent: number;
  last_run_at: string | null;
}

const DEFAULT_SETTINGS: CampaignSettings = {
  paused: true,
  batch_size: 500,
  canary_size: 100,
  canary_sent: false,
  total_sent: 0,
  last_run_at: null,
};

interface Props {
  adminPassword: string;
}

export function ValentineRemarketingPanel({ adminPassword }: Props) {
  const [settings, setSettings] = useState<CampaignSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [dryRunCount, setDryRunCount] = useState<number | null>(null);
  const [batchSizeInput, setBatchSizeInput] = useState("500");
  const [testEmailsInput, setTestEmailsInput] = useState("");
  const [lastResult, setLastResult] = useState<Record<string, unknown> | null>(null);
  const { toast } = useToast();

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

  const fetchSettings = useCallback(async () => {
    setFetchError(null);
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/automation-get-settings`, {
        method: "GET",
        headers: { "x-admin-password": adminPassword },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.valentine_remarketing) {
        try {
          const parsed = JSON.parse(data.valentine_remarketing);
          setSettings({ ...DEFAULT_SETTINGS, ...parsed });
          setBatchSizeInput(String(parsed.batch_size || 500));
        } catch {
          setSettings(DEFAULT_SETTINGS);
        }
      }
    } catch (err) {
      console.error("Failed to fetch campaign settings:", err);
      setFetchError(String(err));
    } finally {
      setLoading(false);
    }
  }, [adminPassword, supabaseUrl]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const updateSetting = async (updates: Partial<CampaignSettings>) => {
    const merged = { ...settings, ...updates };
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/automation-get-settings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-password": adminPassword,
        },
        body: JSON.stringify({
          key: "valentine_remarketing",
          value: JSON.stringify(merged),
        }),
      });
      if (!res.ok) throw new Error("Failed to update");
      setSettings(merged);
      return true;
    } catch (err) {
      toast({ title: "Update Failed", description: String(err), variant: "destructive" });
      return false;
    }
  };

  const callRemarketingFunction = async (body: Record<string, unknown>) => {
    const res = await fetch(`${supabaseUrl}/functions/v1/send-valentine-remarketing`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-password": adminPassword,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json();
  };

  const handlePause = async () => {
    setActionLoading("pause");
    await updateSetting({ paused: true });
    toast({ title: "Campaign Paused", description: "No more emails will be sent until resumed." });
    setActionLoading(null);
  };

  const handleResume = async () => {
    setActionLoading("resume");
    await updateSetting({ paused: false });
    toast({ title: "Campaign Resumed", description: "Emails will send on next batch run." });
    setActionLoading(null);
  };

  const handleUpdateBatchSize = async () => {
    const size = parseInt(batchSizeInput, 10);
    if (isNaN(size) || size < 1 || size > 2000) {
      toast({ title: "Invalid batch size", description: "Must be between 1 and 2000", variant: "destructive" });
      return;
    }
    setActionLoading("batchSize");
    await updateSetting({ batch_size: size });
    toast({ title: "Batch size updated", description: `Set to ${size} per run.` });
    setActionLoading(null);
  };

  const handleDryRun = async () => {
    setActionLoading("dryRun");
    try {
      const data = await callRemarketingFunction({ dryRun: true });
      setDryRunCount(data.totalEligible);
      setLastResult(data);
      toast({ title: "Dry Run Complete", description: `${data.totalEligible} eligible leads. ${data.suppressedEmails} suppressed.` });
    } catch (err) {
      toast({ title: "Dry Run Failed", description: String(err), variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const handleRunBatch = async () => {
    setActionLoading("send");
    try {
      const data = await callRemarketingFunction({ send: true });
      setLastResult(data);
      if (data.paused) {
        toast({ title: "Campaign is Paused", description: "Resume the campaign first." });
      } else {
        toast({
          title: data.canaryBatch ? "Canary Batch Sent" : "Batch Sent",
          description: `${data.sent} sent, ${data.failed} failed, ${data.remaining} remaining.`,
        });
        await fetchSettings();
      }
    } catch (err) {
      toast({ title: "Batch Failed", description: String(err), variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const handleTestSend = async () => {
    const emails = testEmailsInput
      .split(",")
      .map((e) => e.trim())
      .filter((e) => e.length > 0);
    if (emails.length === 0) {
      toast({ title: "No emails", description: "Enter at least one email address.", variant: "destructive" });
      return;
    }
    setActionLoading("test");
    try {
      const data = await callRemarketingFunction({ testEmails: emails });
      setLastResult(data);
      toast({ title: "Test Emails Sent", description: `Sent to ${emails.length} address(es).` });
    } catch (err) {
      toast({ title: "Test Send Failed", description: String(err), variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const progressPercent = dryRunCount && dryRunCount > 0
    ? Math.min(100, (settings.total_sent / dryRunCount) * 100)
    : 0;

  return (
    <Card className="border-2 border-primary/20">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">💌 Valentine Remarketing Campaign</CardTitle>
          <div className="flex items-center gap-2">
            {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            <Badge variant={settings.paused ? "secondary" : "default"} className={settings.paused ? "" : "bg-green-600"}>
              {settings.paused ? "Paused" : "Running"}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Error state */}
        {fetchError && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="flex items-center justify-between">
              <span>Failed to load settings: {fetchError}</span>
              <Button onClick={fetchSettings} variant="outline" size="sm">
                <RefreshCw className="h-3 w-3 mr-1" /> Retry
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Progress */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">
              {settings.total_sent} sent{dryRunCount !== null ? ` / ${dryRunCount} eligible` : ""}
            </span>
            <span className="text-muted-foreground">
              {!settings.canary_sent ? "Canary pending (first 100)" : "Post-canary batches"}
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
              Resume Campaign
            </Button>
          ) : (
            <Button onClick={handlePause} disabled={!!actionLoading} variant="destructive" size="sm">
              {actionLoading === "pause" ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Pause className="h-4 w-4 mr-1" />}
              Pause Campaign
            </Button>
          )}
          <Button onClick={handleDryRun} disabled={!!actionLoading} variant="outline" size="sm">
            {actionLoading === "dryRun" ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <BarChart3 className="h-4 w-4 mr-1" />}
            Dry Run
          </Button>
          <Button onClick={handleRunBatch} disabled={!!actionLoading || settings.paused} variant="outline" size="sm">
            {actionLoading === "send" ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}
            Run Next Batch
          </Button>
          <Button onClick={fetchSettings} disabled={!!actionLoading} variant="ghost" size="sm">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>

        {/* Send Test Emails */}
        <div className="space-y-2 rounded-md border p-3 bg-muted/30">
          <Label className="text-xs font-semibold flex items-center gap-1">
            <Mail className="h-3 w-3" /> Send Test Remarketing Email
          </Label>
          <div className="flex gap-2">
            <Input
              placeholder="email1@example.com, email2@example.com"
              value={testEmailsInput}
              onChange={(e) => setTestEmailsInput(e.target.value)}
              className="h-8 text-sm flex-1"
            />
            <Button
              onClick={handleTestSend}
              disabled={!!actionLoading || !testEmailsInput.trim()}
              size="sm"
              variant="outline"
            >
              {actionLoading === "test" ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}
              Send Test
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Comma-separated. Sends the actual remarketing email to these addresses for testing.</p>
        </div>

        {/* Batch Size */}
        <div className="flex items-end gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Batch Size</Label>
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
            variant="outline"
            size="sm"
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
