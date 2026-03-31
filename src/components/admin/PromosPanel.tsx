import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Pencil, Play, Eye, Power, PowerOff, Loader2, Mail } from "lucide-react";

interface Promo {
  id: string;
  name: string;
  slug: string;
  standard_price_cents: number;
  priority_price_cents: number;
  lead_price_cents: number;
  starts_at: string;
  ends_at: string;
  is_active: boolean;
  show_banner: boolean;
  banner_text: string | null;
  banner_emoji: string | null;
  banner_bg_color: string | null;
  banner_text_color: string | null;
  email_leads: boolean;
  email_leads_days: number;
  email_subject: string | null;
  email_body_template: string | null;
  email_batch_sent: number;
  email_batch_total: number;
  created_at: string;
  computed_status: string;
}

interface PromoFormData {
  id?: string;
  name: string;
  slug: string;
  standard_price_dollars: string;
  priority_price_dollars: string;
  lead_price_dollars: string;
  starts_at: string;
  ends_at: string;
  is_active: boolean;
  show_banner: boolean;
  banner_text: string;
  banner_emoji: string;
  banner_bg_color: string;
  banner_text_color: string;
  email_leads: boolean;
  email_leads_days: string;
  email_subject: string;
  email_body_template: string;
}

const emptyForm: PromoFormData = {
  name: "",
  slug: "",
  standard_price_dollars: "24.99",
  priority_price_dollars: "34.99",
  lead_price_dollars: "24.99",
  starts_at: "",
  ends_at: "",
  is_active: false,
  show_banner: true,
  banner_text: "",
  banner_emoji: "🐣",
  banner_bg_color: "",
  banner_text_color: "",
  email_leads: false,
  email_leads_days: "30",
  email_subject: "",
  email_body_template: "",
};

function statusBadge(status: string) {
  switch (status) {
    case "active": return <Badge className="bg-green-500 text-white">Active</Badge>;
    case "upcoming": return <Badge className="bg-yellow-500 text-white">Upcoming</Badge>;
    case "expired": return <Badge variant="destructive">Expired</Badge>;
    default: return <Badge variant="secondary">Inactive</Badge>;
  }
}

