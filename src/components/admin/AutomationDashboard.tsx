import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { 
  Bot, 
  Play, 
  Pause, 
  RefreshCw, 
  AlertCircle, 
  CheckCircle2, 
  Clock, 
  Music, 
  Zap,
  Eye,
  RotateCcw,
  Settings2,
  Users,
  ShoppingCart,
  AlertTriangle
} from "lucide-react";
import { formatDistanceToNow, format, addDays, setHours, setMinutes, setSeconds, setMilliseconds } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group";

interface AutomationStats {
  pending: number;
  generatingLyrics: number;
  generatingAudio: number;
  completedToday: number;
  failedToday: number;
}

interface SongsToBuildStats {
  todayCount: number;
  tomorrowCount: number;
  totalCount: number;
  deadline: string; // 3pm tomorrow PST
}

interface ActiveJob {
  id: string;
  recipientName: string;
  customerName: string;
  status: string;
  startedAt: string | null;
  error: string | null;
  lyrics: string | null;
  genre: string;
  occasion: string;
}

interface EligibleLead {
  id: string;
  recipientName: string;
  customerName: string;
  qualityScore: number;
  genre: string;
  occasion: string;
  email: string;
}

interface Order {
  id: string;
  status: string;
  expected_delivery: string | null;
  song_url: string | null;
  automation_status: string | null;
  dismissed_at: string | null;
}

interface AutomationDashboardProps {
  adminPassword: string;
  onRefresh?: () => void;
  orders?: Order[];
}

type AutomationTarget = "leads" | "orders" | "both";

