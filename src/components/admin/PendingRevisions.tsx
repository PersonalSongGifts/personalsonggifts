import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, RefreshCw, CheckCircle, XCircle, Pencil, Clock, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { formatAdminDate } from "@/lib/utils";

interface PendingRevisionsProps {
  adminPassword: string;
}

interface RevisionRequest {
  id: string;
  order_id: string;
  submitted_at: string;
  status: string;
  is_pre_delivery: boolean;
  changes_summary: string;
  fields_changed: string[];
  original_values: Record<string, any>;
  // Submitted values
  recipient_name: string | null;
  customer_name: string | null;
  delivery_email: string | null;
  recipient_type: string | null;
  occasion: string | null;
  genre: string | null;
  singer_preference: string | null;
  language: string | null;
  recipient_name_pronunciation: string | null;
  special_qualities: string | null;
  favorite_memory: string | null;
  special_message: string | null;
  style_notes: string | null;
  tempo: string | null;
  anything_else: string | null;
  // Order context
  order_short_id?: string;
  order_recipient_name?: string;
  order_customer_name?: string;
  order_customer_email?: string;
  order_occasion?: string;
  order_status?: string;
}

const EDITABLE_FIELDS = [
  { key: "recipient_name", label: "Recipient Name" },
  { key: "customer_name", label: "Your Name" },
  { key: "delivery_email", label: "Delivery Email" },
  { key: "recipient_type", label: "Relationship" },
  { key: "occasion", label: "Occasion" },
  { key: "genre", label: "Genre" },
  { key: "singer_preference", label: "Singer" },
  { key: "language", label: "Language" },
  { key: "recipient_name_pronunciation", label: "Pronunciation" },
  { key: "special_qualities", label: "Special Qualities" },
  { key: "favorite_memory", label: "Favorite Memory" },
  { key: "special_message", label: "Special Message" },
  { key: "style_notes", label: "Style Notes" },
  { key: "tempo", label: "Tempo" },
  { key: "anything_else", label: "Anything Else" },
];

