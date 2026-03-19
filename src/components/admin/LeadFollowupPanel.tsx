import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Mail, Send, Users, CheckCircle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface LeadFollowupPanelProps {
  adminPassword: string;
}

export function LeadFollowupPanel({ adminPassword }: LeadFollowupPanelProps) {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [sendingBatch, setSendingBatch] = useState(false);
  const [showBatchConfirm, setShowBatchConfirm] = useState(false);
  const [lastBatchResult, setLastBatchResult] = useState<number | null>(null);
  const [stats, setStats] = useState<{ eligible: number; sent: number; conversions: number } | null>(null);
  const { toast } = useToast();

  const fetchStats = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("admin-orders", {
        method: "POST",
        body: { action: "get_lead_followup_stats", adminPassword },
      });
      if (error) throw error;
      setStats(data);
    } catch (e) {
      console.error("Failed to fetch followup stats:", e);
    }
  };

  const fetchSettings = async () => {
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/automation-get-settings`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "x-admin-password": adminPassword,
          },
        }
      );
      if (response.ok) {
        const settings = await response.json();
        setEnabled(settings.lead_followup_enabled === "true");
      }
    } catch (e) {
      console.error("Failed to fetch settings:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
    fetchStats();
  }, []);

  const handleToggle = async (newValue: boolean) => {
    setToggling(true);
    try {
      const { error } = await supabase.functions.invoke("admin-orders", {
        method: "POST",
        body: { action: "set_lead_followup_enabled", adminPassword, enabled: newValue },
      });
      if (error) throw error;
      setEnabled(newValue);
      toast({
        title: newValue ? "Follow-up automation enabled" : "Follow-up automation disabled",
        description: newValue
          ? "The cron will now send follow-up emails to eligible leads."
          : "Follow-up automation is paused.",
      });
    } catch (e) {
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : "Failed to update setting",
        variant: "destructive",
      });
    } finally {
      setToggling(false);
    }
  };

  const handleBatchSend = async () => {
    setShowBatchConfirm(false);
    setSendingBatch(true);
    setLastBatchResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("admin-orders", {
        method: "POST",
        body: { action: "send_batch_followup", adminPassword },
      });
      if (error) throw error;
      const count = data?.sent || 0;
      setLastBatchResult(count);
      toast({
        title: "Batch complete",
        description: `Sent ${count} follow-up email${count !== 1 ? "s" : ""}.`,
      });
      fetchStats();
    } catch (e) {
      toast({
        title: "Batch failed",
        description: e instanceof Error ? e.message : "Failed to send batch",
        variant: "destructive",
      });
    } finally {
      setSendingBatch(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Lead Follow-up Emails
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Toggle */}
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="followup-toggle" className="text-sm font-medium">
                Automated follow-up (cron)
              </Label>
              <p className="text-xs text-muted-foreground">
                Sends up to 10 follow-up emails per cron run to leads who played their preview
              </p>
            </div>
            <Switch
              id="followup-toggle"
              checked={enabled}
              onCheckedChange={handleToggle}
              disabled={loading || toggling}
            />
          </div>

          {/* Stats */}
          {stats && (
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <Users className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                <p className="text-2xl font-bold">{stats.eligible}</p>
                <p className="text-xs text-muted-foreground">Eligible now</p>
              </div>
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <Send className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                <p className="text-2xl font-bold">{stats.sent}</p>
                <p className="text-xs text-muted-foreground">Sent all time</p>
              </div>
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <CheckCircle className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                <p className="text-2xl font-bold">{stats.conversions}</p>
                <p className="text-xs text-muted-foreground">Conversions</p>
              </div>
            </div>
          )}

          {/* Batch Send */}
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              onClick={() => setShowBatchConfirm(true)}
              disabled={sendingBatch}
            >
              {sendingBatch ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sending batch...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Send Batch Follow-up
                </>
              )}
            </Button>
            {lastBatchResult !== null && (
              <Badge variant="secondary">
                {lastBatchResult} sent
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={showBatchConfirm} onOpenChange={setShowBatchConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send Batch Follow-up</AlertDialogTitle>
            <AlertDialogDescription>
              This will send up to 50 follow-up emails to leads who played their preview but never purchased. Continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleBatchSend}>
              Send Batch
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
