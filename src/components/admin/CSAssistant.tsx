import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { Search, Copy, ExternalLink, RefreshCw, Loader2, AlertTriangle, CheckCircle, Clock, Send, FileEdit, ChevronDown, ChevronUp } from "lucide-react";
import { formatAdminDate } from "@/lib/utils";
import { PendingRevisions } from "./PendingRevisions";

interface CSAssistantProps {
  adminPassword: string;
}

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  paid: "bg-blue-100 text-blue-800",
  in_progress: "bg-purple-100 text-purple-800",
  ready: "bg-amber-100 text-amber-800",
  completed: "bg-green-100 text-green-800",
  delivered: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-red-100 text-red-800",
  failed: "bg-red-100 text-red-800",
  needs_review: "bg-orange-100 text-orange-800",
};

const automationStatusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  lyrics_generating: "bg-blue-100 text-blue-800",
  lyrics_ready: "bg-indigo-100 text-indigo-800",
  audio_generating: "bg-purple-100 text-purple-800",
  completed: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
};

const revisionStatusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  approved: "bg-purple-100 text-purple-800",
  rejected: "bg-red-100 text-red-800",
  completed: "bg-green-100 text-green-800",
};

export function CSAssistant({ adminPassword }: CSAssistantProps) {
  const [email, setEmail] = useState("");
  const [orders, setOrders] = useState<any[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [lookupDone, setLookupDone] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const [customerMessage, setCustomerMessage] = useState("");
  const [draftResponse, setDraftResponse] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [expandedRevisionOrderId, setExpandedRevisionOrderId] = useState<string | null>(null);
  const [revisionDetails, setRevisionDetails] = useState<Record<string, any[]>>({});
  const [loadingRevisionDetails, setLoadingRevisionDetails] = useState<string | null>(null);
  const [grantingRevisionId, setGrantingRevisionId] = useState<string | null>(null);
  const { toast } = useToast();

  const grantExtraRevision = useCallback(async (entityType: "order" | "lead", entityId: string) => {
    const reason = window.prompt("Optional reason (e.g. 'CS comp', 'chargeback resolved'):", "") ?? "";
    if (reason === null) return; // user cancelled
    setGrantingRevisionId(entityId);
    try {
      const { data, error } = await supabase.functions.invoke("admin-orders", {
        method: "POST",
        body: { action: "grant_extra_revision", entityType, entityId, reason: reason.trim() || null, adminPassword },
      });
      if (error) throw error;
      const newMax = data?.max_revisions;
      // Patch local state so the button hides immediately
      if (entityType === "order") {
        setOrders((prev) => prev.map((o) => (o.id === entityId ? { ...o, max_revisions: newMax } : o)));
      } else {
        setLeads((prev) => prev.map((l) => (l.id === entityId ? { ...l, max_revisions: newMax } : l)));
      }
      toast({ title: "Revision granted", description: `Customer can now submit another revision (${newMax} total).` });
    } catch (err) {
      toast({ title: "Grant failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setGrantingRevisionId(null);
    }
  }, [adminPassword, toast]);

  const handleLookup = useCallback(async () => {
    if (!email.trim()) return;
    setLookingUp(true);
    setLookupDone(false);
    setOrders([]);
    setLeads([]);
    setDraftResponse("");

    try {
      const { data, error } = await supabase.functions.invoke("admin-orders", {
        method: "POST",
        body: { action: "cs_lookup", search: email.trim(), adminPassword },
      });
      if (error) throw error;
      setOrders(data.orders || []);
      setLeads(data.leads || []);
      setLookupDone(true);
    } catch (err) {
      toast({ title: "Lookup failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setLookingUp(false);
    }
  }, [email, adminPassword, toast]);

  const handleDraft = useCallback(async () => {
    if (!customerMessage.trim()) return;
    setDrafting(true);
    setDraftResponse("");

    try {
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cs-draft-reply`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ adminPassword, customerMessage: customerMessage.trim(), orders, leads }),
        }
      );

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(errData.error || `Error ${resp.status}`);
      }

      const reader = resp.body?.getReader();
      if (!reader) throw new Error("No response stream");

      const decoder = new TextDecoder();
      let buffer = "";
      let fullText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") break;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              fullText += content;
              setDraftResponse(fullText);
            }
          } catch {
            buffer = line + "\n" + buffer;
            break;
          }
        }
      }

      // Flush remaining buffer
      if (buffer.trim()) {
        for (let raw of buffer.split("\n")) {
          if (!raw || raw.startsWith(":") || raw.trim() === "" || !raw.startsWith("data: ")) continue;
          const jsonStr = raw.slice(6).trim();
          if (jsonStr === "[DONE]") continue;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              fullText += content;
              setDraftResponse(fullText);
            }
          } catch { /* ignore */ }
        }
      }
    } catch (err) {
      toast({ title: "Draft failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setDrafting(false);
    }
  }, [customerMessage, adminPassword, orders, leads, toast]);

  const copyToClipboard = useCallback((text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: `${label} copied!` });
  }, [toast]);

  const copyDraftOnly = useCallback(() => {
    const marker = "✉️ Draft Response:";
    const idx = draftResponse.indexOf(marker);
    const draftOnly = idx !== -1 ? draftResponse.slice(idx + marker.length).trim() : draftResponse;
    copyToClipboard(draftOnly, "Draft response");
  }, [draftResponse, copyToClipboard]);

  const fetchRevisionDetails = useCallback(async (orderId: string) => {
    if (revisionDetails[orderId]) {
      setExpandedRevisionOrderId(prev => prev === orderId ? null : orderId);
      return;
    }
    setLoadingRevisionDetails(orderId);
    setExpandedRevisionOrderId(orderId);
    try {
      const { data, error } = await supabase.functions.invoke("admin-orders", {
        method: "POST",
        body: { action: "list_pending_revisions", adminPassword },
      });
      if (error) throw error;
      const allRevisions = data.revisions || [];
      const orderRevisions = allRevisions.filter((r: any) => r.order_id === orderId);
      setRevisionDetails(prev => ({ ...prev, [orderId]: orderRevisions }));
    } catch (err) {
      toast({ title: "Failed to load revision details", variant: "destructive" });
    } finally {
      setLoadingRevisionDetails(null);
    }
  }, [adminPassword, revisionDetails, toast]);

  const isOverdue = (order: any) => {
    if (order.sent_at) return false;
    if (!order.target_send_at) return false;
    return new Date(order.target_send_at) < new Date();
  };

  const needsAttention = (order: any) => {
    return order.status === "failed" || order.status === "needs_review" || isOverdue(order);
  };

  const customerName = orders[0]?.customer_name || leads[0]?.customer_name || "";

  return (
    <div className="space-y-6">
      {/* Pending Revisions Queue */}
      <PendingRevisions adminPassword={adminPassword} />

      {/* Email Search */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Customer Lookup</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => { e.preventDefault(); handleLookup(); }}
            className="flex gap-2"
          >
            <Input
              placeholder="Email address or name..."
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="flex-1"
            />
            <Button type="submit" disabled={lookingUp || !email.trim()}>
              {lookingUp ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Lookup
            </Button>
          </form>
        </CardContent>
      </Card>

      {lookupDone && (
        <>
          {/* Customer Context */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3 flex-wrap">
                <CardTitle className="text-lg">
                  {customerName || email}
                </CardTitle>
                {orders.length > 1 && (
                  <Badge className="bg-amber-500 text-white">
                    ⭐ Repeat customer ({orders.length} orders)
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                {orders.length} order{orders.length !== 1 ? "s" : ""} · {leads.length} lead{leads.length !== 1 ? "s" : ""}
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {orders.length === 0 && leads.length === 0 && (
                <div className="text-sm space-y-1">
                  <p className="text-muted-foreground">No orders or leads found for this search.</p>
                  <p className="text-muted-foreground italic">💡 The customer may have used a different email at checkout. Try searching by name instead, or ask them which email they used to place the order.</p>
                </div>
              )}

              {/* Order Cards */}
              {orders.map((order: any) => (
                <div
                  key={order.id}
                  className={`border rounded-lg p-4 space-y-2 ${needsAttention(order) ? "border-red-300 bg-red-50/50" : ""}`}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-sm font-medium">{order.id.substring(0, 8)}</span>
                    <span className="text-xs text-muted-foreground">{formatAdminDate(order.created_at)}</span>
                    <Badge className={statusColors[order.status] || "bg-gray-100 text-gray-800"}>
                      {order.status}
                    </Badge>
                    {order.automation_status && (
                      <Badge className={automationStatusColors[order.automation_status] || "bg-gray-100 text-gray-800"} variant="outline">
                        🤖 {order.automation_status}
                      </Badge>
                    )}
                    {needsAttention(order) && (
                      <Badge variant="destructive" className="gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        {order.status === "failed" ? "Failed" : order.status === "needs_review" ? "Needs Review" : "Overdue"}
                      </Badge>
                    )}
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                    <div><span className="text-muted-foreground">Occasion:</span> {order.occasion}</div>
                    <div><span className="text-muted-foreground">Recipient:</span> {order.recipient_name}</div>
                    <div><span className="text-muted-foreground">Genre:</span> {order.genre}</div>
                    <div><span className="text-muted-foreground">Tier:</span> {order.pricing_tier === "rush" ? "$79 Rush" : "$49 Standard"}</div>
                  </div>

                  {order.song_url && (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground">Song:</span>
                      <a href={order.song_url} target="_blank" rel="noopener noreferrer" className="text-primary underline truncate max-w-xs">
                        {order.song_title || "Listen"}
                      </a>
                      <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0" />
                      <Button
                        variant="default"
                        size="sm"
                        className="h-6 px-2 text-xs font-medium gap-1"
                        onClick={() => copyToClipboard(order.song_url, "Song URL")}
                      >
                        <Copy className="h-3 w-3" />
                        Copy Link
                      </Button>
                    </div>
                  )}

                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    {order.sent_at ? (
                      <span className="flex items-center gap-1"><CheckCircle className="h-3 w-3 text-green-600" /> Sent {formatAdminDate(order.sent_at)}</span>
                    ) : order.target_send_at ? (
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> Scheduled {formatAdminDate(order.target_send_at)}</span>
                    ) : (
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> Not scheduled</span>
                    )}
                    {order.delivery_status && (
                      <span>Delivery: {order.delivery_status}</span>
                    )}
                  </div>

                  {/* Revision Status Section */}
                  {(order.revision_status || order.pending_revision || (order.revision_count != null && order.revision_count > 0)) && (
                    <div className="mt-2 border rounded p-3 bg-muted/30 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <FileEdit className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-xs font-medium">Revision</span>
                        {order.revision_status && (
                          <Badge className={revisionStatusColors[order.revision_status] || "bg-gray-100 text-gray-800"} variant="outline">
                            {order.revision_status}
                          </Badge>
                        )}
                        {order.pending_revision && (
                          <Badge className="bg-yellow-100 text-yellow-800" variant="outline">
                            ⏳ Awaiting review
                          </Badge>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {order.revision_count ?? 0}/{order.max_revisions ?? 1} used
                        </span>
                        {(order.revision_count ?? 0) >= (order.max_revisions ?? 1) &&
                          !order.pending_revision &&
                          (order.revision_status === null || order.revision_status === undefined || order.revision_status === "approved" || order.revision_status === "rejected" || order.revision_status === "completed") && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-6 px-2 text-xs gap-1"
                              onClick={() => grantExtraRevision("order", order.id)}
                              disabled={grantingRevisionId === order.id}
                            >
                              {grantingRevisionId === order.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <FileEdit className="h-3 w-3" />
                              )}
                              Grant +1 Revision
                            </Button>
                          )}
                      </div>

                      {order.revision_requested_at && (
                        <p className="text-xs text-muted-foreground">
                          Requested {formatAdminDate(order.revision_requested_at)}
                        </p>
                      )}

                      {order.resend_scheduled_at && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Revised song delivery: {formatAdminDate(order.resend_scheduled_at)}
                        </p>
                      )}

                      {order.revision_status === "approved" && order.automation_status && (
                        <p className="text-xs text-muted-foreground">
                          🤖 Generation: {order.automation_status}
                        </p>
                      )}

                      {order.revision_status === "rejected" && order.revision_reason && (
                        <p className="text-xs text-red-600">
                          Reason: {order.revision_reason}
                        </p>
                      )}

                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs gap-1"
                        onClick={() => fetchRevisionDetails(order.id)}
                        disabled={loadingRevisionDetails === order.id}
                      >
                        {loadingRevisionDetails === order.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : expandedRevisionOrderId === order.id ? (
                          <ChevronUp className="h-3 w-3" />
                        ) : (
                          <ChevronDown className="h-3 w-3" />
                        )}
                        {expandedRevisionOrderId === order.id ? "Hide Details" : "View Revision Details"}
                      </Button>

                      {expandedRevisionOrderId === order.id && revisionDetails[order.id] && (
                        <div className="space-y-2 pt-1">
                          {revisionDetails[order.id].length === 0 ? (
                            <p className="text-xs text-muted-foreground italic">No revision requests found for this order.</p>
                          ) : (
                            revisionDetails[order.id].map((rev: any) => (
                              <div key={rev.id} className="border rounded p-2 space-y-1 text-xs bg-background">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <Badge className={revisionStatusColors[rev.status] || "bg-gray-100 text-gray-800"} variant="outline">
                                    {rev.status}
                                  </Badge>
                                  <span className="text-muted-foreground">{formatAdminDate(rev.submitted_at)}</span>
                                  {rev.is_pre_delivery && <Badge variant="outline" className="text-xs">Pre-delivery</Badge>}
                                </div>
                                {rev.changes_summary && (
                                  <p className="text-muted-foreground">{rev.changes_summary}</p>
                                )}
                                {Array.isArray(rev.fields_changed) && rev.fields_changed.length > 0 && (
                                  <div className="space-y-1 pt-1">
                                    {rev.fields_changed.map((field: string) => {
                                      const original = rev.original_values?.[field];
                                      const newVal = rev[field];
                                      return (
                                        <div key={field} className="pl-2 border-l-2 border-muted">
                                          <span className="font-medium capitalize">{field.replace(/_/g, " ")}</span>
                                          {original != null && (
                                            <p className="text-muted-foreground">Was: <span className="line-through">{String(original)}</span></p>
                                          )}
                                          {newVal != null && (
                                            <p>Now: {String(newVal)}</p>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}

              {/* Lead Cards */}
              {leads.length > 0 && (
                <div className="pt-2">
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">Leads</h4>
                  {leads.map((lead: any) => (
                    <div key={lead.id} className="border rounded-lg p-3 space-y-1 text-sm mb-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs">{lead.id.substring(0, 8)}</span>
                        <span className="text-xs text-muted-foreground">{formatAdminDate(lead.captured_at)}</span>
                        <Badge variant="outline" className="text-xs">{lead.status}</Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {lead.occasion} · {lead.recipient_name} · {lead.genre}
                      </div>
                      {lead.preview_song_url && (
                        <div className="flex items-center gap-1 text-xs">
                          <a href={lead.preview_song_url} target="_blank" rel="noopener noreferrer" className="text-primary underline">
                            Preview
                          </a>
                          <ExternalLink className="h-3 w-3 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Draft Reply */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Draft Reply</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                placeholder="Paste the customer's email message here..."
                value={customerMessage}
                onChange={(e) => setCustomerMessage(e.target.value)}
                rows={5}
              />
              <div className="flex gap-2">
                <Button onClick={handleDraft} disabled={drafting || !customerMessage.trim()}>
                  {drafting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Draft Reply
                </Button>
                {draftResponse && (
                  <Button variant="outline" onClick={() => { setDraftResponse(""); handleDraft(); }} disabled={drafting}>
                    <RefreshCw className="h-4 w-4" />
                    Regenerate
                  </Button>
                )}
              </div>

              {draftResponse && (
                <div className="space-y-3">
                  <ScrollArea className="h-[400px] border rounded-lg p-4">
                    <div className="whitespace-pre-wrap text-sm leading-relaxed">{draftResponse}</div>
                  </ScrollArea>
                  <Button variant="outline" onClick={copyDraftOnly}>
                    <Copy className="h-4 w-4" />
                    Copy Draft to Clipboard
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