export function PendingRevisions({ adminPassword }: PendingRevisionsProps) {
  const [revisions, setRevisions] = useState<RevisionRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedRevision, setSelectedRevision] = useState<RevisionRequest | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [processing, setProcessing] = useState(false);
  const { toast } = useToast();

  const fetchRevisions = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-orders", {
        method: "POST",
        body: { action: "list_pending_revisions", adminPassword },
      });
      if (error) throw error;
      setRevisions(data.revisions || []);
    } catch (err) {
      toast({ title: "Failed to load revisions", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [adminPassword, toast]);

  useEffect(() => { fetchRevisions(); }, [fetchRevisions]);

  const handleAction = useCallback(async (revisionId: string, action: "approve" | "reject", rejectionReason?: string) => {
    setProcessing(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-orders", {
        method: "POST",
        body: {
          action: "review_revision",
          adminPassword,
          revisionId,
          decision: action,
          rejectionReason: rejectionReason || undefined,
        },
      });
      if (error) throw error;
      toast({ title: action === "approve" ? "Revision approved" : "Revision rejected", description: data.message || "Done" });
      setSelectedRevision(null);
      setShowRejectDialog(false);
      setRejectReason("");
      fetchRevisions();
    } catch (err) {
      toast({ title: "Action failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setProcessing(false);
    }
  }, [adminPassword, toast, fetchRevisions]);

  const renderChangedField = (rev: RevisionRequest, fieldKey: string) => {
    const field = EDITABLE_FIELDS.find(f => f.key === fieldKey);
    if (!field) return null;
    const oldVal = rev.original_values?.[fieldKey] ?? "—";
    const newVal = (rev as any)[fieldKey] ?? "—";
    if (oldVal === newVal) return null;

    return (
      <div key={fieldKey} className="border-b border-border/50 pb-2 mb-2 last:border-0">
        <span className="text-xs font-medium text-muted-foreground">{field.label}</span>
        <div className="grid grid-cols-2 gap-2 mt-1">
          <div className="text-xs">
            <span className="text-muted-foreground">Was: </span>
            <span className="line-through text-destructive/70">{String(oldVal).substring(0, 200)}</span>
          </div>
          <div className="text-xs">
            <span className="text-muted-foreground">Now: </span>
            <span className="font-medium text-primary">{String(newVal).substring(0, 200)}</span>
          </div>
        </div>
      </div>
    );
  };

  if (revisions.length === 0 && !loading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Pending Revisions</CardTitle>
            <Button variant="ghost" size="sm" onClick={fetchRevisions} disabled={loading}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No pending revision requests.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CardTitle className="text-lg">Pending Revisions</CardTitle>
              {revisions.length > 0 && (
                <Badge variant="destructive" className="rounded-full">{revisions.length}</Badge>
              )}
            </div>
            <Button variant="ghost" size="sm" onClick={fetchRevisions} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {revisions.map((rev) => (
            <div key={rev.id} className="border rounded-lg overflow-hidden">
              {/* Summary row */}
              <div
                className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => setExpandedId(expandedId === rev.id ? null : rev.id)}
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <Badge variant={rev.is_pre_delivery ? "secondary" : "default"} className="shrink-0 text-xs">
                    {rev.is_pre_delivery ? "Pre-delivery" : "Redo"}
                  </Badge>
                  <div className="min-w-0">
                    <span className="font-mono text-xs text-muted-foreground">{rev.order_short_id}</span>
                    <span className="mx-1 text-muted-foreground">·</span>
                    <span className="text-sm font-medium">{rev.order_recipient_name || "Unknown"}</span>
                    {rev.order_customer_email && (
                      <>
                        <span className="mx-1 text-muted-foreground">·</span>
                        <span className="text-xs text-muted-foreground">{rev.order_customer_email}</span>
                      </>
                    )}
                    <span className="mx-1 text-muted-foreground">·</span>
                    <span className="text-xs text-muted-foreground">{rev.fields_changed?.length || 0} field{(rev.fields_changed?.length || 0) !== 1 ? "s" : ""} changed</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-muted-foreground">{formatAdminDate(rev.submitted_at)}</span>
                  {expandedId === rev.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </div>
              </div>

              {/* Expanded detail */}
              {expandedId === rev.id && (
                <div className="border-t p-3 space-y-3 bg-muted/20">
                  {rev.changes_summary && (
                    <p className="text-xs text-muted-foreground italic">{rev.changes_summary}</p>
                  )}
                  
                  <div className="space-y-1">
                    {(rev.fields_changed || []).map(fieldKey => renderChangedField(rev, fieldKey))}
                  </div>

                  {rev.anything_else && (
                    <div className="bg-background border rounded p-2">
                      <span className="text-xs font-medium text-muted-foreground">Customer notes:</span>
                      <p className="text-sm mt-1">{rev.anything_else}</p>
                    </div>
                  )}

                  <div className="flex gap-2 pt-2">
                    <Button
                      size="sm"
                      onClick={() => handleAction(rev.id, "approve")}
                      disabled={processing}
                      className="gap-1"
                    >
                      {processing ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3" />}
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => { setSelectedRevision(rev); setShowRejectDialog(true); }}
                      disabled={processing}
                      className="gap-1"
                    >
                      <XCircle className="h-3 w-3" />
                      Reject
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => window.open(`/song/revision/${rev.order_id}`, "_blank")}
                      className="gap-1 ml-auto"
                    >
                      <ExternalLink className="h-3 w-3" />
                      View Form
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Reject Dialog */}
      <AlertDialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject Revision Request</AlertDialogTitle>
            <AlertDialogDescription>
              The customer will not be notified automatically. You may want to reach out via email.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            placeholder="Reason for rejection (optional, internal only)..."
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={3}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectedRevision && handleAction(selectedRevision.id, "reject", rejectReason)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Reject
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
