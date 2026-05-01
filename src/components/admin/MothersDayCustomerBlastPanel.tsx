import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Pause, Play, Send, RefreshCw, AlertTriangle, Heart, FlaskConical } from "lucide-react";

interface CampaignSettings {
  paused: boolean;
  batch_size: number;
  total_sent: number;
  last_run_at: string | null;
  activated_at: string | null;
  canary_sent: boolean;
}

interface Stats {
  settings: CampaignSettings;
  unique_recipients_emailed: number;
  order_rows_marked: number;
}

const DEFAULT_SETTINGS: CampaignSettings = {
  paused: true,
  batch_size: 250,
  total_sent: 0,
  last_run_at: null,
  activated_at: null,
  canary_sent: false,
};

interface Props { adminPassword: string }

export function MothersDayCustomerBlastPanel({ adminPassword }: Props) {
  const [settings, setSettings] = useState<CampaignSettings>(DEFAULT_SETTINGS);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [segment, setSegment] = useState<"all" | "us" | "intl">("all");
  const [testEmailsInput, setTestEmailsInput] = useState("");
  const [lastResult, setLastResult] = useState<Record<string, unknown> | null>(null);
  const { toast } = useToast();

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const fnUrl = `${supabaseUrl}/functions/v1/send-mothers-day-customer-blast`;

  const call = useCallback(async (body: Record<string, unknown>) => {
    const res = await fetch(fnUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-password": adminPassword },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((json as { error?: string }).error || `HTTP ${res.status}`);
    return json;
  }, [fnUrl, adminPassword]);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const json = await call({ action: "stats" }) as Stats;
      setStats(json);
      setSettings(json.settings);
    } catch (e) {
      toast({ title: "Failed to load", description: String((e as Error).message), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [call, toast]);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  const handleAction = async (label: string, body: Record<string, unknown>) => {
    setActionLoading(label);
    try {
      const json = await call(body);
      setLastResult(json as Record<string, unknown>);
      toast({ title: `${label} complete`, description: "See result panel below." });
      await fetchStats();
    } catch (e) {
      toast({ title: `${label} failed`, description: String((e as Error).message), variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const togglePause = () => handleAction(settings.paused ? "Resume" : "Pause", { action: settings.paused ? "resume" : "pause" });
  const dryRun = () => handleAction("Dry run", { dryRun: true, segment });
  const sendCanary = () => handleAction("Send canary (50)", { sendCanary: true, canarySize: 50, segment });
  const sendBatch = () => handleAction("Send batch (paused-respecting)", { send: true, segment });
  const sendTest = () => {
    const emails = testEmailsInput.split(/[,\s]+/).map(e => e.trim()).filter(Boolean);
    if (emails.length === 0) {
      toast({ title: "No emails", description: "Enter one or more test emails", variant: "destructive" });
      return;
    }
    handleAction(`Test send (${emails.length})`, { testEmails: emails });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Heart className="h-5 w-5 text-pink-500" />
          Mother's Day — Past Customer Blast
          <Badge variant={settings.paused ? "secondary" : "default"}>
            {settings.paused ? "PAUSED" : "ACTIVE"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="text-sm">
            One email per past customer. Code <strong>MOM5</strong> for $5 off ($29.99 → $24.99). Sends at <strong>10 AM local time</strong>. Excludes prior MD buyers, last-30-day buyers, in-flight orders, and suppressions.
          </AlertDescription>
        </Alert>

        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div><div className="text-muted-foreground">Total sent</div><div className="font-bold text-lg">{settings.total_sent}</div></div>
            <div><div className="text-muted-foreground">Unique recipients</div><div className="font-bold text-lg">{stats.unique_recipients_emailed}</div></div>
            <div><div className="text-muted-foreground">Order rows marked</div><div className="font-bold text-lg">{stats.order_rows_marked}</div></div>
            <div><div className="text-muted-foreground">Canary sent</div><div className="font-bold text-lg">{settings.canary_sent ? "Yes" : "No"}</div></div>
          </div>
        )}

        <div className="flex items-end gap-3 flex-wrap">
          <div>
            <Label className="text-xs">Segment</Label>
            <Select value={segment} onValueChange={(v) => setSegment(v as "all" | "us" | "intl")}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All (US + Intl)</SelectItem>
                <SelectItem value="us">US only</SelectItem>
                <SelectItem value="intl">International only</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button variant="outline" onClick={dryRun} disabled={!!actionLoading}>
            {actionLoading === "Dry run" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}
            Dry run
          </Button>

          <Button variant="outline" onClick={sendCanary} disabled={!!actionLoading}>
            {actionLoading?.startsWith("Send canary") ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Send canary (50)
          </Button>

          <Button onClick={sendBatch} disabled={!!actionLoading || settings.paused}>
            {actionLoading?.startsWith("Send batch") ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Send batch now
          </Button>

          <Button variant={settings.paused ? "default" : "secondary"} onClick={togglePause} disabled={!!actionLoading}>
            {settings.paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
            {settings.paused ? "Resume" : "Pause"}
          </Button>

          <Button variant="ghost" onClick={fetchStats} disabled={loading || !!actionLoading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>

        <div className="border-t pt-4">
          <Label className="text-xs">Test send (comma-separated emails — bypasses eligibility, doesn't mark orders)</Label>
          <div className="flex gap-2 mt-1">
            <Input value={testEmailsInput} onChange={e => setTestEmailsInput(e.target.value)} placeholder="ryan@example.com" />
            <Button variant="outline" onClick={sendTest} disabled={!!actionLoading}>
              {actionLoading?.startsWith("Test send") ? <Loader2 className="h-4 w-4 animate-spin" /> : "Test send"}
            </Button>
          </div>
        </div>

        {lastResult && (
          <div className="bg-muted p-3 rounded text-xs font-mono overflow-auto max-h-64">
            <pre>{JSON.stringify(lastResult, null, 2)}</pre>
          </div>
        )}

        <div className="text-xs text-muted-foreground">
          Cron: hourly. Each cron tick sends to recipients whose local time is currently 10:00–10:59. Pause flag gates cron sends; manual "Send batch" also respects pause.
        </div>
      </CardContent>
    </Card>
  );
}