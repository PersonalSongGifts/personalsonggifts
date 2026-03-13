import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Loader2, RefreshCw, Mail, Video, ChevronDown, ChevronUp, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface Order {
  id: string;
  reaction_email_24h_sent_at?: string | null;
  reaction_email_72h_sent_at?: string | null;
  reaction_submitted_at?: string | null;
  delivered_at?: string | null;
  dismissed_at?: string | null;
  status?: string;
}

interface Props {
  adminPassword: string;
  allOrders: Order[];
}

// 24h email preview HTML
const email24hPreview = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#ffffff;font-family:Arial,Helvetica,sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:40px 20px;">
<p style="font-size:16px;line-height:1.6;color:#222;margin:0 0 16px 0;">Hi Sarah,</p>
<p style="font-size:16px;line-height:1.6;color:#222;margin:0 0 16px 0;">We hope Mom loved their song! One of the best parts of what we do is seeing the moment someone hears their personalized song for the first time.</p>
<p style="font-size:16px;line-height:1.6;color:#222;margin:0 0 16px 0;">If you captured that reaction on video, we'd love to see it. And if we feature your video, we'll send you a $50 gift card as a thank you.</p>
<p style="font-size:16px;line-height:1.6;color:#222;margin:0 0 8px 0;">Submit your video here:</p>
<p style="font-size:16px;line-height:1.6;color:#222;margin:0 0 24px 0;"><a href="#" style="color:#1a73e8;">https://personalsonggifts.lovable.app/share-reaction</a></p>
<p style="font-size:16px;line-height:1.6;color:#222;margin:0 0 32px 0;">No editing needed — phone recordings are perfect.</p>
<p style="font-size:16px;line-height:1.6;color:#222;margin:0 0 32px 0;">Warmly,<br>The Personal Song Gifts Team</p>
<p style="font-size:12px;color:#888;margin:0;">Personal Song Gifts &middot; 2108 N ST STE N, Sacramento, CA 95816<br><a href="#" style="color:#888;">Unsubscribe</a></p>
</div>
</body>
</html>`;

// 72h email preview HTML
const email72hPreview = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#ffffff;font-family:Arial,Helvetica,sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:40px 20px;">
<p style="font-size:16px;line-height:1.6;color:#222;margin:0 0 16px 0;">Hi Sarah,</p>
<p style="font-size:16px;line-height:1.6;color:#222;margin:0 0 16px 0;">One last thought — we recently featured a video from Bethany, who ordered a song for her mom's birthday. She recorded the moment her mom heard it for the first time, and the reaction was beautiful. We featured it on our site, and Bethany earned a $50 gift card.</p>
<p style="font-size:16px;line-height:1.6;color:#222;margin:0 0 16px 0;">If you have a reaction video of Mom hearing their song, we'd genuinely love to see it.</p>
<p style="font-size:16px;line-height:1.6;color:#222;margin:0 0 8px 0;">Submit your video here:</p>
<p style="font-size:16px;line-height:1.6;color:#222;margin:0 0 24px 0;"><a href="#" style="color:#1a73e8;">https://personalsonggifts.lovable.app/share-reaction</a></p>
<p style="font-size:16px;line-height:1.6;color:#222;margin:0 0 32px 0;">Warmly,<br>The Personal Song Gifts Team</p>
<p style="font-size:12px;color:#888;margin:0;">Personal Song Gifts &middot; 2108 N ST STE N, Sacramento, CA 95816<br><a href="#" style="color:#888;">Unsubscribe</a></p>
</div>
</body>
</html>`;

