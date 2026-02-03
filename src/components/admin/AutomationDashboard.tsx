import { useState, useEffect } from "react";
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
  Settings2
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface AutomationStats {
  pending: number;
  generatingLyrics: number;
  generatingAudio: number;
  completedToday: number;
  failedToday: number;
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

interface AutomationDashboardProps {
  adminPassword: string;
  onRefresh?: () => void;
}

export function AutomationDashboard({ adminPassword, onRefresh }: AutomationDashboardProps) {
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(true);
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

  useEffect(() => {
    fetchAutomationStatus();
  }, [adminPassword]);

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
          ? "New high-quality leads will automatically trigger song generation" 
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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" />Pending</Badge>;
      case "generating_lyrics":
        return <Badge className="gap-1 bg-purple-500"><RefreshCw className="h-3 w-3 animate-spin" />Generating Lyrics</Badge>;
      case "lyrics_ready":
        return <Badge className="gap-1 bg-blue-500"><CheckCircle2 className="h-3 w-3" />Lyrics Ready</Badge>;
      case "generating_audio":
        return <Badge className="gap-1 bg-amber-500"><RefreshCw className="h-3 w-3 animate-spin" />Generating Audio</Badge>;
      case "completed":
        return <Badge className="gap-1 bg-green-500"><CheckCircle2 className="h-3 w-3" />Completed</Badge>;
      case "failed":
        return <Badge variant="destructive" className="gap-1"><AlertCircle className="h-3 w-3" />Failed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
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
                        {getStatusBadge(job.status)}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {job.occasion} • {job.genre} • {job.customerName}
                      </p>
                      {job.startedAt && (
                        <p className="text-xs text-muted-foreground">
                          Started {formatDistanceToNow(new Date(job.startedAt), { addSuffix: true })}
                        </p>
                      )}
                      {job.error && (
                        <p className="text-sm text-red-600 mt-2">
                          Error: {job.error}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {job.lyrics && (
                        <Button variant="outline" size="sm" onClick={() => setViewingLyrics(job)}>
                          <Eye className="h-4 w-4 mr-1" />
                          Lyrics
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