export function AutomationDashboard({ adminPassword, onRefresh, orders = [] }: AutomationDashboardProps) {
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(true);
  const [automationTarget, setAutomationTarget] = useState<AutomationTarget>("leads");
  const [qualityThreshold, setQualityThreshold] = useState(65);
  const [stats, setStats] = useState<AutomationStats>({
    pending: 0,
    generatingLyrics: 0,
    generatingAudio: 0,
    completedToday: 0,
    failedToday: 0,
  });
  const [activeJobs, setActiveJobs] = useState<ActiveJob[]>([]);
  const [eligibleLeads, setEligibleLeads] = useState<EligibleLead[]>([]);
  const [selectedLeads, setSelectedLeads] = useState<Set<string>>(new Set());
  const [triggering, setTriggering] = useState(false);
  const [viewingLyrics, setViewingLyrics] = useState<ActiveJob | null>(null);
  // Alert state
  const [alerts, setAlerts] = useState<{
    stuckOrders: number;
    failedOrders: number;
    overdueOrders: number;
    needsReviewOrders: number;
    deliveryFailedOrders: number;
    stuckLeads: number;
    failedLeads: number;
    overdueLeads: number;
  } | null>(null);
  const [alertsTotal, setAlertsTotal] = useState(0);
  const { toast } = useToast();

  const fetchAutomationStatus = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-orders", {
        method: "POST",
        body: {
          action: "get_automation_status",
          adminPassword,
        },
      });

      if (error) throw error;

      setEnabled(data.enabled);
      setAutomationTarget(data.automationTarget || "leads");
      setQualityThreshold(data.qualityThreshold);
      setStats(data.stats);
      setActiveJobs(data.activeJobs || []);
      setEligibleLeads(data.eligibleLeads || []);
    } catch (err) {
      console.error("Failed to fetch automation status:", err);
      toast({
        title: "Error",
        description: "Failed to fetch automation status",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchAlerts = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("admin-orders", {
        method: "POST",
        body: {
          action: "get_alerts_summary",
          adminPassword,
        },
      });

      if (error) throw error;
      setAlerts(data.alerts);
      setAlertsTotal(data.total);
    } catch (err) {
      console.error("Failed to fetch alerts:", err);
    }
  };

  useEffect(() => {
    fetchAutomationStatus();
    fetchAlerts();
  }, [adminPassword]);

  // Calculate "Songs to Build" - orders that need songs before 3pm tomorrow PST
  const songsToBuild = useMemo(() => {
    const now = new Date();
    
    // Get 3pm tomorrow PST
    // Create date in PST timezone
    const pstNow = toZonedTime(now, "America/Los_Angeles");
    const endOfTodayPST = setMilliseconds(setSeconds(setMinutes(setHours(pstNow, 23), 59), 59), 999);
    const tomorrowPST = addDays(pstNow, 1);
    const threePMTomorrowPST = setMilliseconds(setSeconds(setMinutes(setHours(tomorrowPST, 15), 0), 0), 0);
    
    // Filter orders that need songs built
    const needsSong = orders.filter(order => {
      // Only active, paid orders without a song
      if (order.dismissed_at) return false;
      if (order.status !== "paid") return false;
      if (order.song_url) return false;
      if (!order.expected_delivery) return false;
      
      const deliveryDate = new Date(order.expected_delivery);
      // Check if delivery is before or at 3pm tomorrow PST
      return deliveryDate <= threePMTomorrowPST;
    });
    
    // Count by today vs tomorrow
    const todayCount = needsSong.filter(order => {
      const deliveryDate = new Date(order.expected_delivery!);
      return deliveryDate <= endOfTodayPST;
    }).length;
    
    const tomorrowCount = needsSong.length - todayCount;
    
    return {
      todayCount,
      tomorrowCount,
      totalCount: needsSong.length,
      deadline: format(threePMTomorrowPST, "MMM d, h:mm a") + " PST"
    };
  }, [orders]);

  const handleToggleAutomation = async (newEnabled: boolean) => {
    try {
      const { error } = await supabase.functions.invoke("admin-orders", {
        method: "POST",
        body: {
          action: "set_automation_enabled",
          enabled: newEnabled,
          adminPassword,
        },
      });

      if (error) throw error;

      setEnabled(newEnabled);
      toast({
        title: newEnabled ? "Automation Enabled" : "Automation Paused",
        description: newEnabled 
          ? "New high-quality entries will automatically trigger song generation" 
          : "Automatic song generation is paused. Manual triggers still work.",
      });
    } catch (err) {
      console.error("Failed to toggle automation:", err);
      toast({
        title: "Error",
        description: "Failed to update automation setting",
        variant: "destructive",
      });
    }
  };

  const handleUpdateTarget = async (newTarget: AutomationTarget) => {
    try {
      const { error } = await supabase.functions.invoke("admin-orders", {
        method: "POST",
        body: {
          action: "set_automation_target",
          target: newTarget,
          adminPassword,
        },
      });

      if (error) throw error;

      setAutomationTarget(newTarget);
      toast({
        title: "Target Updated",
        description: `Automation will now run for ${newTarget === "both" ? "leads and orders" : newTarget}`,
      });
    } catch (err) {
      console.error("Failed to update target:", err);
      toast({
        title: "Error",
        description: "Failed to update automation target",
        variant: "destructive",
      });
    }
  };

  const handleUpdateThreshold = async (newThreshold: number) => {
    try {
      const { error } = await supabase.functions.invoke("admin-orders", {
        method: "POST",
        body: {
          action: "set_quality_threshold",
          threshold: newThreshold,
          adminPassword,
        },
      });

      if (error) throw error;

      setQualityThreshold(newThreshold);
      toast({
        title: "Threshold Updated",
        description: `Quality threshold set to ${newThreshold}`,
      });
    } catch (err) {
      console.error("Failed to update threshold:", err);
      toast({
        title: "Error",
        description: "Failed to update threshold",
        variant: "destructive",
      });
    }
  };

  const handleTriggerAutomation = async (leadIds: string[]) => {
    if (leadIds.length === 0) return;

    setTriggering(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-orders", {
        method: "POST",
        body: {
          action: "batch_trigger_automation",
          leadIds,
          adminPassword,
        },
      });

      if (error) throw error;

      toast({
        title: "Automation Triggered",
        description: `Started generation for ${data.triggered} lead(s)${data.skipped > 0 ? `, ${data.skipped} skipped` : ""}`,
      });

      setSelectedLeads(new Set());
      fetchAutomationStatus();
      onRefresh?.();
    } catch (err) {
      console.error("Failed to trigger automation:", err);
      toast({
        title: "Error",
        description: "Failed to trigger automation",
        variant: "destructive",
      });
    } finally {
      setTriggering(false);
    }
  };

  const handleRetryAutomation = async (leadId: string) => {
    try {
      const { error } = await supabase.functions.invoke("admin-orders", {
        method: "POST",
        body: {
          action: "retry_automation",
          leadId,
          adminPassword,
        },
      });

      if (error) throw error;

      toast({
        title: "Retry Started",
        description: "Automation retry has been triggered",
      });

      fetchAutomationStatus();
    } catch (err) {
      console.error("Failed to retry automation:", err);
      toast({
        title: "Error",
        description: "Failed to retry automation",
        variant: "destructive",
      });
    }
  };

  const handleCancelAutomation = async (leadId: string) => {
    try {
      const { error } = await supabase.functions.invoke("admin-orders", {
        method: "POST",
        body: {
          action: "cancel_automation",
          leadId,
          adminPassword,
        },
      });

      if (error) throw error;

      toast({
        title: "Automation Cancelled",
        description: "The automation job has been cancelled",
      });

      fetchAutomationStatus();
    } catch (err) {
      console.error("Failed to cancel automation:", err);
      toast({
        title: "Error",
        description: "Failed to cancel automation",
        variant: "destructive",
      });
    }
  };

  // Check if a job is stuck (audio_generating for >5 minutes)
  // Uses actual pipeline status "audio_generating" (not "generating_audio")
  const isJobStuck = (job: ActiveJob) => {
    return job.status === "audio_generating" && 
      job.startedAt && 
      (Date.now() - new Date(job.startedAt).getTime()) > 5 * 60 * 1000;
  };

  const getElapsedTime = (startedAt: string | null) => {
    if (!startedAt) return null;
    const elapsed = Date.now() - new Date(startedAt).getTime();
    const minutes = Math.floor(elapsed / 60000);
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m ago`;
  };

  const getStatusBadge = (status: string, job?: ActiveJob) => {
    // Check for stuck state first
    if (job && isJobStuck(job)) {
      const elapsedMs = Date.now() - new Date(job.startedAt!).getTime();
      const elapsedMin = Math.floor(elapsedMs / 60000);
      return (
        <Badge className="gap-1 bg-red-500 animate-pulse">
          <AlertCircle className="h-3 w-3" />
          STUCK ({elapsedMin}m)
        </Badge>
      );
    }

    // Use actual pipeline status names
    switch (status) {
      case "pending":
        return <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" />Pending</Badge>;
      case "lyrics_generating":
        return <Badge className="gap-1 bg-purple-500"><RefreshCw className="h-3 w-3 animate-spin" />Generating Lyrics</Badge>;
      case "lyrics_ready":
        return <Badge className="gap-1 bg-blue-500"><CheckCircle2 className="h-3 w-3" />Lyrics Ready</Badge>;
      case "audio_generating":
        return <Badge className="gap-1 bg-amber-500"><RefreshCw className="h-3 w-3 animate-spin" />Generating Audio</Badge>;
      case "completed":
        return <Badge className="gap-1 bg-green-500"><CheckCircle2 className="h-3 w-3" />Completed</Badge>;
      case "failed":
        return <Badge variant="destructive" className="gap-1"><AlertCircle className="h-3 w-3" />Failed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  // Handle manual audio recovery
  const handleRecoverAudio = async (leadId: string) => {
    try {
      toast({
        title: "Recovering...",
        description: "Attempting to recover audio from provider",
      });

      const { data, error } = await supabase.functions.invoke("admin-orders", {
        method: "POST",
        body: {
          action: "recover_audio",
          leadId,
          adminPassword,
        },
      });

      if (error) throw error;

      toast({
        title: "Recovery Triggered",
        description: "Checking audio status. Refresh in a moment.",
      });

      // Refresh after a short delay
      setTimeout(() => {
        fetchAutomationStatus();
        onRefresh?.();
      }, 2000);
    } catch (err) {
      console.error("Recovery error:", err);
      toast({
        title: "Recovery Failed",
        description: err instanceof Error ? err.message : "Failed to recover audio",
        variant: "destructive",
      });
    }
  };

  const toggleLeadSelection = (leadId: string) => {
    const newSelected = new Set(selectedLeads);
    if (newSelected.has(leadId)) {
      newSelected.delete(leadId);
    } else {
      newSelected.add(leadId);
    }
    setSelectedLeads(newSelected);
  };

  const selectAllLeads = () => {
    if (selectedLeads.size === eligibleLeads.length) {
      setSelectedLeads(new Set());
    } else {
      setSelectedLeads(new Set(eligibleLeads.map(l => l.id)));
    }
  };

  return (
    <div className="space-y-6">
      {/* Alert Banner */}
      {alertsTotal > 0 && (
        <Card className="border-red-300 bg-red-50">
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0" />
              <div className="flex-1">
                <p className="font-semibold text-red-800">
                  {alertsTotal} item{alertsTotal !== 1 ? "s" : ""} need attention
                </p>
                <ul className="text-sm text-red-700 mt-1 space-y-0.5">
                  {alerts?.stuckOrders && alerts.stuckOrders > 0 && <li>• {alerts.stuckOrders} order(s) stuck in audio generation</li>}
                  {alerts?.overdueOrders && alerts.overdueOrders > 0 && <li>• {alerts.overdueOrders} order(s) overdue for delivery</li>}
                  {alerts?.failedOrders && alerts.failedOrders > 0 && <li>• {alerts.failedOrders} order(s) failed</li>}
                  {alerts?.needsReviewOrders && alerts.needsReviewOrders > 0 && <li>• {alerts.needsReviewOrders} order(s) need review</li>}
                  {alerts?.deliveryFailedOrders && alerts.deliveryFailedOrders > 0 && <li>• {alerts.deliveryFailedOrders} order(s) delivery failed</li>}
                  {alerts?.stuckLeads && alerts.stuckLeads > 0 && <li>• {alerts.stuckLeads} lead(s) stuck in audio generation</li>}
                  {alerts?.overdueLeads && alerts.overdueLeads > 0 && <li>• {alerts.overdueLeads} lead(s) overdue for preview</li>}
                  {alerts?.failedLeads && alerts.failedLeads > 0 && <li>• {alerts.failedLeads} lead(s) failed</li>}
                </ul>
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => {
                  fetchAutomationStatus();
                  fetchAlerts();
                  onRefresh?.();
                }}
                className="border-red-300 text-red-600 hover:bg-red-100"
              >
                <RefreshCw className="h-4 w-4 mr-1" />
                Refresh
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Songs to Build Widget */}
      <Card className={songsToBuild.totalCount > 0 ? "border-amber-300 bg-amber-50" : ""}>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Music className="h-5 w-5" />
            Songs to Build
          </CardTitle>
          <CardDescription>
            Orders needing songs by {songsToBuild.deadline}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="space-y-1">
              <p className={`text-3xl font-bold ${songsToBuild.todayCount > 0 ? "text-red-600" : "text-muted-foreground"}`}>
                {songsToBuild.todayCount}
              </p>
              <p className="text-xs text-muted-foreground">Due Today</p>
            </div>
            <div className="space-y-1">
              <p className={`text-3xl font-bold ${songsToBuild.tomorrowCount > 0 ? "text-amber-600" : "text-muted-foreground"}`}>
                {songsToBuild.tomorrowCount}
              </p>
              <p className="text-xs text-muted-foreground">Due Tomorrow (by 3pm)</p>
            </div>
            <div className="space-y-1">
              <p className={`text-3xl font-bold ${songsToBuild.totalCount > 0 ? "text-blue-600" : "text-green-600"}`}>
                {songsToBuild.totalCount}
              </p>
              <p className="text-xs text-muted-foreground">Total</p>
            </div>
          </div>
          {songsToBuild.totalCount === 0 && (
            <p className="text-center text-sm text-green-600 mt-4">
              <CheckCircle2 className="h-4 w-4 inline mr-1" />
              All caught up! No urgent songs to build.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Header Controls */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Automation Status Card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Bot className="h-5 w-5" />
              Automation Status
            </CardTitle>
            <CardDescription>
              Control automatic AI song generation for new leads
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Switch
                  checked={enabled}
                  onCheckedChange={handleToggleAutomation}
                />
                <span className={`font-medium ${enabled ? "text-green-600" : "text-muted-foreground"}`}>
                  {enabled ? "Running" : "Paused"}
                </span>
              </div>
              {enabled ? (
                <Badge className="bg-green-500 gap-1">
                  <Zap className="h-3 w-3" />
                  Active
                </Badge>
              ) : (
                <Badge variant="secondary" className="gap-1">
                  <Pause className="h-3 w-3" />
                  Paused
                </Badge>
              )}
            </div>

            {/* Automation Target Toggle */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                Target
              </Label>
              <ToggleGroup 
                type="single" 
                value={automationTarget} 
                onValueChange={(value) => value && handleUpdateTarget(value as AutomationTarget)}
                className="justify-start"
              >
                <ToggleGroupItem value="leads" aria-label="Leads only" className="gap-2">
                  <Users className="h-4 w-4" />
                  Leads
                </ToggleGroupItem>
                <ToggleGroupItem value="orders" aria-label="Orders only" className="gap-2">
                  <ShoppingCart className="h-4 w-4" />
                  Orders
                </ToggleGroupItem>
                <ToggleGroupItem value="both" aria-label="Both" className="gap-2">
                  Both
                </ToggleGroupItem>
              </ToggleGroup>
              <p className="text-xs text-muted-foreground">
                {automationTarget === "leads" && "AI generates songs for marketing leads (free previews)"}
                {automationTarget === "orders" && "AI generates songs for paid orders only"}
                {automationTarget === "both" && "AI generates songs for both leads and orders"}
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2">
                  <Settings2 className="h-4 w-4" />
                  Quality Threshold
                </Label>
                <span className="font-mono font-bold">{qualityThreshold}</span>
              </div>
              <Slider
                value={[qualityThreshold]}
                min={0}
                max={100}
                step={5}
                onValueCommit={(v) => handleUpdateThreshold(v[0])}
                className="w-full"
              />
              <p className="text-xs text-muted-foreground">
                Only leads with quality ≥ {qualityThreshold} will auto-trigger
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Quick Stats Card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Music className="h-5 w-5" />
              Quick Stats
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <p className="text-2xl font-bold text-purple-600">{stats.generatingLyrics}</p>
                <p className="text-xs text-muted-foreground">Generating Lyrics</p>
              </div>
              <div className="space-y-1">
                <p className="text-2xl font-bold text-amber-600">{stats.generatingAudio}</p>
                <p className="text-xs text-muted-foreground">Generating Audio</p>
              </div>
              <div className="space-y-1">
                <p className="text-2xl font-bold text-green-600">{stats.completedToday}</p>
                <p className="text-xs text-muted-foreground">Completed Today</p>
              </div>
              <div className="space-y-1">
                <p className="text-2xl font-bold text-red-600">{stats.failedToday}</p>
                <p className="text-xs text-muted-foreground">Failed Today</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Active Jobs */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <RefreshCw className="h-5 w-5" />
                Active Jobs
              </CardTitle>
              <CardDescription>Leads currently being processed by AI</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={fetchAutomationStatus} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {activeJobs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Bot className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No active automation jobs</p>
            </div>
          ) : (
            <div className="space-y-3">
              {activeJobs.map((job) => (
                <div
                  key={job.id}
                  className={`border rounded-lg p-4 ${
                    job.status === "failed" ? "border-red-200 bg-red-50" : 
                    job.status === "completed" ? "border-green-200 bg-green-50" : 
                    "border-border"
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{job.recipientName}</span>
                        {getStatusBadge(job.status, job)}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {job.occasion} • {job.genre} • {job.customerName}
                      </p>
                      {job.startedAt && (
                        <p className="text-xs text-muted-foreground">
                          Started {getElapsedTime(job.startedAt)}
                        </p>
                      )}
                      {job.error && (
                        <p className="text-sm text-red-600 mt-2">
                          Error: {job.error}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {job.lyrics && (
                        <Button variant="outline" size="sm" onClick={() => setViewingLyrics(job)}>
                          <Eye className="h-4 w-4 mr-1" />
                          Lyrics
                        </Button>
                      )}
                      {isJobStuck(job) && (
                        <Button variant="default" size="sm" onClick={() => handleRecoverAudio(job.id)} className="bg-orange-500 hover:bg-orange-600">
                          <RotateCcw className="h-4 w-4 mr-1" />
                          Recover
                        </Button>
                      )}
                      {job.status === "failed" && (
                        <Button variant="outline" size="sm" onClick={() => handleRetryAutomation(job.id)}>
                          <RotateCcw className="h-4 w-4 mr-1" />
                          Retry
                        </Button>
                      )}
                      {(job.status === "pending" || job.status === "generating_lyrics" || job.status === "generating_audio") && (
                        <Button variant="outline" size="sm" onClick={() => handleCancelAutomation(job.id)}>
                          <Pause className="h-4 w-4 mr-1" />
                          Cancel
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Eligible Leads Queue */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Zap className="h-5 w-5" />
                Eligible Leads
              </CardTitle>
              <CardDescription>
                Leads with quality ≥ {qualityThreshold} that don't have a song yet
              </CardDescription>
            </div>
            {eligibleLeads.length > 0 && (
              <Button 
                onClick={() => handleTriggerAutomation(eligibleLeads.map(l => l.id))}
                disabled={triggering}
              >
                <Play className="h-4 w-4 mr-2" />
                Run All ({eligibleLeads.length})
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {eligibleLeads.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <CheckCircle2 className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No eligible leads waiting for automation</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2 pb-2 border-b">
                <Checkbox
                  checked={selectedLeads.size === eligibleLeads.length}
                  onCheckedChange={selectAllLeads}
                />
                <span className="text-sm text-muted-foreground">
                  {selectedLeads.size} of {eligibleLeads.length} selected
                </span>
                {selectedLeads.size > 0 && (
                  <Button
                    size="sm"
                    onClick={() => handleTriggerAutomation(Array.from(selectedLeads))}
                    disabled={triggering}
                    className="ml-auto"
                  >
                    <Play className="h-4 w-4 mr-1" />
                    Generate Selected
                  </Button>
                )}
              </div>
              {eligibleLeads.map((lead) => (
                <div
                  key={lead.id}
                  className="flex items-center gap-3 p-3 border rounded-lg hover:bg-accent/50 transition-colors"
                >
                  <Checkbox
                    checked={selectedLeads.has(lead.id)}
                    onCheckedChange={() => toggleLeadSelection(lead.id)}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{lead.recipientName}</span>
                      <Badge variant="outline" className="shrink-0">
                        Score: {lead.qualityScore}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground truncate">
                      {lead.occasion} • {lead.genre} • {lead.email}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleTriggerAutomation([lead.id])}
                    disabled={triggering}
                  >
                    <Play className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Lyrics Preview Dialog */}
      <Dialog open={!!viewingLyrics} onOpenChange={() => setViewingLyrics(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Generated Lyrics</DialogTitle>
            <DialogDescription>
              Lyrics for {viewingLyrics?.recipientName}'s {viewingLyrics?.occasion} song
            </DialogDescription>
          </DialogHeader>
          <div className="whitespace-pre-wrap font-mono text-sm bg-muted p-4 rounded-lg">
            {viewingLyrics?.lyrics}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