export function ReactionEmailPanel({ adminPassword, allOrders }: Props) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [cutoffDays, setCutoffDays] = useState(10);
  const [editingCutoff, setEditingCutoff] = useState(false);
  const [cutoffInput, setCutoffInput] = useState("10");
  const [savingCutoff, setSavingCutoff] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [show24hPreview, setShow24hPreview] = useState(false);
  const [show72hPreview, setShow72hPreview] = useState(false);
  const { toast } = useToast();

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

  const fetchSetting = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/automation-get-settings`, {
        method: "GET",
        headers: { "x-admin-password": adminPassword },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setEnabled(data.reaction_email_enabled === "true");
      const days = parseInt(data.reaction_email_cutoff_days || "10", 10);
      setCutoffDays(days);
      setCutoffInput(String(days));
    } catch (err) {
      console.error("Failed to fetch reaction email setting:", err);
      setEnabled(false);
    } finally {
      setLoading(false);
    }
  }, [adminPassword, supabaseUrl]);

  useEffect(() => {
    fetchSetting();
  }, [fetchSetting]);

  const handleToggle = async (newValue: boolean) => {
    setToggling(true);
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/automation-get-settings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-password": adminPassword,
        },
        body: JSON.stringify({
          key: "reaction_email_enabled",
          value: newValue ? "true" : "false",
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setEnabled(newValue);
      toast({
        title: newValue ? "Reaction Emails Enabled" : "Reaction Emails Paused",
        description: newValue
          ? "24h + 72h reaction video emails will fire automatically after delivery."
          : "No reaction video emails will be sent until re-enabled.",
      });
    } catch (err) {
      toast({ title: "Failed to update", description: String(err), variant: "destructive" });
    } finally {
      setToggling(false);
    }
  };

  const handleSaveCutoff = async () => {
    const days = parseInt(cutoffInput, 10);
    if (isNaN(days) || days < 1 || days > 90) {
      toast({ title: "Invalid value", description: "Enter a number between 1 and 90.", variant: "destructive" });
      return;
    }
    setSavingCutoff(true);
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/automation-get-settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-password": adminPassword },
        body: JSON.stringify({ key: "reaction_email_cutoff_days", value: String(days) }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setCutoffDays(days);
      setEditingCutoff(false);
      toast({ title: "Cutoff Updated", description: `Reaction emails now target orders from the last ${days} days.` });
    } catch (err) {
      toast({ title: "Failed to save", description: String(err), variant: "destructive" });
    } finally {
      setSavingCutoff(false);
    }
  };

  // Compute stats from allOrders
  const sent24h = allOrders.filter((o) => (o as any).reaction_email_24h_sent_at).length;
  const sent72h = allOrders.filter((o) => (o as any).reaction_email_72h_sent_at).length;
  const reactionsReceived = allOrders.filter((o) => o.reaction_submitted_at).length;

  const now = Date.now();
  const cutoffMs = now - cutoffDays * 24 * 60 * 60 * 1000;
  const eligible = allOrders.filter(
    (o) =>
      o.status === "delivered" &&
      o.delivered_at &&
      !o.reaction_submitted_at &&
      !(o as any).reaction_email_24h_sent_at &&
      !o.dismissed_at &&
      new Date(o.delivered_at).getTime() < now - 24 * 60 * 60 * 1000 &&
      new Date(o.delivered_at).getTime() > cutoffMs
  ).length;

  const isEnabled = enabled === true;

  return (
    <Card className="border border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Video className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Reaction Video Emails</CardTitle>
          </div>
          <div className="flex items-center gap-3">
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <Switch
                    id="reaction-email-toggle"
                    checked={isEnabled}
                    onCheckedChange={handleToggle}
                    disabled={toggling}
                  />
                  <Label htmlFor="reaction-email-toggle" className="text-sm cursor-pointer">
                    {toggling ? (
                      <Loader2 className="h-3 w-3 animate-spin inline" />
                    ) : isEnabled ? (
                      "Enabled"
                    ) : (
                      "Paused"
                    )}
                  </Label>
                </div>
                <Badge
                  className={
                    isEnabled
                      ? "bg-green-600 text-white border-0"
                      : "bg-yellow-100 text-yellow-800 border-yellow-300"
                  }
                >
                  {isEnabled ? "Active" : "Paused"}
                </Badge>
              </>
            )}
            <Button variant="ghost" size="sm" onClick={fetchSetting} disabled={loading}>
              <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Sends two emails after song delivery (24h + 72h) asking customers to submit reaction videos. 
          Only targets orders delivered within the last <strong>{cutoffDays} days</strong>. Defaults to <strong>OFF</strong>. Max 5 per phase per cron run. Skips orders with existing reactions or suppressed emails.
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Stats Row */}
        <div className="grid grid-cols-4 gap-3">
          <div className="rounded-lg border bg-muted/30 p-3 text-center">
            <div className="text-2xl font-bold text-foreground">{eligible}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Eligible Now</div>
          </div>
          <div className="rounded-lg border bg-muted/30 p-3 text-center">
            <div className="text-2xl font-bold text-foreground">{sent24h}</div>
            <div className="text-xs text-muted-foreground mt-0.5">24h Sent</div>
          </div>
          <div className="rounded-lg border bg-muted/30 p-3 text-center">
            <div className="text-2xl font-bold text-foreground">{sent72h}</div>
            <div className="text-xs text-muted-foreground mt-0.5">72h Sent</div>
          </div>
          <div className="rounded-lg border bg-muted/30 p-3 text-center">
            <div className="text-2xl font-bold text-green-600">{reactionsReceived}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Reactions</div>
          </div>
        </div>

        {/* Cutoff Setting */}
        <div className="flex items-center gap-2 rounded-lg border bg-muted/30 p-3">
          <Settings2 className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-sm text-muted-foreground">Lookback window:</span>
          {editingCutoff ? (
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                max={90}
                value={cutoffInput}
                onChange={(e) => setCutoffInput(e.target.value)}
                className="w-16 h-7 text-sm"
              />
              <span className="text-sm text-muted-foreground">days</span>
              <Button size="sm" variant="default" className="h-7 text-xs" onClick={handleSaveCutoff} disabled={savingCutoff}>
                {savingCutoff ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setEditingCutoff(false); setCutoffInput(String(cutoffDays)); }}>
                Cancel
              </Button>
            </div>
          ) : (
            <button
              onClick={() => setEditingCutoff(true)}
              className="text-sm font-medium text-foreground underline decoration-dashed underline-offset-2 cursor-pointer hover:text-primary"
            >
              {cutoffDays} days
            </button>
          )}
        </div>

        {/* Email Previews */}
        <div className="space-y-2">
          <Collapsible open={show24hPreview} onOpenChange={setShow24hPreview}>
            <CollapsibleTrigger asChild>
              <Button variant="outline" size="sm" className="w-full justify-between text-xs">
                <span className="flex items-center gap-2">
                  <Mail className="h-3 w-3" />
                  Preview: 24h Email — "Got your song? We'd love to see the reaction 🎵"
                </span>
                {show24hPreview ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="border rounded-lg overflow-hidden bg-muted/30 mt-2">
                <iframe
                  srcDoc={email24hPreview}
                  title="24h Reaction Email Preview"
                  className="w-full h-[400px] border-0"
                  sandbox="allow-same-origin"
                />
              </div>
            </CollapsibleContent>
          </Collapsible>

          <Collapsible open={show72hPreview} onOpenChange={setShow72hPreview}>
            <CollapsibleTrigger asChild>
              <Button variant="outline" size="sm" className="w-full justify-between text-xs">
                <span className="flex items-center gap-2">
                  <Mail className="h-3 w-3" />
                  Preview: 72h Email — "One more nudge (+ how Bethany earned $50...)"
                </span>
                {show72hPreview ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="border rounded-lg overflow-hidden bg-muted/30 mt-2">
                <iframe
                  srcDoc={email72hPreview}
                  title="72h Reaction Email Preview"
                  className="w-full h-[400px] border-0"
                  sandbox="allow-same-origin"
                />
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </CardContent>
    </Card>
  );
}