function formatCents(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function toLocalDatetime(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  const offset = d.getTimezoneOffset();
  const local = new Date(d.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
}

export function PromosPanel({ adminPassword }: { adminPassword: string }) {
  const [promos, setPromos] = useState<Promo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<PromoFormData>({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [toggleConfirm, setToggleConfirm] = useState<Promo | null>(null);
  const [dryRunResult, setDryRunResult] = useState<{ eligibleCount: number; sampleEmails: string[] } | null>(null);
  const [dryRunning, setDryRunning] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendConfirm, setSendConfirm] = useState<Promo | null>(null);
  const { toast } = useToast();

  const fetchPromos = useCallback(async () => {
    setLoading(true);
    try {
      const res = await supabase.functions.invoke("admin-promos", {
        headers: { "x-admin-password": adminPassword },
        body: { action: "list" },
      });
      if (res.error) throw res.error;
      setPromos(res.data?.promos || []);
    } catch (err: any) {
      toast({ title: "Error loading promos", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [adminPassword, toast]);

  useEffect(() => { fetchPromos(); }, [fetchPromos]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const promoData: any = {
        name: form.name,
        slug: form.slug,
        standard_price_cents: Math.round(parseFloat(form.standard_price_dollars) * 100),
        priority_price_cents: Math.round(parseFloat(form.priority_price_dollars) * 100),
        lead_price_cents: Math.round(parseFloat(form.lead_price_dollars) * 100),
        starts_at: new Date(form.starts_at).toISOString(),
        ends_at: new Date(form.ends_at).toISOString(),
        is_active: form.is_active,
        show_banner: form.show_banner,
        banner_text: form.banner_text || null,
        banner_emoji: form.banner_emoji || null,
        banner_bg_color: form.banner_bg_color || null,
        banner_text_color: form.banner_text_color || null,
        email_leads: form.email_leads,
        email_leads_days: parseInt(form.email_leads_days) || 30,
        email_subject: form.email_subject || null,
        email_body_template: form.email_body_template || null,
      };
      if (form.id) promoData.id = form.id;

      const res = await supabase.functions.invoke("admin-promos", {
        method: "POST",
        headers: { "x-admin-password": adminPassword },
        body: { action: "upsert", promo: promoData },
      });
      if (res.error) throw res.error;
      if (res.data?.error) throw new Error(res.data.error);

      toast({ title: form.id ? "Promo updated" : "Promo created" });
      setShowForm(false);
      setForm({ ...emptyForm });
      fetchPromos();
    } catch (err: any) {
      toast({ title: "Error saving promo", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (promo: Promo) => {
    try {
      const res = await supabase.functions.invoke("admin-promos", {
        method: "POST",
        headers: { "x-admin-password": adminPassword },
        body: { action: "toggle_active", id: promo.id, is_active: !promo.is_active },
      });
      if (res.error) throw res.error;
      if (res.data?.error) throw new Error(res.data.error);

      toast({ title: promo.is_active ? "Promo deactivated" : "Promo activated" });
      fetchPromos();
    } catch (err: any) {
      toast({ title: "Error toggling promo", description: err.message, variant: "destructive" });
    } finally {
      setToggleConfirm(null);
    }
  };

  const handleDryRun = async (promo: Promo) => {
    setDryRunning(true);
    setDryRunResult(null);
    try {
      const res = await supabase.functions.invoke("admin-promos", {
        method: "POST",
        headers: { "x-admin-password": adminPassword },
        body: { action: "dry_run_lead_emails", promo_id: promo.id },
      });
      if (res.error) throw res.error;
      if (res.data?.error) throw new Error(res.data.error);
      setDryRunResult(res.data);
    } catch (err: any) {
      toast({ title: "Dry run error", description: err.message, variant: "destructive" });
    } finally {
      setDryRunning(false);
    }
  };

  const handleSendEmails = async (promo: Promo) => {
    setSending(true);
    setSendConfirm(null);
    try {
      const res = await supabase.functions.invoke("admin-promos", {
        method: "POST",
        headers: { "x-admin-password": adminPassword },
        body: { action: "send_lead_emails", promo_id: promo.id },
      });
      if (res.error) throw res.error;
      if (res.data?.error) throw new Error(res.data.error);
      toast({ title: `Sent ${res.data.sent} of ${res.data.total} emails` });
      fetchPromos();
    } catch (err: any) {
      toast({ title: "Send error", description: err.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const editPromo = (promo: Promo) => {
    setForm({
      id: promo.id,
      name: promo.name,
      slug: promo.slug,
      standard_price_dollars: (promo.standard_price_cents / 100).toFixed(2),
      priority_price_dollars: (promo.priority_price_cents / 100).toFixed(2),
      lead_price_dollars: (promo.lead_price_cents / 100).toFixed(2),
      starts_at: toLocalDatetime(promo.starts_at),
      ends_at: toLocalDatetime(promo.ends_at),
      is_active: promo.is_active,
      show_banner: promo.show_banner,
      banner_text: promo.banner_text || "",
      banner_emoji: promo.banner_emoji || "",
      banner_bg_color: promo.banner_bg_color || "",
      banner_text_color: promo.banner_text_color || "",
      email_leads: promo.email_leads,
      email_leads_days: String(promo.email_leads_days),
      email_subject: promo.email_subject || "",
      email_body_template: promo.email_body_template || "",
    });
    setShowForm(true);
    setDryRunResult(null);
  };

  const autoSlug = (name: string) => {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Promotions</h2>
        <Button onClick={() => { setForm({ ...emptyForm }); setShowForm(true); setDryRunResult(null); }}>
          <Plus className="h-4 w-4 mr-2" /> New Promo
        </Button>
      </div>

      {/* Promo List */}
      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="animate-spin h-4 w-4" /> Loading...</div>
      ) : promos.length === 0 ? (
        <p className="text-muted-foreground">No promotions yet. Create your first one!</p>
      ) : (
        <div className="space-y-3">
          {promos.map((promo) => (
            <Card key={promo.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CardTitle className="text-base">{promo.banner_emoji} {promo.name}</CardTitle>
                    {statusBadge(promo.computed_status)}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => editPromo(promo)}>
                      <Pencil className="h-3 w-3 mr-1" /> Edit
                    </Button>
                    <Button
                      variant={promo.is_active ? "destructive" : "default"}
                      size="sm"
                      onClick={() => setToggleConfirm(promo)}
                    >
                      {promo.is_active ? <PowerOff className="h-3 w-3 mr-1" /> : <Power className="h-3 w-3 mr-1" />}
                      {promo.is_active ? "Deactivate" : "Activate"}
                    </Button>
                  </div>
                </div>
                <CardDescription>
                  Slug: {promo.slug} · {formatCents(promo.standard_price_cents)} / {formatCents(promo.priority_price_cents)} / Lead: {formatCents(promo.lead_price_cents)}
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="text-sm text-muted-foreground space-y-1">
                  <p>
                    {new Date(promo.starts_at).toLocaleString()} → {new Date(promo.ends_at).toLocaleString()}
                  </p>
                  {promo.banner_text && <p>Banner: "{promo.banner_text}"</p>}
                  {promo.email_batch_total > 0 && (
                    <div className="space-y-1">
                      <p>Email blast: {promo.email_batch_sent} / {promo.email_batch_total} sent</p>
                      <Progress value={(promo.email_batch_sent / promo.email_batch_total) * 100} className="h-2" />
                    </div>
                  )}
                </div>
                {/* Email Actions */}
                <div className="flex items-center gap-2 mt-3">
                  <Button variant="outline" size="sm" onClick={() => handleDryRun(promo)} disabled={dryRunning}>
                    {dryRunning ? <Loader2 className="animate-spin h-3 w-3 mr-1" /> : <Eye className="h-3 w-3 mr-1" />}
                    Dry Run
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setSendConfirm(promo)} disabled={sending}>
                    {sending ? <Loader2 className="animate-spin h-3 w-3 mr-1" /> : <Mail className="h-3 w-3 mr-1" />}
                    Send Lead Emails
                  </Button>
                </div>
                {dryRunResult && (
                  <div className="mt-3 p-3 bg-muted rounded-md text-sm space-y-1">
                    <p className="font-medium">Dry Run Result: {dryRunResult.eligibleCount} eligible leads</p>
                    {dryRunResult.sampleEmails.length > 0 && (
                      <p className="text-muted-foreground">
                        Sample: {dryRunResult.sampleEmails.join(", ")}
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Form */}
      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>{form.id ? "Edit Promo" : "New Promo"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Name</Label>
                <Input
                  value={form.name}
                  onChange={(e) => {
                    const name = e.target.value;
                    setForm(f => ({ ...f, name, slug: f.id ? f.slug : autoSlug(name) }));
                  }}
                  placeholder="Easter Flash Sale"
                />
              </div>
              <div>
                <Label>Slug (URL-safe)</Label>
                <Input
                  value={form.slug}
                  onChange={(e) => setForm(f => ({ ...f, slug: e.target.value }))}
                  placeholder="easter-2026"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Standard Price ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.standard_price_dollars}
                  onChange={(e) => setForm(f => ({ ...f, standard_price_dollars: e.target.value }))}
                />
              </div>
              <div>
                <Label>Priority Price ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.priority_price_dollars}
                  onChange={(e) => setForm(f => ({ ...f, priority_price_dollars: e.target.value }))}
                />
              </div>
              <div>
                <Label>Lead Price ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.lead_price_dollars}
                  onChange={(e) => setForm(f => ({ ...f, lead_price_dollars: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Starts At</Label>
                <Input
                  type="datetime-local"
                  value={form.starts_at}
                  onChange={(e) => setForm(f => ({ ...f, starts_at: e.target.value }))}
                />
              </div>
              <div>
                <Label>Ends At</Label>
                <Input
                  type="datetime-local"
                  value={form.ends_at}
                  onChange={(e) => setForm(f => ({ ...f, ends_at: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Banner Emoji</Label>
                <Input
                  value={form.banner_emoji}
                  onChange={(e) => setForm(f => ({ ...f, banner_emoji: e.target.value }))}
                  placeholder="🐣"
                />
              </div>
              <div>
                <Label>Banner Text</Label>
                <Input
                  value={form.banner_text}
                  onChange={(e) => setForm(f => ({ ...f, banner_text: e.target.value }))}
                  placeholder="Easter Flash Sale — Songs from $24.99!"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Banner Background Color</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={form.banner_bg_color || "#8B5CF6"}
                    onChange={(e) => setForm(f => ({ ...f, banner_bg_color: e.target.value }))}
                    className="h-10 w-12 rounded border border-input cursor-pointer"
                  />
                  <Input
                    value={form.banner_bg_color}
                    onChange={(e) => setForm(f => ({ ...f, banner_bg_color: e.target.value }))}
                    placeholder="#8B5CF6"
                    className="flex-1"
                  />
                  {form.banner_bg_color && (
                    <Button variant="ghost" size="sm" onClick={() => setForm(f => ({ ...f, banner_bg_color: "" }))}>
                      Reset
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Leave empty for default theme color</p>
              </div>
              <div>
                <Label>Banner Text Color</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={form.banner_text_color || "#FFFFFF"}
                    onChange={(e) => setForm(f => ({ ...f, banner_text_color: e.target.value }))}
                    className="h-10 w-12 rounded border border-input cursor-pointer"
                  />
                  <Input
                    value={form.banner_text_color}
                    onChange={(e) => setForm(f => ({ ...f, banner_text_color: e.target.value }))}
                    placeholder="#FFFFFF"
                    className="flex-1"
                  />
                  {form.banner_text_color && (
                    <Button variant="ghost" size="sm" onClick={() => setForm(f => ({ ...f, banner_text_color: "" }))}>
                      Reset
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Leave empty for default theme color</p>
              </div>
            </div>

            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Switch checked={form.show_banner} onCheckedChange={(v) => setForm(f => ({ ...f, show_banner: v }))} />
                <Label>Show Banner</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.email_leads} onCheckedChange={(v) => setForm(f => ({ ...f, email_leads: v }))} />
                <Label>Enable Email Blast</Label>
              </div>
            </div>

            {form.email_leads && (
              <div className="space-y-4 p-4 border rounded-md">
                <h4 className="font-medium">Email Blast Settings</h4>
                <div>
                  <Label>Email leads from the past N days</Label>
                  <Input
                    type="number"
                    value={form.email_leads_days}
                    onChange={(e) => setForm(f => ({ ...f, email_leads_days: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>Email Subject</Label>
                  <Input
                    value={form.email_subject}
                    onChange={(e) => setForm(f => ({ ...f, email_subject: e.target.value }))}
                    placeholder="🐣 {{recipient_name}}'s song is ready — Easter special!"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Variables: {"{{customer_name}}"}, {"{{recipient_name}}"}</p>
                </div>
                <div>
                  <Label>Email Body (HTML)</Label>
                  <Textarea
                    rows={8}
                    value={form.email_body_template}
                    onChange={(e) => setForm(f => ({ ...f, email_body_template: e.target.value }))}
                    placeholder={`<p>Hi {{customer_name}},</p>\n<p>{{recipient_name}}'s song is ready! Listen to a preview:</p>\n<p><a href="{{cta_url}}">{{cta_url}}</a></p>`}
                  />
                  <p className="text-xs text-muted-foreground mt-1">Variables: {"{{customer_name}}"}, {"{{recipient_name}}"}, {"{{cta_url}}"}</p>
                </div>
              </div>
            )}

            <div className="flex items-center gap-3">
              <Button onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="animate-spin h-4 w-4 mr-2" /> : null}
                {form.id ? "Update Promo" : "Create Promo"}
              </Button>
              <Button variant="outline" onClick={() => { setShowForm(false); setForm({ ...emptyForm }); }}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Toggle Confirmation Dialog */}
      <AlertDialog open={!!toggleConfirm} onOpenChange={() => setToggleConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {toggleConfirm?.is_active ? "Deactivate" : "Activate"} "{toggleConfirm?.name}"?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {toggleConfirm?.is_active
                ? "This will immediately stop the promotion. All pages will revert to normal pricing within 60 seconds."
                : "This will enable the promotion. Prices will update across the site within 60 seconds. Only one promo can be active at a time."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => toggleConfirm && handleToggle(toggleConfirm)}>
              {toggleConfirm?.is_active ? "Deactivate" : "Activate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Send Emails Confirmation */}
      <AlertDialog open={!!sendConfirm} onOpenChange={() => setSendConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send promo emails for "{sendConfirm?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This will email all eligible unconverted leads. Run a dry run first to see the count. Existing customers will NOT receive emails.
              You can stop the blast by deactivating the promo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => sendConfirm && handleSendEmails(sendConfirm)}>
              Send Emails
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
