import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Lock, Music, Send, RefreshCw, Eye, Package, Clock, CheckCircle, AlertCircle, BarChart3, List, Users, Mail, Upload, FileAudio, Video, CalendarClock, Pencil, X, Save, Bot, Wand2, Loader2, RotateCcw, Archive, Bug, Trash2, AlertTriangle, Copy, Calendar, Tag } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { formatAdminDate } from "@/lib/utils";
import { ActivityLog } from "@/components/admin/ActivityLog";
import { AlbumArtUpload } from "@/components/admin/AlbumArtUpload";
import { Label } from "@/components/ui/label";
import { StatsCards } from "@/components/admin/StatsCards";
import { RevenueChart } from "@/components/admin/RevenueChart";
import { AOVChart } from "@/components/admin/AOVChart";
import { OrdersChart } from "@/components/admin/OrdersChart";
import { StatusChart } from "@/components/admin/StatusChart";
import { GenreChart } from "@/components/admin/GenreChart";
import { LeadsTable, Lead } from "@/components/admin/LeadsTable";
import { EmailTemplates } from "@/components/admin/EmailTemplates";
import { ReactionsTable } from "@/components/admin/ReactionsTable";
import { ScheduledDeliveryPicker } from "@/components/admin/ScheduledDeliveryPicker";
import { SourceAnalytics } from "@/components/admin/SourceAnalytics";
import { SalesVelocity } from "@/components/admin/SalesVelocity";
import { SalesHeatmap } from "@/components/admin/SalesHeatmap";
import { HotLeadsCard } from "@/components/admin/HotLeadsCard";
import { ConversionFunnel } from "@/components/admin/ConversionFunnel";
import { AutomationDashboard } from "@/components/admin/AutomationDashboard";
import { FunnelInsights } from "@/components/admin/FunnelInsights";
import { genreOptions, singerOptions, occasionOptions, languageOptions, getLanguageLabel } from "@/components/admin/adminDropdownOptions";
import { ValentineRemarketingPanel } from "@/components/admin/ValentineRemarketingPanel";
import { CustomOccasionInsights } from "@/components/admin/CustomOccasionInsights";
import { UnplayedResendPanel } from "@/components/admin/UnplayedResendPanel";
import { ReactionEmailPanel } from "@/components/admin/ReactionEmailPanel";
import { LeadFollowupPanel } from "@/components/admin/LeadFollowupPanel";
import { CSAssistant } from "@/components/admin/CSAssistant";
import { PromosPanel } from "@/components/admin/PromosPanel";
import { BonusTrackAnalytics } from "@/components/admin/BonusTrackAnalytics";
import { subDays, startOfDay, endOfDay, parseISO, isWithinInterval } from "date-fns";
import { getCountryFromTimezone } from "@/lib/timezoneCountry";

interface Order {
  id: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  customer_email_override: string | null;
  customer_email_cc: string | null;
  sent_to_emails: string[] | null;
  recipient_name: string;
  recipient_type: string;
  recipient_name_pronunciation: string | null;
  occasion: string;
  genre: string;
  singer_preference: string;
  relationship: string;
  special_qualities: string;
  favorite_memory: string;
  special_message: string | null;
  pricing_tier: string;
  price: number;
  status: string;
  song_url: string | null;
  song_title: string | null;
  cover_image_url: string | null;
  expected_delivery: string | null;
  delivered_at: string | null;
  created_at: string;
  notes: string | null;
   source: string | null;
  reaction_video_url: string | null;
  reaction_submitted_at: string | null;
  scheduled_delivery_at: string | null;
  resend_scheduled_at: string | null;
  // Engagement tracking
  song_played_at: string | null;
  song_play_count: number | null;
  song_downloaded_at: string | null;
  song_download_count: number | null;
  // UTM tracking
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  // Automation tracking
  automation_status: string | null;
  automation_task_id: string | null;
  automation_lyrics: string | null;
  automation_started_at: string | null;
  automation_retry_count: number | null;
  automation_last_error: string | null;
  automation_raw_callback: unknown | null;
  automation_audio_url_source: string | null;
  automation_style_id: string | null;
  // Timing fields
  earliest_generate_at: string | null;
  target_send_at: string | null;
  generated_at: string | null;
  sent_at: string | null;
  next_attempt_at: string | null;
  // Delivery tracking
  delivery_status: string | null;
  delivery_last_error: string | null;
  delivery_retry_count: number | null;
  // Input change detection
   inputs_hash: string | null;
  // Dismissal tracking
  dismissed_at: string | null;
  // Manual override
  automation_manual_override_at: string | null;
  // Language
  lyrics_language_code?: string;
  // SMS fields
  phone_e164?: string | null;
  sms_opt_in?: boolean;
  sms_status?: string | null;
  sms_last_error?: string | null;
  sms_sent_at?: string | null;
  sms_scheduled_for?: string | null;
  timezone?: string | null;
  // Lyrics unlock
  lyrics_unlocked_at?: string | null;
  lyrics_price_cents?: number | null;
  // Previous version backup
  prev_song_url?: string | null;
  prev_automation_lyrics?: string | null;
  prev_cover_image_url?: string | null;
  // Unplayed re-send
  unplayed_resend_sent_at?: string | null;
  // Revision
  revision_token?: string | null;
  // Billing country
  billing_country_code?: string | null;
  billing_country_name?: string | null;
  // Bonus track
  bonus_song_url?: string | null;
  bonus_preview_url?: string | null;
  bonus_song_title?: string | null;
  bonus_cover_image_url?: string | null;
  bonus_automation_status?: string | null;
  bonus_unlocked_at?: string | null;
  bonus_price_cents?: number | null;
}

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  paid: "bg-blue-100 text-blue-800",
  in_progress: "bg-purple-100 text-purple-800",
  ready: "bg-amber-100 text-amber-800",
  completed: "bg-green-100 text-green-800",
  delivered: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-red-100 text-red-800",
};

const statusIcons: Record<string, React.ReactNode> = {
  pending: <Clock className="h-3 w-3" />,
  paid: <Package className="h-3 w-3" />,
  in_progress: <RefreshCw className="h-3 w-3" />,
  ready: <CalendarClock className="h-3 w-3" />,
  completed: <CheckCircle className="h-3 w-3" />,
  delivered: <Send className="h-3 w-3" />,
  cancelled: <AlertCircle className="h-3 w-3" />,
};

// Lead interface is imported from LeadsTable

export default function Admin() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [orders, setOrders] = useState<Order[]>([]);
  const [allOrders, setAllOrders] = useState<Order[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [songUrl, setSongUrl] = useState("");
  const [updating, setUpdating] = useState(false);
  const [resendingDelivery, setResendingDelivery] = useState(false);
  const [activeTab, setActiveTab] = useState("analytics");
  const [orderSort, setOrderSort] = useState<"latest" | "oldest" | "delivery_soonest">("latest");
  const [leadSort, setLeadSort] = useState<"latest" | "oldest" | "quality">("latest");
  const [orderSearch, setOrderSearch] = useState("");
  const [reactionSort, setReactionSort] = useState<"latest" | "oldest">("latest");
  const [uploadingFile, setUploadingFile] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [scheduledDeliveryTime, setScheduledDeliveryTime] = useState<Date | null>(null);
  const [resendScheduledTime, setResendScheduledTime] = useState<Date | null>(null);
  const [schedulingResend, setSchedulingResend] = useState(false);
  // Edit mode state for orders
  const [isEditingOrder, setIsEditingOrder] = useState(false);
  const [editedOrder, setEditedOrder] = useState<Partial<Order>>({});
  const [savingOrderEdits, setSavingOrderEdits] = useState(false);
  // Order automation state
  const [triggeringOrderAutomation, setTriggeringOrderAutomation] = useState<string | null>(null);
  const [triggeringBonusGeneration, setTriggeringBonusGeneration] = useState<string | null>(null);
  // Order dismissal state
  const [dismissedOrderFilter, setDismissedOrderFilter] = useState<"active" | "cancelled" | "all">("active");
  const [dismissingOrder, setDismissingOrder] = useState<string | null>(null);
  // Reset automation state
  const [resettingAutomation, setResettingAutomation] = useState(false);
  const [stoppingAutomation, setStoppingAutomation] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState<"soft" | "full" | null>(null);
  const [regenerateConfirmText, setRegenerateConfirmText] = useState("");
  const [showDebugInfo, setShowDebugInfo] = useState(false);
  // Lyrics editing state
  const [editingOrderLyrics, setEditingOrderLyrics] = useState(false);
  const [editedOrderLyricsText, setEditedOrderLyricsText] = useState("");
  const [savingOrderLyrics, setSavingOrderLyrics] = useState(false);
  // Song title editing state
  const [editingOrderTitle, setEditingOrderTitle] = useState(false);
  const [editedOrderTitle, setEditedOrderTitle] = useState("");
  const [savingOrderTitle, setSavingOrderTitle] = useState(false);
  // Regenerate song state
  const [showRegenerateDialog, setShowRegenerateDialog] = useState(false);
  const [regenerateMode, setRegenerateMode] = useState<"new" | "with_lyrics">("new");
  const [regenerateSendOption, setRegenerateSendOption] = useState<"immediate" | "scheduled" | "auto">("auto");
  const [regenerateScheduledAt, setRegenerateScheduledAt] = useState<Date | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  // Restore previous version state
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
  const [restoringPreviousVersion, setRestoringPreviousVersion] = useState(false);
 // Source filter for direct vs lead conversion orders
  const [sourceFilter, setSourceFilter] = useState<"all" | "direct" | "lead_conversion">("all");
  const [pendingLeadId, setPendingLeadId] = useState<string | null>(null);
  // Analytics date range filter
  type DatePreset = "today" | "yesterday" | "7d" | "14d" | "30d" | "90d" | "all" | "custom";
  const [analyticsPreset, setAnalyticsPreset] = useState<DatePreset>("30d");
  const [analyticsFrom, setAnalyticsFrom] = useState<string>("");
  const [analyticsTo, setAnalyticsTo] = useState<string>("");

  // Derive filtered orders for analytics charts based on date range
  const analyticsOrders = (() => {
    if (analyticsPreset === "all") return allOrders;
    if (analyticsPreset === "custom") {
      if (!analyticsFrom && !analyticsTo) return allOrders;
      return allOrders.filter((o) => {
        const d = parseISO(o.created_at);
        const from = analyticsFrom ? startOfDay(parseISO(analyticsFrom)) : new Date(0);
        const to = analyticsTo ? endOfDay(parseISO(analyticsTo)) : new Date();
        return isWithinInterval(d, { start: from, end: to });
      });
    }
    if (analyticsPreset === "today") {
      const todayStart = startOfDay(new Date());
      return allOrders.filter((o) => parseISO(o.created_at) >= todayStart);
    }
    if (analyticsPreset === "yesterday") {
      const yesterdayStart = startOfDay(subDays(new Date(), 1));
      const todayStart = startOfDay(new Date());
      return allOrders.filter((o) => {
        const d = parseISO(o.created_at);
        return d >= yesterdayStart && d < todayStart;
      });
    }
    const days = analyticsPreset === "7d" ? 7 : analyticsPreset === "14d" ? 14 : analyticsPreset === "90d" ? 90 : 30;
    const cutoff = startOfDay(subDays(new Date(), days - 1));
    return allOrders.filter((o) => parseISO(o.created_at) >= cutoff);
  })();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      const allowedTypes = ["audio/mpeg", "audio/wav", "audio/mp4", "audio/x-m4a", "audio/ogg", "audio/flac"];
      const allowedExtensions = [".mp3", ".wav", ".m4a", ".ogg", ".flac"];
      const fileName = file.name.toLowerCase();
      const fileExtension = fileName.substring(fileName.lastIndexOf("."));
      
      if (!allowedTypes.includes(file.type) && !allowedExtensions.includes(fileExtension)) {
        toast({
          title: "Invalid File",
          description: "Please select an audio file (MP3, WAV, M4A, OGG, or FLAC)",
          variant: "destructive",
        });
        return;
      }
      setSelectedFile(file);
    }
  };

  const handleUploadSong = async () => {
    if (!selectedFile || !selectedOrder || !password) return;

    setUploadingFile(true);
    setUploadProgress(10);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("orderId", selectedOrder.id);
      formData.append("adminPassword", password);

      setUploadProgress(30);

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/upload-song`,
        {
          method: "POST",
          body: formData,
        }
      );

      setUploadProgress(80);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Upload failed");
      }

      const data = await response.json();
      setUploadProgress(100);

      // Update local state with new URL
      setSongUrl(data.url);
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

      toast({
        title: "Upload Successful",
        description: "Song uploaded and order updated!",
      });

      // Refresh orders to get updated data
      fetchOrders();
    } catch (error) {
      console.error("Upload error:", error);
      toast({
        title: "Upload Failed",
        description: error instanceof Error ? error.message : "Failed to upload song",
        variant: "destructive",
      });
    } finally {
      setUploadingFile(false);
      setUploadProgress(0);
    }
  };

  const [totalOrderCount, setTotalOrderCount] = useState(0);
  const [totalLeadCount, setTotalLeadCount] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);

  const listOrders = async (status: string, page = 0, pageSize = 250) => {
    return supabase.functions.invoke("admin-orders", {
      method: "POST",
      body: {
        action: "list",
        adminPassword: password,
        status,
        page,
        pageSize,
      },
    });
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Step 1: Check if backend functions are deployed via health endpoint
      try {
        const healthResponse = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/health`
        );
        
        if (!healthResponse.ok) {
          const healthStatus = healthResponse.status;
          if (healthStatus === 404) {
            toast({
              title: "Backend Not Deployed",
              description: "Edge functions are not deployed yet. Please wait a few minutes and try again.",
              variant: "destructive",
            });
            setLoading(false);
            return;
          }
        }
      } catch (healthErr) {
        console.warn("Health check failed (might be deploying):", healthErr);
        // Continue anyway - the health endpoint might not be deployed yet
      }

      // Step 2: Try actual login (fetch page 0 only)
const { data, error } = await listOrders("all", 0, 250);

      if (error) {
        const errorMessage = error.message || String(error);
        
        if (errorMessage.includes("404") || errorMessage.includes("not found") || errorMessage.includes("NOT_FOUND")) {
          toast({ title: "Backend Functions Not Deployed", description: "The admin-orders function is not deployed. Please wait a few minutes for deployment to complete.", variant: "destructive" });
          setLoading(false);
          return;
        }
        
        if (errorMessage.includes("Failed to send") || errorMessage.includes("fetch")) {
          toast({ title: "Backend Unavailable", description: "Could not reach backend functions. They may be deploying. Try again in 2-3 minutes.", variant: "destructive" });
          setLoading(false);
          return;
        }
        
        throw error;
      }
      
      setIsAuthenticated(true);
      setOrders(data.orders || []);
      setAllOrders(data.orders || []);
      setLeads(data.leads || []);
      setTotalOrderCount(data.totalOrders || 0);
      setTotalLeadCount(data.totalLeads || 0);

      // Auto-load remaining pages in background
      const bgPageSize = 250;
      const totalOrders = data.totalOrders || 0;
      const totalLeads = data.totalLeads || 0;
      const maxPages = Math.max(
        Math.ceil(totalOrders / bgPageSize),
        Math.ceil(totalLeads / bgPageSize)
      );

      if (maxPages > 1) {
        setLoadingMore(true);
        let accOrders = [...(data.orders || [])];
        let accLeads = [...(data.leads || [])];

        // Fire all remaining pages in parallel
        const pagePromises = Array.from({ length: maxPages - 1 }, (_, i) =>
          listOrders("all", i + 1, bgPageSize)
        );
        const results = await Promise.allSettled(pagePromises);

        for (const result of results) {
          if (result.status === "fulfilled" && result.value.data) {
            const pd = result.value.data;
            if (pd.orders?.length) accOrders = accOrders.concat(pd.orders);
            if (pd.leads?.length) accLeads = accLeads.concat(pd.leads);
          } else if (result.status === "rejected") {
            console.error("Page fetch failed:", result.reason);
          }
        }
        // Batch update: set state once after all pages loaded
        setOrders([...accOrders]);
        setAllOrders([...accOrders]);
        setLeads([...accLeads]);
        setLoadingMore(false);
      }
    } catch (err: unknown) {
      console.error("Admin login error:", err);
      const message = err instanceof Error ? err.message : typeof err === "string" ? err : "Request failed";
      if (message.includes("401") || message.includes("Unauthorized")) {
        toast({ title: "Wrong Password", description: "The admin password is incorrect. Please try again.", variant: "destructive" });
      } else {
        toast({ title: "Login Failed", description: `${message} (check console for details)`, variant: "destructive" });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleNavigateToOrder = (orderId: string) => {
    setActiveTab("orders");
    setStatusFilter("all");
    const order = allOrders.find(o => o.id === orderId);
    if (order) {
      setSelectedOrder(order);
      // Fetch full order detail (includes lyrics) in background
      supabase.functions.invoke("admin-orders", {
        method: "POST",
        body: { action: "get_order_detail", orderId, adminPassword: password },
      }).then(({ data }) => {
        if (data?.order) {
          setSelectedOrder(prev => prev?.id === orderId ? { ...prev, ...data.order } : prev);
        }
      }).catch(console.error);
    } else {
      fetchOrders();
      toast({ title: "Order not found in current list", description: "Switched to Orders tab — try refreshing if needed." });
    }
  };

  const fetchOrders = async () => {
    if (!password) {
      setIsAuthenticated(false);
      return;
    }

    setLoading(true);
    try {
      // Fetch page 0 first for fast response
      const { data, error } = await listOrders("all", 0, 250);
      if (error) throw error;

      let accOrders = data.orders || [];
      let accLeads = data.leads || [];
      setOrders(accOrders);
      setAllOrders(accOrders);
      setLeads(accLeads);
      setTotalOrderCount(data.totalOrders || 0);
      setTotalLeadCount(data.totalLeads || 0);

      // Load remaining pages in background
      const bgPageSize = 250;
      const maxPages = Math.max(
        Math.ceil((data.totalOrders || 0) / bgPageSize),
        Math.ceil((data.totalLeads || 0) / bgPageSize)
      );

      if (maxPages > 1) {
        setLoadingMore(true);

        // Fire all remaining pages in parallel
        const pagePromises = Array.from({ length: maxPages - 1 }, (_, i) =>
          listOrders("all", i + 1, bgPageSize)
        );
        const results = await Promise.allSettled(pagePromises);

        for (const result of results) {
          if (result.status === "fulfilled" && result.value.data) {
            const pd = result.value.data;
            if (pd.orders?.length) accOrders = accOrders.concat(pd.orders);
            if (pd.leads?.length) accLeads = accLeads.concat(pd.leads);
          } else if (result.status === "rejected") {
            console.error("Page fetch failed:", result.reason);
          }
        }
        // Batch update: set state once after all pages loaded
        setOrders([...accOrders]);
        setAllOrders([...accOrders]);
        setLeads([...accLeads]);
        setLoadingMore(false);
      }
    } catch {
      toast({
        title: "Error",
        description: "Failed to fetch orders.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const updateOrder = async (orderId: string, updates: Record<string, unknown>) => {
    if (!password) {
      setIsAuthenticated(false);
      return;
    }

    setUpdating(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-orders", {
        method: "POST",
        body: { adminPassword: password, orderId, ...updates },
      });

      if (error) throw error;

      // Determine success message based on action
      let description = "Order updated successfully.";
      if (updates.deliver) {
        description = "Song delivered and email sent!";
      } else if (updates.scheduleDelivery && data?.message) {
        description = data.message;
      }

      toast({
        title: "Success",
        description,
      });

      setSelectedOrder(null);
      setSongUrl("");
      setScheduledDeliveryTime(null);
      fetchOrders();
    } catch {
      toast({
        title: "Error",
        description: "Failed to update order.",
        variant: "destructive",
      });
    } finally {
      setUpdating(false);
    }
  };

  const handleResendDeliveryEmail = async (order: Order, scheduledAt?: Date | null) => {
    if (!password) return;

    // If scheduling a resend
    if (scheduledAt) {
      setSchedulingResend(true);
      try {
        const { data, error } = await supabase.functions.invoke("admin-orders", {
          method: "POST",
          body: {
            action: "schedule_resend_delivery",
            orderId: order.id,
            resendScheduledAt: scheduledAt.toISOString(),
            adminPassword: password,
          },
        });

        if (error) throw error;

        toast({
          title: "Resend Scheduled",
          description: data?.message || "Delivery email will be resent at the scheduled time",
        });

        setResendScheduledTime(null);
        fetchOrders();
      } catch (err) {
        console.error("Schedule resend error:", err);
        toast({
          title: "Failed to Schedule",
          description: err instanceof Error ? err.message : "Failed to schedule resend",
          variant: "destructive",
        });
      } finally {
        setSchedulingResend(false);
      }
      return;
    }

    // Immediate resend
    setResendingDelivery(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-orders", {
        method: "POST",
        body: {
          action: "resend_delivery_email",
          orderId: order.id,
          adminPassword: password,
        },
      });

      if (error) throw error;

      toast({
        title: "Email Resent",
        description: data?.message || `Delivery email resent to ${order.customer_email}`,
      });
    } catch (err) {
      console.error("Resend delivery error:", err);
      toast({
        title: "Failed to Resend",
        description: err instanceof Error ? err.message : "Failed to resend email",
        variant: "destructive",
      });
    } finally {
      setResendingDelivery(false);
    }
  };

  const handleCancelScheduledResend = async (order: Order) => {
    if (!password) return;

    setSchedulingResend(true);
    try {
      const { error } = await supabase.functions.invoke("admin-orders", {
        method: "POST",
        body: {
          action: "schedule_resend_delivery",
          orderId: order.id,
          resendScheduledAt: null,
          adminPassword: password,
        },
      });

      if (error) throw error;

      toast({
        title: "Schedule Cancelled",
        description: "Scheduled resend has been cancelled",
      });

      fetchOrders();
    } catch (err) {
      console.error("Cancel scheduled resend error:", err);
      toast({
        title: "Failed to Cancel",
        description: err instanceof Error ? err.message : "Failed to cancel scheduled resend",
        variant: "destructive",
      });
    } finally {
      setSchedulingResend(false);
    }
  };

  const handleSaveOrderEdits = async () => {
    if (!selectedOrder || !password) return;

    setSavingOrderEdits(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-orders", {
        method: "POST",
        body: {
          action: "update_order_fields",
          orderId: selectedOrder.id,
          updates: editedOrder,
          adminPassword: password,
        },
      });

      if (error) throw error;

      toast({
        title: "Changes Saved",
        description: "Order information updated successfully",
      });

      // UX nudge if language changed
      if (editedOrder.lyrics_language_code && 
          editedOrder.lyrics_language_code !== selectedOrder.lyrics_language_code) {
        toast({
          title: "Language Changed",
          description: "Click Regenerate Song to produce the new version.",
        });
      }

      // Update local state
      setSelectedOrder(data.order);
      setIsEditingOrder(false);
      setEditedOrder({});
      fetchOrders();
    } catch (err) {
      console.error("Save order edits error:", err);
      toast({
        title: "Failed to Save",
        description: err instanceof Error ? err.message : "Failed to save changes",
        variant: "destructive",
      });
    } finally {
      setSavingOrderEdits(false);
    }
  };

  const startEditingOrder = () => {
    if (!selectedOrder) return;
    setEditedOrder({
      customer_name: selectedOrder.customer_name,
      customer_email: selectedOrder.customer_email,
      customer_phone: selectedOrder.customer_phone || "",
      customer_email_override: selectedOrder.customer_email_override || "",
      customer_email_cc: selectedOrder.customer_email_cc || "",
      recipient_name: selectedOrder.recipient_name,
      recipient_name_pronunciation: selectedOrder.recipient_name_pronunciation || "",
      occasion: selectedOrder.occasion,
      genre: selectedOrder.genre,
      singer_preference: selectedOrder.singer_preference,
      special_qualities: selectedOrder.special_qualities,
      favorite_memory: selectedOrder.favorite_memory,
      special_message: selectedOrder.special_message || "",
      notes: selectedOrder.notes || "",
      lyrics_language_code: selectedOrder.lyrics_language_code || "en",
    });
    setIsEditingOrder(true);
  };

  // Handler for regenerating song (supports both modes)
  const handleRegenerateSong = async () => {
    if (!selectedOrder || !password) return;
    
    setRegenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-orders", {
        method: "POST",
        body: {
          action: regenerateMode === "with_lyrics" ? "regenerate_with_lyrics" : "regenerate_song",
          orderId: selectedOrder.id,
          sendOption: regenerateSendOption,
          scheduledAt: regenerateSendOption === "scheduled" && regenerateScheduledAt 
            ? regenerateScheduledAt.toISOString() 
            : null,
          adminPassword: password,
        },
      });

      if (error) throw error;

      toast({
        title: regenerateMode === "with_lyrics" ? "Regeneration Started (Lyrics Preserved)" : "Regeneration Started",
        description: `Song for ${selectedOrder.recipient_name} is being regenerated. This will take 1-3 minutes.`,
      });

      setShowRegenerateDialog(false);
      setRegenerateMode("new");
      setRegenerateSendOption("auto");
      setRegenerateScheduledAt(null);
      setSelectedOrder(null);
      fetchOrders();
    } catch (err) {
      console.error("Regenerate song error:", err);

      // Try to extract the underlying response body from Supabase Functions errors
      // so the toast shows the real backend error (not just "non-2xx").
      let description = err instanceof Error ? err.message : "Unknown error";
      try {
        const ctx = (err && typeof err === "object" && "context" in err)
          ? (err as { context?: Response }).context
          : undefined;

        if (ctx) {
          // Prefer JSON error payload, but fall back to raw text.
          const statusPrefix = `${ctx.status}${ctx.statusText ? ` ${ctx.statusText}` : ""}`;

          const payload = await ctx.clone().json().catch(() => null as unknown);
          if (payload && typeof payload === "object") {
            const p = payload as Record<string, unknown>;
            const parts = [
              typeof p.error === "string" ? p.error : null,
              typeof p.code === "string" ? `(${p.code})` : null,
              typeof p.details === "string" ? p.details : null,
            ].filter(Boolean);
            if (parts.length) {
              description = `${statusPrefix} — ${parts.join(" ")}`;
            }
          } else {
            const text = await ctx.clone().text().catch(() => "");
            if (text) description = `${statusPrefix} — ${text.slice(0, 300)}`;
            else description = statusPrefix;
          }
        }
      } catch {
        // ignore parsing errors
      }

      toast({
        title: "Regeneration Failed",
        description,
        variant: "destructive",
      });
    } finally {
      setRegenerating(false);
    }
  };

  // Handler for restoring previous version
  const handleRestorePreviousVersion = async () => {
    if (!selectedOrder || !password) return;
    setRestoringPreviousVersion(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-orders", {
        method: "POST",
        body: {
          action: "restore_previous_version",
          orderId: selectedOrder.id,
          adminPassword: password,
        },
      });
      if (error) throw error;
      toast({
        title: "Song Restored",
        description: `Previous version of the song for ${selectedOrder.recipient_name} has been restored.`,
      });
      setShowRestoreConfirm(false);
      const updatedOrder = { ...selectedOrder, prev_song_url: null, prev_automation_lyrics: null, prev_cover_image_url: null, song_url: data?.restoredUrl ?? selectedOrder.song_url, automation_lyrics: data?.lyricsRestored ? selectedOrder.prev_automation_lyrics : selectedOrder.automation_lyrics };
      setSelectedOrder(updatedOrder as Order);
      fetchOrders();
    } catch (err) {
      console.error("Restore failed:", err);
      toast({
        title: "Restore Failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setRestoringPreviousVersion(false);
    }
  };

  const cancelEditingOrder = () => {
    setIsEditingOrder(false);
    setEditedOrder({});
  };

  // Handler for triggering AI generation for orders
  const handleTriggerOrderAutomation = async (order: Order) => {
    if (!password) return;
    
    setTriggeringOrderAutomation(order.id);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/automation-trigger`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            "x-admin-password": password,
          },
          body: JSON.stringify({ orderId: order.id, forceRun: true }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to trigger automation");
      }

      toast({
        title: "AI Generation Started",
        description: `Song for ${order.recipient_name} is being generated. This will take 1-3 minutes.`,
      });

      // Refresh to show updated status
      fetchOrders();
    } catch (err) {
      console.error("Order automation trigger error:", err);
      toast({
        title: "Failed to Start Generation",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setTriggeringOrderAutomation(null);
    }
  };

  // Handler for dismissing/restoring orders
  const handleDismissOrder = async (order: Order, dismiss: boolean) => {
    if (!password) return;
    
    setDismissingOrder(order.id);
    try {
      const { data, error } = await supabase.functions.invoke("admin-orders", {
        method: "POST",
        body: {
          action: "update_order_dismissal",
          orderId: order.id,
          dismissed: dismiss,
          adminPassword: password,
        },
      });

      if (error) throw error;

      toast({
        title: dismiss ? "Order Cancelled" : "Order Restored",
        description: dismiss 
          ? `Order for ${order.recipient_name} has been cancelled and hidden from active view.`
          : `Order for ${order.recipient_name} has been restored to active status.`,
      });

      fetchOrders();
    } catch (err) {
      console.error("Order dismissal error:", err);
      toast({
        title: dismiss ? "Failed to Cancel" : "Failed to Restore",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setDismissingOrder(null);
    }
  };

  // Handler for resetting automation (allows re-generation)
  const handleResetAutomation = async (clearAssets: boolean) => {
    if (!selectedOrder || !password) return;
    
    setResettingAutomation(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-orders", {
        method: "POST",
        body: {
          action: "reset_automation",
          orderId: selectedOrder.id,
          clearAssets,
          adminPassword: password,
        },
      });

      if (error) throw error;

      toast({
        title: clearAssets ? "Automation Reset + Assets Cleared" : "Automation Reset",
        description: clearAssets 
          ? "Song has been deleted. You can now edit inputs and regenerate."
          : "Automation state cleared. Existing song preserved.",
      });

      setShowResetConfirm(null);
      setRegenerateConfirmText("");
      fetchOrders();
      // Update selected order to reflect reset
      setSelectedOrder(null);
    } catch (err) {
      console.error("Reset automation error:", err);
      toast({
        title: "Reset Failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setResettingAutomation(false);
    }
  };

  // Helper to check if order needs attention
  const orderNeedsAttention = (order: Order): boolean => {
    const now = new Date();
    // Failed automation
    if (["failed", "permanently_failed", "rate_limited"].includes(order.automation_status || "")) return true;
    // Delivery issues
    if (["failed", "needs_review"].includes(order.delivery_status || "")) return true;
    // Overdue: completed but not sent and target_send_at passed
    if (order.automation_status === "completed" && 
        order.target_send_at && 
        new Date(order.target_send_at) <= now && 
        !order.sent_at &&
        !order.dismissed_at) return true;
    return false;
  };

  useEffect(() => {
    // Intentionally do not auto-authenticate via browser storage.
    // Admin access must always be validated server-side.
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      fetchOrders();
    }
  // Only refetch on auth change - statusFilter is handled client-side
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
              <Lock className="h-6 w-6 text-primary" />
            </div>
            <CardTitle>Admin Dashboard</CardTitle>
            <CardDescription>Enter your password to access the admin panel</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <Input
                type="password"
                placeholder="Enter admin password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Authenticating..." : "Login"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Music className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-semibold">Order Management</h1>
          </div>
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchOrders}
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setIsAuthenticated(false);
                setPassword("");
                navigate("/");
              }}
            >
              Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full max-w-5xl grid-cols-8">
            <TabsTrigger value="analytics" className="gap-2">
              <BarChart3 className="h-4 w-4" />
              Analytics
            </TabsTrigger>
            <TabsTrigger value="orders" className="gap-2">
              <List className="h-4 w-4" />
              Orders
            </TabsTrigger>
            <TabsTrigger value="reactions" className="gap-2">
              <Video className="h-4 w-4" />
              Reactions
            </TabsTrigger>
            <TabsTrigger value="leads" className="gap-2">
              <Users className="h-4 w-4" />
              Leads
            </TabsTrigger>
            <TabsTrigger value="automation" className="gap-2">
              <Bot className="h-4 w-4" />
              Automation
            </TabsTrigger>
            <TabsTrigger value="emails" className="gap-2">
              <Mail className="h-4 w-4" />
              Emails
            </TabsTrigger>
            <TabsTrigger value="cs" className="gap-2">
              <Send className="h-4 w-4" />
              CS Assistant
            </TabsTrigger>
            <TabsTrigger value="promos" className="gap-2">
              <Tag className="h-4 w-4" />
              Promos
            </TabsTrigger>
          </TabsList>

          <TabsContent value="analytics" className="space-y-6">
            {/* === DATE RANGE FILTER === */}
            <div className="flex items-center gap-3 flex-wrap p-4 bg-muted/40 rounded-lg border">
              <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-sm font-medium text-muted-foreground">Date range:</span>
              <div className="flex flex-wrap gap-1.5">
                {(["today", "yesterday", "7d", "14d", "30d", "90d", "all"] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => setAnalyticsPreset(p)}
                    className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                      analyticsPreset === p
                        ? "bg-primary text-primary-foreground"
                        : "bg-background border hover:bg-muted text-foreground"
                    }`}
                  >
                    {p === "today" ? "Today" : p === "yesterday" ? "Yesterday" : p === "7d" ? "Last 7 days" : p === "14d" ? "Last 14 days" : p === "30d" ? "Last 30 days" : p === "90d" ? "Last 90 days" : "All time"}
                  </button>
                ))}
                <button
                  onClick={() => setAnalyticsPreset("custom")}
                  className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                    analyticsPreset === "custom"
                      ? "bg-primary text-primary-foreground"
                      : "bg-background border hover:bg-muted text-foreground"
                  }`}
                >
                  Custom
                </button>
              </div>
              {analyticsPreset === "custom" && (
                <div className="flex items-center gap-2 ml-1">
                  <input
                    type="date"
                    value={analyticsFrom}
                    onChange={(e) => setAnalyticsFrom(e.target.value)}
                    className="text-xs border rounded px-2 py-1 bg-background text-foreground"
                  />
                  <span className="text-xs text-muted-foreground">to</span>
                  <input
                    type="date"
                    value={analyticsTo}
                    onChange={(e) => setAnalyticsTo(e.target.value)}
                    className="text-xs border rounded px-2 py-1 bg-background text-foreground"
                  />
                </div>
              )}
              <span className="text-xs text-muted-foreground ml-auto">
                {analyticsOrders.length} orders in range
              </span>
            </div>

            <StatsCards orders={analyticsOrders} leads={leads} loadingMore={loadingMore} />
            
            <SalesVelocity orders={allOrders} />
            
            <ConversionFunnel orders={analyticsOrders} leads={leads} />
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <RevenueChart orders={analyticsOrders} />
              <OrdersChart orders={analyticsOrders} />
              <AOVChart orders={analyticsOrders} />
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <StatusChart orders={analyticsOrders} />
              <GenreChart orders={analyticsOrders} />
            </div>
            
            <SalesHeatmap orders={analyticsOrders} />
            
            {/* Source Analytics */}
            <SourceAnalytics orders={analyticsOrders} leads={leads} />

            {/* Device & Speed Insights */}
            <FunnelInsights orders={analyticsOrders} leads={leads} />

            {/* Custom Occasion Insights */}
            <CustomOccasionInsights orders={analyticsOrders} />

            {/* Bonus Track Analytics */}
            <BonusTrackAnalytics orders={analyticsOrders} />

            {/* Hot Leads - most engaged unconverted */}
            <HotLeadsCard
              leads={leads}
              onViewLead={(leadId) => {
                setPendingLeadId(leadId);
                setActiveTab("leads");
              }}
            />
          </TabsContent>

          <TabsContent value="orders" className="space-y-6">
            <div className="flex items-center gap-4 flex-wrap">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Orders</SelectItem>
                  <SelectItem value="needs_attention" className="text-red-600 font-medium">
                    ⚠️ Needs Attention ({orders.filter(orderNeedsAttention).length})
                  </SelectItem>
                  <SelectItem value="auto_scheduled" className="text-blue-600 font-medium">
                    📬 Auto-Scheduled ({orders.filter(o => o.automation_status === "completed" && o.target_send_at && !o.sent_at && !o.dismissed_at).length})
                  </SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="ready">Ready (Scheduled)</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="delivered">Delivered</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
              <Select value={orderSort} onValueChange={(v) => setOrderSort(v as "latest" | "oldest" | "delivery_soonest")}>
                <SelectTrigger className="w-44">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="latest">Latest First</SelectItem>
                  <SelectItem value="oldest">Oldest First</SelectItem>
                  <SelectItem value="delivery_soonest">Delivery Soonest</SelectItem>
                </SelectContent>
              </Select>
              <Select value={dismissedOrderFilter} onValueChange={(v) => setDismissedOrderFilter(v as "active" | "cancelled" | "all")}>
                <SelectTrigger className="w-36">
                  <SelectValue placeholder="Show" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active Only</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                  <SelectItem value="all">All</SelectItem>
                </SelectContent>
              </Select>
             <Select value={sourceFilter} onValueChange={(v) => setSourceFilter(v as "all" | "direct" | "lead_conversion")}>
               <SelectTrigger className="w-44">
                 <SelectValue placeholder="Source" />
               </SelectTrigger>
               <SelectContent>
                 <SelectItem value="all">All Sources</SelectItem>
                 <SelectItem value="direct">🎯 Direct</SelectItem>
                 <SelectItem value="lead_conversion">🔄 Converted Leads</SelectItem>
               </SelectContent>
             </Select>
               <Input
                placeholder="Search by name, email, order ID, or song link..."
                value={orderSearch}
                onChange={(e) => {
                  const val = e.target.value;
                  setOrderSearch(val);
                  if (val.trim()) {
                    setStatusFilter("all");
                    setDismissedOrderFilter("all");
                    setSourceFilter("all");
                  }
                }}
                className="w-64"
               />
               <span className="text-sm text-muted-foreground whitespace-nowrap">
                 {loadingMore ? (
                    <span className="inline-flex items-center gap-1">
                      {orders.length} of {totalOrderCount} orders loaded
                      <Loader2 className="h-3 w-3 animate-spin" />
                    </span>
                  ) : (
                    <>{orders.length} order{orders.length !== 1 ? "s" : ""}</>
                  )}
                </span>
             </div>

            {(() => {
              // Helper to format time until auto-send
              const formatTimeUntilSend = (targetSendAt: string) => {
                const now = new Date();
                const target = new Date(targetSendAt);
                const diffMs = target.getTime() - now.getTime();
                const diffMins = Math.abs(Math.floor(diffMs / (1000 * 60)));
                const hours = Math.floor(diffMins / 60);
                const mins = diffMins % 60;
                
                if (diffMs > 0) {
                  return hours > 0 ? `in ${hours}h ${mins}m` : `in ${mins}m`;
                } else {
                  return hours > 0 ? `⚠️ overdue by ${hours}h ${mins}m` : `⚠️ overdue by ${mins}m`;
                }
              };

              const filteredOrders = orders.filter((order) => {
                // First apply dismissed filter
                if (dismissedOrderFilter === "active" && order.dismissed_at) return false;
                if (dismissedOrderFilter === "cancelled" && !order.dismissed_at) return false;
                
                // Needs Attention filter
                if (statusFilter === "needs_attention") {
                  return orderNeedsAttention(order);
                }
                
                // Auto-Scheduled filter - shows orders waiting for automatic delivery
                if (statusFilter === "auto_scheduled") {
                  return order.automation_status === "completed" 
                    && order.target_send_at 
                    && !order.sent_at
                    && !order.dismissed_at;
                }
                
                // Standard status filter
                if (statusFilter && statusFilter !== "all") {
                  if (order.status !== statusFilter) return false;
                }
                
               // Source filter
               if (sourceFilter !== "all") {
                 const orderSource = order.source || "direct";
                 if (orderSource !== sourceFilter) return false;
               }
               
                 // Then apply search filter
                if (!orderSearch.trim()) return true;
                const rawSearch = orderSearch.trim();
                // Extract token from pasted URLs like https://…/preview/ABC or /song/ABC
                const urlMatch = rawSearch.match(/\/(?:preview|song)\/([A-Za-z0-9_-]+)/);
                const searchLower = (urlMatch ? urlMatch[1] : rawSearch).toLowerCase();
                 return (
                   order.id.toLowerCase().includes(searchLower) ||
                   order.customer_name.toLowerCase().includes(searchLower) ||
                   order.customer_email.toLowerCase().includes(searchLower) ||
                   order.recipient_name.toLowerCase().includes(searchLower) ||
                   order.genre.toLowerCase().includes(searchLower) ||
                   order.special_qualities.toLowerCase().includes(searchLower) ||
                   order.favorite_memory.toLowerCase().includes(searchLower) ||
                   (order.special_message?.toLowerCase().includes(searchLower) ?? false) ||
                   (order.singer_preference?.toLowerCase().includes(searchLower) ?? false) ||
                   order.occasion.toLowerCase().includes(searchLower) ||
                   (order.song_url?.toLowerCase().includes(searchLower) ?? false) ||
                   (order.cover_image_url?.toLowerCase().includes(searchLower) ?? false)
                 );
              });
              
              if (filteredOrders.length === 0) {
                return (
                  <Card>
                    <CardContent className="py-12 text-center">
                      <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                      <p className="text-muted-foreground">No orders found</p>
                    </CardContent>
                  </Card>
                );
              }
              
              return (
                <div className="space-y-4">
                  {[...filteredOrders].sort((a, b) => {
                    if (orderSort === "delivery_soonest") {
                      // Sort by expected_delivery, nulls last
                      const dateA = a.expected_delivery ? new Date(a.expected_delivery).getTime() : Infinity;
                      const dateB = b.expected_delivery ? new Date(b.expected_delivery).getTime() : Infinity;
                      return dateA - dateB;
                    }
                    const dateA = new Date(a.created_at).getTime();
                    const dateB = new Date(b.created_at).getTime();
                    return orderSort === "latest" ? dateB - dateA : dateA - dateB;
                  }).map((order) => (
                  <Card 
                    key={order.id} 
                    className={`hover:shadow-md transition-shadow ${order.dismissed_at ? "opacity-60 bg-muted/50" : ""}`}
                  >
                    <CardContent className="p-6">
                      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                        <div className="space-y-2 flex-1">
                          <div className="flex items-center gap-3 flex-wrap">
                            <h3 className={`font-semibold text-lg ${order.dismissed_at ? "line-through text-muted-foreground" : ""}`}>
                              {order.customer_name}
                            </h3>
                            <Badge className={statusColors[order.status] || "bg-gray-100 text-gray-800"}>
                              <span className="mr-1">{statusIcons[order.status]}</span>
                              {order.status}
                            </Badge>
                            {order.dismissed_at && (
                              <Badge variant="outline" className="border-red-300 text-red-600">
                                <Archive className="h-3 w-3 mr-1" />
                                Cancelled
                              </Badge>
                            )}
                            <Badge variant="outline">
                              {order.pricing_tier === "priority" ? "Priority" : "Standard"}
                            </Badge>
                           {/* Lead conversion badge */}
                           {order.source === "lead_conversion" && (
                             <Badge variant="outline" className="border-indigo-300 text-indigo-600">
                               🔄 Converted Lead
                             </Badge>
                           )}
                            {/* Automation status badge */}
                            {order.automation_status && (() => {
                              // Check if order is stuck (audio_generating for >5 min)
                              const isStuck = order.automation_status === "audio_generating" && 
                                order.automation_started_at && 
                                (Date.now() - new Date(order.automation_started_at).getTime()) > 5 * 60 * 1000;
                              
                              if (isStuck) {
                                const elapsedMs = Date.now() - new Date(order.automation_started_at!).getTime();
                                const elapsedMin = Math.floor(elapsedMs / 60000);
                                return (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Badge className="bg-red-500 text-white animate-pulse cursor-help">
                                        <AlertCircle className="h-3 w-3 mr-1" />
                                        STUCK ({elapsedMin}m)
                                      </Badge>
                                    </TooltipTrigger>
                                    <TooltipContent className="max-w-xs">
                                      <p className="font-semibold">Audio Provider Callback Delayed</p>
                                      <p className="text-xs mt-1">Kie.ai hasn't sent the completion webhook.</p>
                                      <p className="text-xs mt-1 text-green-600">System auto-retries every minute.</p>
                                    </TooltipContent>
                                  </Tooltip>
                                );
                              }
                              
                              return (
                                <Badge 
                                  variant="outline" 
                                  className={
                                    order.automation_status === "completed" 
                                      ? "border-green-300 text-green-600" 
                                      : order.automation_status === "failed" 
                                        ? "border-red-300 text-red-600" 
                                        : "border-purple-300 text-purple-600"
                                  }
                                >
                                  <Bot className="h-3 w-3 mr-1" />
                                  {order.automation_status}
                                </Badge>
                              );
                            })()}
                            {order.utm_source && (
                              <Badge variant="outline" className="border-blue-300 text-blue-600">
                                {order.utm_source}{order.utm_medium ? ` / ${order.utm_medium}` : ""}
                              </Badge>
                            )}
                            {/* Delivery status badge */}
                            {order.delivery_status && order.delivery_status !== "pending" && (
                              <Badge 
                                variant="outline" 
                                className={
                                  order.delivery_status === "sent" ? "border-green-300 text-green-600" :
                                  order.delivery_status === "scheduled" ? "border-blue-300 text-blue-600" :
                                  order.delivery_status === "needs_review" ? "border-amber-300 text-amber-600" :
                                  order.delivery_status === "failed" ? "border-red-300 text-red-600" :
                                  "border-gray-300"
                                }
                              >
                                <Mail className="h-3 w-3 mr-1" />
                                {order.delivery_status}
                              </Badge>
                            )}
                            {/* Retry count badge */}
                            {(order.automation_retry_count || 0) > 0 && (
                              <Badge variant="outline" className="border-orange-300 text-orange-600">
                                Retry #{order.automation_retry_count}
                              </Badge>
                            )}
                          </div>
                          {/* Show last error directly on card for items needing attention */}
                          {(order.automation_last_error || order.delivery_last_error) && (
                            <div className="mt-2 p-2 bg-red-50 rounded text-xs text-red-700 border border-red-200">
                              <AlertCircle className="h-3 w-3 inline mr-1" />
                              {order.automation_last_error || order.delivery_last_error}
                            </div>
                          )}
                          <p className="text-sm text-muted-foreground">
                            <strong>Song for:</strong> {order.recipient_name} ({order.recipient_type})
                          </p>
                          <p className="text-sm text-muted-foreground">
                            <strong>Order ID:</strong> {order.id.slice(0, 8).toUpperCase()}
                            {order.status === "delivered" && order.song_url && (
                              <> · <a href={`/song/${order.id.slice(0, 8)}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">🔗 Song Page</a></>
                            )}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            <strong>Order Date/Time:</strong>{" "}
                            {formatAdminDate(order.created_at)}
                          </p>
                          {order.expected_delivery && (
                            <p className="text-sm text-muted-foreground">
                              <strong>Expected Delivery:</strong>{" "}
                              {formatAdminDate(order.expected_delivery)}
                            </p>
                          )}
                          {order.scheduled_delivery_at && order.status === "ready" && (
                            <p className="text-sm text-amber-600">
                              <strong>📅 Scheduled Send:</strong>{" "}
                              {formatAdminDate(order.scheduled_delivery_at)}
                            </p>
                          )}
                          {/* Show auto-send time for automated deliveries */}
                          {order.automation_status === "completed" && order.target_send_at && !order.sent_at && (
                            <p className="text-sm text-blue-600 font-medium">
                              <strong>📬 Auto-Send:</strong>{" "}
                              {formatAdminDate(order.target_send_at)} ({formatTimeUntilSend(order.target_send_at)})
                            </p>
                          )}
                        </div>
                        <div className="flex gap-2 flex-wrap">
                          {/* Cancel/Restore buttons */}
                          {!order.dismissed_at ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDismissOrder(order, true)}
                              disabled={dismissingOrder === order.id}
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            >
                              {dismissingOrder === order.id ? (
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              ) : (
                                <X className="h-4 w-4 mr-2" />
                              )}
                              Cancel
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDismissOrder(order, false)}
                              disabled={dismissingOrder === order.id}
                            >
                              {dismissingOrder === order.id ? (
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              ) : (
                                <RotateCcw className="h-4 w-4 mr-2" />
                              )}
                              Restore
                            </Button>
                          )}
                          {/* AI Generate button - show when no song_url and not currently generating and not dismissed */}
                          {!order.dismissed_at && !order.song_url && !["pending", "lyrics_generating", "audio_generating"].includes(order.automation_status || "") && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleTriggerOrderAutomation(order)}
                              disabled={triggeringOrderAutomation === order.id}
                            >
                              {triggeringOrderAutomation === order.id ? (
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              ) : (
                                <Wand2 className="h-4 w-4 mr-2" />
                              )}
                              AI Generate
                            </Button>
                          )}
                          {/* Show generating status */}
                          {["pending", "lyrics_generating", "audio_generating"].includes(order.automation_status || "") && (
                            <Button variant="outline" size="sm" disabled>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Generating...
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                          onClick={() => {
                              setSelectedOrder(order);
                              setSongUrl(order.song_url || "");
                              // Fetch full order detail (includes lyrics) in background
                              supabase.functions.invoke("admin-orders", {
                                method: "POST",
                                body: { action: "get_order_detail", orderId: order.id, adminPassword: password },
                              }).then(({ data }) => {
                                if (data?.order) {
                                  setSelectedOrder(prev => prev?.id === order.id ? { ...prev, ...data.order } : prev);
                                }
                              }).catch(console.error);
                            }}
                          >
                            <Eye className="h-4 w-4 mr-2" />
                            View Details
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
              );
            })()}
          </TabsContent>

          <TabsContent value="reactions" className="space-y-6">
            <ReactionsTable
              orders={allOrders
                .filter((o) => o.reaction_video_url && o.reaction_submitted_at)
                .map((o) => ({
                  id: o.id,
                  customer_name: o.customer_name,
                  customer_email: o.customer_email,
                  customer_phone: o.customer_phone,
                  recipient_name: o.recipient_name,
                  occasion: o.occasion,
                  song_title: o.song_title,
                  reaction_video_url: o.reaction_video_url!,
                  reaction_submitted_at: o.reaction_submitted_at!,
                }))}
              loading={loading}
              sort={reactionSort}
              onSortChange={setReactionSort}
            />
          </TabsContent>

          <TabsContent value="leads" className="space-y-6">
            <LeadsTable 
              leads={leads} 
              loading={loading} 
              sort={leadSort} 
              onSortChange={setLeadSort}
              adminPassword={password}
              onRefresh={fetchOrders}
              onNavigateToOrder={handleNavigateToOrder}
              initialSelectedLeadId={pendingLeadId}
            />
          </TabsContent>

          <TabsContent value="automation" className="space-y-6">
            <AutomationDashboard adminPassword={password} onRefresh={fetchOrders} orders={allOrders} />
            <UnplayedResendPanel adminPassword={password} allOrders={allOrders} />
            <LeadFollowupPanel adminPassword={password} />
          </TabsContent>

          <TabsContent value="emails" className="space-y-6">
            <ValentineRemarketingPanel adminPassword={password} />
            <ReactionEmailPanel adminPassword={password} allOrders={allOrders as any} />
            <EmailTemplates adminPassword={password} />
          </TabsContent>

          <TabsContent value="cs" className="space-y-6">
            <CSAssistant adminPassword={password} />
          </TabsContent>

          <TabsContent value="promos" className="space-y-6">
            <PromosPanel adminPassword={password} />
          </TabsContent>
        </Tabs>
      </main>

      <Dialog open={!!selectedOrder} onOpenChange={(open) => {
        if (!open) {
          setSelectedOrder(null);
          setIsEditingOrder(false);
          setEditedOrder({});
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {selectedOrder && (
            <>
              <DialogHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <DialogTitle>Order Details</DialogTitle>
                    <DialogDescription>
                      Order ID: {selectedOrder.id.slice(0, 8).toUpperCase()}
                      {selectedOrder.status === "delivered" && selectedOrder.song_url && (
                        <> · <a href={`/song/${selectedOrder.id.slice(0, 8)}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">View Song Page ↗</a></>
                      )}
                      {selectedOrder.revision_token && (
                        <> · <button
                          className="text-blue-600 hover:underline inline"
                          onClick={() => {
                            const url = `${window.location.origin}/song/revision/${selectedOrder.revision_token}`;
                            navigator.clipboard.writeText(url);
                            toast({ title: "Revision link copied to clipboard!" });
                          }}
                        >Copy Revision Link 📋</button></>
                      )}
                    </DialogDescription>
                  </div>
                  {!isEditingOrder ? (
                    <Button variant="outline" size="sm" onClick={startEditingOrder}>
                      <Pencil className="h-4 w-4 mr-2" />
                      Edit
                    </Button>
                  ) : (
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={cancelEditingOrder} disabled={savingOrderEdits}>
                        <X className="h-4 w-4 mr-2" />
                        Cancel
                      </Button>
                      <Button size="sm" onClick={handleSaveOrderEdits} disabled={savingOrderEdits}>
                        <Save className="h-4 w-4 mr-2" />
                        {savingOrderEdits ? "Saving..." : "Save"}
                      </Button>
                    </div>
                  )}
                </div>
              </DialogHeader>

              <div className="space-y-6 py-4">
                {selectedOrder.delivery_status === "needs_review" && (
                  <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-center space-y-2">
                    <div className="flex items-center justify-center gap-2 text-amber-800 font-medium">
                      <AlertTriangle className="h-4 w-4" />
                      This order needs review before delivery.
                    </div>
                    <p className="text-sm text-amber-700">The song was generated but inputs were changed.</p>
                    <Button
                      size="sm"
                      className="bg-amber-600 hover:bg-amber-700 text-white"
                      disabled={updating}
                      onClick={async () => {
                        setUpdating(true);
                        try {
                          const { error } = await supabase.functions.invoke("admin-orders", {
                            method: "POST",
                            body: {
                              action: "update_order_fields",
                              orderId: selectedOrder.id,
                              updates: { delivery_status: "scheduled" },
                              adminPassword: password,
                            },
                          });
                          if (error) throw error;
                          toast({ title: "Approved", description: "Delivery status set to scheduled. The cron will pick it up." });
                          setSelectedOrder(null);
                          fetchOrders();
                        } catch (err) {
                          toast({ title: "Error", description: err instanceof Error ? err.message : "Failed to approve", variant: "destructive" });
                        } finally {
                          setUpdating(false);
                        }
                      }}
                    >
                      {updating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-2" />}
                      Approve for Delivery
                    </Button>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-medium text-sm text-muted-foreground mb-1">Customer</h4>
                    {isEditingOrder ? (
                      <div className="space-y-2">
                        <div>
                          <Label className="text-xs">Name</Label>
                          <Input
                            value={editedOrder.customer_name || ""}
                            onChange={(e) => setEditedOrder({ ...editedOrder, customer_name: e.target.value })}
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Original Email (read-only)</Label>
                          <Input
                            value={selectedOrder.customer_email}
                            disabled
                            className="bg-muted"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Delivery Email Override</Label>
                          <Input
                            type="email"
                            value={editedOrder.customer_email_override || ""}
                            onChange={(e) => setEditedOrder({ ...editedOrder, customer_email_override: e.target.value })}
                            placeholder="Leave empty to use original email"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">CC Email (Optional)</Label>
                          <Input
                            type="email"
                            value={editedOrder.customer_email_cc || ""}
                            onChange={(e) => setEditedOrder({ ...editedOrder, customer_email_cc: e.target.value })}
                            placeholder="Add additional recipient"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Phone</Label>
                          <Input
                            value={editedOrder.customer_phone || ""}
                            onChange={(e) => setEditedOrder({ ...editedOrder, customer_phone: e.target.value })}
                          />
                        </div>
                      </div>
                    ) : (
                      <>
                        <p>{selectedOrder.customer_name}</p>
                        <p className="text-sm text-muted-foreground">
                          {selectedOrder.customer_email_override || selectedOrder.customer_email}
                          {selectedOrder.customer_email_override && (
                            <span className="text-xs text-orange-600 ml-1">(overridden)</span>
                          )}
                        </p>
                        {selectedOrder.customer_email_cc && (
                          <p className="text-sm text-muted-foreground">
                            CC: {selectedOrder.customer_email_cc}
                          </p>
                        )}
                        {selectedOrder.customer_phone && (
                          <p className="text-sm text-muted-foreground">{selectedOrder.customer_phone}</p>
                        )}
                        {(selectedOrder.billing_country_name || selectedOrder.billing_country_code || getCountryFromTimezone(selectedOrder.timezone)) && (
                          <p className="text-sm text-muted-foreground">
                            🌍 {selectedOrder.billing_country_name || getCountryFromTimezone(selectedOrder.timezone)}
                            {selectedOrder.billing_country_code && (
                              <span className="text-xs ml-1">({selectedOrder.billing_country_code})</span>
                            )}
                            {!selectedOrder.billing_country_name && !selectedOrder.billing_country_code && getCountryFromTimezone(selectedOrder.timezone) && (
                              <span className="text-xs text-muted-foreground ml-1">(from timezone)</span>
                            )}
                          </p>
                        )}
                      </>
                    )}
                  </div>
                  <div>
                    <h4 className="font-medium text-sm text-muted-foreground mb-1">Recipient</h4>
                    {isEditingOrder ? (
                      <div className="space-y-2">
                        <div>
                          <Label className="text-xs">Name</Label>
                          <Input
                            value={editedOrder.recipient_name || ""}
                            onChange={(e) => setEditedOrder({ ...editedOrder, recipient_name: e.target.value })}
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Pronunciation Override</Label>
                          <Input
                            value={editedOrder.recipient_name_pronunciation || ""}
                            onChange={(e) => setEditedOrder({ ...editedOrder, recipient_name_pronunciation: e.target.value })}
                            placeholder="e.g. koree, jhanay, ahleesa"
                          />
                          <p className="text-xs text-muted-foreground mt-1">
                            Spell the name how you want it sung. Avoid dashes or symbols. Use stretched vowels if needed.
                          </p>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {selectedOrder.recipient_type} • {selectedOrder.relationship}
                        </p>
                      </div>
                    ) : (
                      <>
                        <p>{selectedOrder.recipient_name}</p>
                        {selectedOrder.recipient_name_pronunciation && (
                          <p className="text-sm text-purple-600">
                            <span className="text-muted-foreground">Sung as:</span> {selectedOrder.recipient_name_pronunciation}
                          </p>
                        )}
                        <p className="text-sm text-muted-foreground">
                          {selectedOrder.recipient_type} • {selectedOrder.relationship}
                        </p>
                      </>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-4">
                  <div>
                    <h4 className="font-medium text-sm text-muted-foreground mb-1">Occasion</h4>
                    {isEditingOrder ? (
                      <Select
                        value={editedOrder.occasion || selectedOrder.occasion}
                        onValueChange={(val) => setEditedOrder({ ...editedOrder, occasion: val })}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {occasionOptions.map((opt) => (
                            <SelectItem key={opt.id} value={opt.id}>{opt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <p>{selectedOrder.occasion}</p>
                    )}
                  </div>
                  <div>
                    <h4 className="font-medium text-sm text-muted-foreground mb-1">Genre</h4>
                    {isEditingOrder ? (
                      <Select
                        value={editedOrder.genre || selectedOrder.genre}
                        onValueChange={(val) => setEditedOrder({ ...editedOrder, genre: val })}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {genreOptions.map((opt) => (
                            <SelectItem key={opt.id} value={opt.id}>{opt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <p>{selectedOrder.genre}</p>
                    )}
                  </div>
                  <div>
                    <h4 className="font-medium text-sm text-muted-foreground mb-1">Singer</h4>
                    {isEditingOrder ? (
                      <Select
                        value={editedOrder.singer_preference || selectedOrder.singer_preference}
                        onValueChange={(val) => setEditedOrder({ ...editedOrder, singer_preference: val })}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {singerOptions.map((opt) => (
                            <SelectItem key={opt.id} value={opt.id}>{opt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <p>{selectedOrder.singer_preference}</p>
                    )}
                  </div>
                  <div>
                    <h4 className="font-medium text-sm text-muted-foreground mb-1">Language</h4>
                    {isEditingOrder ? (
                      <Select
                        value={editedOrder.lyrics_language_code || selectedOrder.lyrics_language_code || "en"}
                        onValueChange={(val) => setEditedOrder({ ...editedOrder, lyrics_language_code: val })}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {languageOptions.map((opt) => (
                            <SelectItem key={opt.id} value={opt.id}>{opt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <p>{(selectedOrder.lyrics_language_code || "en")} — {getLanguageLabel(selectedOrder.lyrics_language_code || "en")}</p>
                    )}
                  </div>
                </div>

                <div>
                  <h4 className="font-medium text-sm text-muted-foreground mb-1">Special Qualities</h4>
                  {isEditingOrder ? (
                    <Textarea
                      value={editedOrder.special_qualities || ""}
                      onChange={(e) => setEditedOrder({ ...editedOrder, special_qualities: e.target.value })}
                      rows={3}
                    />
                  ) : (
                    <p className="text-sm">{selectedOrder.special_qualities}</p>
                  )}
                </div>

                <div>
                  <h4 className="font-medium text-sm text-muted-foreground mb-1">Favorite Memory</h4>
                  {isEditingOrder ? (
                    <Textarea
                      value={editedOrder.favorite_memory || ""}
                      onChange={(e) => setEditedOrder({ ...editedOrder, favorite_memory: e.target.value })}
                      rows={3}
                    />
                  ) : (
                    <p className="text-sm">{selectedOrder.favorite_memory}</p>
                  )}
                </div>

                <div>
                  <h4 className="font-medium text-sm text-muted-foreground mb-1">Special Message</h4>
                  {isEditingOrder ? (
                    <Textarea
                      value={editedOrder.special_message || ""}
                      onChange={(e) => setEditedOrder({ ...editedOrder, special_message: e.target.value })}
                      rows={2}
                    />
                  ) : (
                    selectedOrder.special_message ? (
                      <p className="text-sm">{selectedOrder.special_message}</p>
                    ) : (
                      <p className="text-sm text-muted-foreground italic">No special message</p>
                    )
                  )}
                </div>

                {/* Notes - always show for editing */}
                <div>
                  <h4 className="font-medium text-sm text-muted-foreground mb-1">Admin Notes</h4>
                  {isEditingOrder ? (
                    <Textarea
                      value={editedOrder.notes || ""}
                      onChange={(e) => setEditedOrder({ ...editedOrder, notes: e.target.value })}
                      rows={2}
                      placeholder="Internal notes about this order..."
                    />
                  ) : (
                    selectedOrder.notes ? (
                      <p className="text-sm bg-muted/50 p-2 rounded">{selectedOrder.notes}</p>
                    ) : (
                      <p className="text-sm text-muted-foreground italic">No notes</p>
                    )
                  )}
                </div>

                {/* Automation Controls Section */}
                {(selectedOrder.automation_status || selectedOrder.song_url) && (
                  <div className="border-t pt-4">
                    <h4 className="font-medium mb-3 flex items-center gap-2">
                      <Bot className="h-4 w-4" />
                      Automation Controls
                    </h4>
                    <div className="flex gap-2 flex-wrap">
                      {/* Stop Automation Button */}
                      {["queued", "pending", "lyrics_generating", "lyrics_ready", "audio_generating"].includes(selectedOrder.automation_status || "") && !selectedOrder.automation_manual_override_at && (
                        <Button
                          variant="destructive"
                          size="sm"
                          disabled={stoppingAutomation}
                          onClick={async () => {
                            setStoppingAutomation(true);
                            try {
                              const { error } = await supabase.functions.invoke("admin-orders", {
                                method: "POST",
                                body: {
                                  action: "cancel_automation",
                                  orderId: selectedOrder.id,
                                  adminPassword: password,
                                },
                              });
                              if (error) throw error;
                              toast({ title: "Automation Stopped", description: "You can now safely upload a song manually." });
                              setSelectedOrder({ ...selectedOrder, automation_status: null, automation_manual_override_at: new Date().toISOString(), automation_last_error: "Cancelled by admin" });
                              fetchOrders();
                            } catch (error) {
                              toast({ title: "Failed to Stop", description: error instanceof Error ? error.message : "Unknown error", variant: "destructive" });
                            } finally {
                              setStoppingAutomation(false);
                            }
                          }}
                        >
                          {stoppingAutomation ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <X className="h-4 w-4 mr-1" />}
                          Stop Automation
                        </Button>
                      )}
                      {/* Debug Info Button */}
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => setShowDebugInfo(true)}
                      >
                        <Bug className="h-4 w-4 mr-2" />
                        Debug Info
                      </Button>

                      {/* Reset Automation Button */}
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => setShowResetConfirm("soft")}
                        disabled={resettingAutomation}
                      >
                        <RotateCcw className="h-4 w-4 mr-2" />
                        Reset Automation
                      </Button>

                      {/* Reset + Regenerate Button (dangerous) */}
                      {selectedOrder.song_url && (
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => setShowResetConfirm("full")}
                          disabled={resettingAutomation}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Reset + Regenerate
                        </Button>
                      )}

                      {/* Regenerate Song Buttons */}
                      {selectedOrder.song_url && (
                        <div className="flex flex-wrap gap-2">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button 
                                variant="outline" 
                                size="sm" 
                                onClick={() => { setRegenerateMode("new"); setShowRegenerateDialog(true); }}
                                disabled={regenerating}
                                className="text-purple-600 hover:text-purple-700 hover:bg-purple-50"
                              >
                                <Wand2 className="h-4 w-4 mr-2" />
                                Regenerate New Song
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="max-w-xs text-center">
                              Generates brand new lyrics AND a new melody from scratch. The entire song will be replaced.
                            </TooltipContent>
                          </Tooltip>
                          
                          {selectedOrder.automation_lyrics && selectedOrder.automation_lyrics.trim().length > 0 && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button 
                                  variant="outline" 
                                  size="sm" 
                                  onClick={() => { setRegenerateMode("with_lyrics"); setShowRegenerateDialog(true); }}
                                  disabled={regenerating}
                                  className="text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                                >
                                  <RefreshCw className="h-4 w-4 mr-2" />
                                  Regenerate with Current Lyrics
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent side="bottom" className="max-w-xs text-center">
                                Keeps the current lyrics but generates a completely new melody, tempo, and vocals. Use this after editing lyrics to fix mistakes.
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      )}

                      {/* Restore Previous Version Button */}
                      {selectedOrder.prev_song_url && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setShowRestoreConfirm(true)}
                              disabled={restoringPreviousVersion}
                              className="text-teal-600 hover:text-teal-700 hover:bg-teal-50 border-teal-300"
                            >
                              <RotateCcw className="h-4 w-4 mr-2" />
                              Restore Previous Version
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="bottom" className="max-w-xs text-center">
                            Revert to the version before the last regeneration. Only one previous version is kept — current song and lyrics will be replaced.
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </div>
                )}

                <div className="border-t pt-4">
                  <h4 className="font-medium mb-3">Upload Song</h4>
                  
                  <div className="space-y-4">
                    <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-4">
                      <div className="flex flex-col items-center gap-3">
                        <FileAudio className="h-8 w-8 text-muted-foreground" />
                        <div className="text-center">
                          <p className="text-sm font-medium">
                            {selectedFile ? selectedFile.name : "Select an audio file"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            MP3, WAV, M4A, OGG, or FLAC
                          </p>
                        </div>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept=".mp3,.wav,.m4a,.ogg,.flac,audio/*"
                          onChange={handleFileSelect}
                          className="hidden"
                          id="song-upload"
                        />
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={uploadingFile}
                          >
                            Choose File
                          </Button>
                          {selectedFile && (
                            <Button
                              size="sm"
                              onClick={handleUploadSong}
                              disabled={uploadingFile}
                            >
                              <Upload className="h-4 w-4 mr-2" />
                              {uploadingFile ? "Uploading..." : "Upload"}
                            </Button>
                          )}
                        </div>
                        {uploadingFile && (
                          <div className="w-full">
                            <Progress value={uploadProgress} className="h-2" />
                            <p className="text-xs text-center text-muted-foreground mt-1">
                              Uploading... {uploadProgress}%
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {(selectedOrder.song_title || selectedOrder.song_url) && (
                  <div className="border-t pt-4">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-medium">Song Title</h4>
                      {!editingOrderTitle && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs gap-1"
                          onClick={() => {
                            setEditingOrderTitle(true);
                            setEditedOrderTitle(selectedOrder.song_title || "");
                          }}
                        >
                          <Pencil className="h-3 w-3" /> Edit
                        </Button>
                      )}
                    </div>
                    {editingOrderTitle ? (
                      <div className="space-y-2">
                        <Input
                          value={editedOrderTitle}
                          onChange={(e) => setEditedOrderTitle(e.target.value)}
                          placeholder="Enter song title..."
                          className="text-sm"
                          maxLength={200}
                        />
                        <div className="flex gap-2 justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditingOrderTitle(false)}
                            disabled={savingOrderTitle}
                          >
                            <X className="h-3 w-3 mr-1" /> Cancel
                          </Button>
                          <Button
                            size="sm"
                            disabled={savingOrderTitle}
                            onClick={async () => {
                              setSavingOrderTitle(true);
                              try {
                                const { error } = await supabase.functions.invoke("admin-orders", {
                                  method: "POST",
                                  body: {
                                    action: "update_order_fields",
                                    orderId: selectedOrder.id,
                                    updates: { song_title: editedOrderTitle },
                                    adminPassword: password,
                                  },
                                });
                                if (error) throw error;
                                toast({ title: "Song title saved" });
                                setSelectedOrder({ ...selectedOrder, song_title: editedOrderTitle });
                                setEditingOrderTitle(false);
                                fetchOrders();
                              } catch {
                                toast({ title: "Failed to save title", variant: "destructive" });
                              } finally {
                                setSavingOrderTitle(false);
                              }
                            }}
                          >
                            <Save className="h-3 w-3 mr-1" /> Save
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">{selectedOrder.song_title || <span className="italic">No title set</span>}</p>
                    )}
                  </div>
                )}

                {/* Album Art Upload */}
                <AlbumArtUpload
                  entityType="order"
                  entityId={selectedOrder.id}
                  currentUrl={selectedOrder.cover_image_url}
                  adminPassword={password}
                  onUpdate={(newUrl) => {
                    setSelectedOrder({ ...selectedOrder, cover_image_url: newUrl });
                    fetchOrders();
                  }}
                />

                {/* Lyrics unlock warning: paid but content missing */}
                {(selectedOrder as any).lyrics_unlocked_at && !selectedOrder.automation_lyrics && (
                  <div className="border-t pt-4">
                    <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 flex items-center gap-2 text-amber-800 text-sm">
                      <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                      <span><strong>Lyrics Paid</strong> — Customer paid for lyrics but content is missing. Please add lyrics.</span>
                    </div>
                  </div>
                )}

                {/* Editable Lyrics Section */}
                <div className="border-t pt-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium">{selectedOrder.automation_lyrics ? "Generated Lyrics" : "Lyrics"}</h4>
                      {(selectedOrder as any).lyrics_unlocked_at && (
                        <Badge className="bg-green-100 text-green-800 text-xs">Unlocked</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      {selectedOrder.automation_lyrics && !editingOrderLyrics && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs gap-1"
                          onClick={() => {
                            navigator.clipboard.writeText(selectedOrder.automation_lyrics!);
                            toast({ title: "Lyrics copied to clipboard" });
                          }}
                        >
                          <Copy className="h-3 w-3" /> Copy
                        </Button>
                      )}
                      {!editingOrderLyrics && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs gap-1"
                          onClick={() => {
                            setEditingOrderLyrics(true);
                            setEditedOrderLyricsText(selectedOrder.automation_lyrics || "");
                          }}
                        >
                          <Pencil className="h-3 w-3" /> Edit
                        </Button>
                      )}
                    </div>
                  </div>
                  {editingOrderLyrics ? (
                    <div className="space-y-2">
                      <Textarea
                        value={editedOrderLyricsText}
                        onChange={(e) => setEditedOrderLyricsText(e.target.value.slice(0, 5000))}
                        className="min-h-[200px] text-xs font-mono"
                        placeholder="Enter or paste lyrics here..."
                      />
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">{editedOrderLyricsText.length}/5000</span>
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditingOrderLyrics(false)}
                            disabled={savingOrderLyrics}
                          >
                            <X className="h-3 w-3 mr-1" /> Cancel
                          </Button>
                          <Button
                            size="sm"
                            disabled={savingOrderLyrics}
                            onClick={async () => {
                              setSavingOrderLyrics(true);
                              try {
                                const { error } = await supabase.functions.invoke("admin-orders", {
                                  method: "POST",
                                  body: {
                                    action: "update_order_fields",
                                    orderId: selectedOrder.id,
                                    updates: { automation_lyrics: editedOrderLyricsText },
                                    adminPassword: password,
                                  },
                                });
                                if (error) throw error;
                                toast({ title: "Lyrics saved" });
                                setSelectedOrder({ ...selectedOrder, automation_lyrics: editedOrderLyricsText });
                                setEditingOrderLyrics(false);
                                fetchOrders();
                              } catch {
                                toast({ title: "Failed to save lyrics", variant: "destructive" });
                              } finally {
                                setSavingOrderLyrics(false);
                              }
                            }}
                          >
                            <Save className="h-3 w-3 mr-1" /> Save
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : selectedOrder.automation_lyrics ? (
                    <pre className="text-xs bg-muted p-3 rounded-md max-h-[200px] overflow-y-auto whitespace-pre-wrap">
                      {selectedOrder.automation_lyrics}
                    </pre>
                  ) : (
                    <p className="text-xs text-muted-foreground italic">No lyrics yet. Click Edit to add.</p>
                  )}
                </div>

                <div className="border-t pt-4">
                  <h4 className="font-medium mb-3">Order Settings</h4>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-medium">Status</label>
                      <Select
                        value={selectedOrder.status}
                        onValueChange={(value) => updateOrder(selectedOrder.id, { status: value })}
                        disabled={updating}
                      >
                        <SelectTrigger className="mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="paid">Paid</SelectItem>
                          <SelectItem value="in_progress">In Progress</SelectItem>
                          <SelectItem value="ready">Ready (Scheduled)</SelectItem>
                          <SelectItem value="completed">Completed</SelectItem>
                          <SelectItem value="delivered">Delivered</SelectItem>
                          <SelectItem value="cancelled">Cancelled</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {songUrl && (
                      <div>
                        <label className="text-sm font-medium">Uploaded Song</label>
                        <p className="text-xs text-muted-foreground mt-1 break-all">
                          <a href={songUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{songUrl}</a>
                        </p>
                      </div>
                    )}
                    {selectedOrder.song_url && (
                      <div>
                        <label className="text-sm font-medium">Song Page</label>
                        <p className="text-xs text-muted-foreground mt-1 break-all">
                          <a href={`https://www.personalsonggifts.com/song/${selectedOrder.id.slice(0, 8).toUpperCase()}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                            {`https://www.personalsonggifts.com/song/${selectedOrder.id.slice(0, 8).toUpperCase()}`}
                          </a>
                        </p>
                        {selectedOrder.status !== "delivered" && selectedOrder.status !== "ready" && (
                          <p className="text-xs text-muted-foreground/70 mt-0.5 italic">⚠️ Link works once song is uploaded</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Scheduled Delivery Picker - shown when song is uploaded and not yet delivered */}
                {(songUrl || selectedOrder.song_url) && selectedOrder.status !== "delivered" && (
                  <div className="border-t pt-4 bg-muted/30 rounded-lg p-4 -mx-2">
                    <ScheduledDeliveryPicker
                      expectedDelivery={selectedOrder.expected_delivery}
                      value={scheduledDeliveryTime}
                      onChange={setScheduledDeliveryTime}
                    />
                  </div>
                )}

                {/* Customer Engagement Section - show for delivered orders */}
                {selectedOrder.status === "delivered" && (
                  <div className="border-t pt-4">
                    <h4 className="font-medium mb-3">Customer Engagement</h4>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Delivered:</span>{" "}
                        {selectedOrder.delivered_at 
                          ? formatAdminDate(selectedOrder.delivered_at)
                          : "—"
                        }
                      </div>
                      <div>
                        <span className="text-muted-foreground">Song Played:</span>{" "}
                        {selectedOrder.song_played_at ? (
                          <>
                            {formatAdminDate(selectedOrder.song_played_at)}
                            {selectedOrder.song_play_count && selectedOrder.song_play_count > 1 && (
                              <Badge variant="outline" className="ml-2 text-green-600 border-green-300">
                                {selectedOrder.song_play_count}x
                              </Badge>
                            )}
                          </>
                        ) : (
                          <span className="text-muted-foreground italic">Not yet</span>
                        )}
                      </div>
                      <div className="col-span-2">
                        <span className="text-muted-foreground">Downloaded:</span>{" "}
                        {selectedOrder.song_downloaded_at ? (
                          <>
                            {formatAdminDate(selectedOrder.song_downloaded_at)}
                            {selectedOrder.song_download_count && selectedOrder.song_download_count > 1 && (
                              <Badge variant="outline" className="ml-2 text-blue-600 border-blue-300">
                                {selectedOrder.song_download_count}x
                              </Badge>
                            )}
                          </>
                        ) : (
                          <span className="text-muted-foreground italic">Not yet</span>
                        )}
                      </div>
                      <div className="col-span-2">
                        <span className="text-muted-foreground">Follow-up Re-send:</span>{" "}
                        {selectedOrder.unplayed_resend_sent_at ? (
                          <span className="inline-flex items-center gap-1.5">
                            {formatAdminDate(selectedOrder.unplayed_resend_sent_at)}
                            {selectedOrder.song_played_at &&
                              new Date(selectedOrder.song_played_at) > new Date(selectedOrder.unplayed_resend_sent_at) && (
                                <Badge variant="outline" className="ml-1 text-green-700 border-green-300 bg-green-50 text-xs">
                                  ✓ Played after re-send
                                </Badge>
                              )}
                          </span>
                        ) : (
                          <span className="text-muted-foreground italic">Not sent</span>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Resend Delivery Scheduling - for delivered orders with a song */}
                {selectedOrder.status === "delivered" && selectedOrder.song_url && (
                  <div className="border-t pt-4 bg-muted/30 rounded-lg p-4 -mx-2">
                    <div className="flex items-center gap-2 mb-4">
                      <Send className="h-4 w-4 text-muted-foreground" />
                      <h4 className="font-medium text-sm">Resend Delivery</h4>
                    </div>
                    
                    {selectedOrder.resend_scheduled_at ? (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-50 p-3 rounded-lg">
                          <CalendarClock className="h-4 w-4" />
                          <span>
                            Resend scheduled for{" "}
                            <strong>{formatAdminDate(selectedOrder.resend_scheduled_at)}</strong>
                          </span>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleCancelScheduledResend(selectedOrder)}
                          disabled={schedulingResend}
                        >
                          <X className="h-4 w-4 mr-2" />
                          Cancel Scheduled Resend
                        </Button>
                      </div>
                    ) : (
                      <ScheduledDeliveryPicker
                        expectedDelivery={null}
                        value={resendScheduledTime}
                        onChange={setResendScheduledTime}
                      />
                    )}
                  </div>
                )}

                {/* Traffic Source Section */}
                <div className="border-t pt-4">
                  <h4 className="font-medium mb-3">Traffic Source</h4>
                  {selectedOrder.utm_source ? (
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-muted-foreground">Source:</span> {selectedOrder.utm_source}
                      </div>
                      {selectedOrder.utm_medium && (
                        <div>
                          <span className="text-muted-foreground">Medium:</span> {selectedOrder.utm_medium}
                        </div>
                      )}
                      {selectedOrder.utm_campaign && (
                        <div className="col-span-2">
                          <span className="text-muted-foreground">Campaign:</span> {selectedOrder.utm_campaign}
                        </div>
                      )}
                      {selectedOrder.utm_content && (
                        <div>
                          <span className="text-muted-foreground">Content:</span> {selectedOrder.utm_content}
                        </div>
                      )}
                      {selectedOrder.utm_term && (
                        <div>
                          <span className="text-muted-foreground">Term:</span> {selectedOrder.utm_term}
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">Direct (no tracking data)</p>
                  )}
                </div>
              </div>

              {/* Activity Log */}
              <ActivityLog entityId={selectedOrder.id} entityType="order" adminPassword={password} />

              <DialogFooter className="flex-col sm:flex-row gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setSelectedOrder(null);
                    setSelectedFile(null);
                    setScheduledDeliveryTime(null);
                    setIsEditingOrder(false);
                    setEditedOrder({});
                    if (fileInputRef.current) {
                      fileInputRef.current.value = "";
                    }
                  }}
                >
                  Close
                </Button>
                {(songUrl || selectedOrder.song_url) && selectedOrder.status !== "delivered" && (
                  <>
                    {scheduledDeliveryTime ? (
                      <Button
                        onClick={() => updateOrder(selectedOrder.id, { 
                          scheduleDelivery: true,
                          scheduledDeliveryAt: scheduledDeliveryTime.toISOString(),
                        })}
                        disabled={updating}
                        className="gap-2"
                      >
                        <CalendarClock className="h-4 w-4" />
                        {updating ? "Scheduling..." : "Schedule Delivery"}
                      </Button>
                    ) : (
                      <Button
                        onClick={() => updateOrder(selectedOrder.id, { deliver: true })}
                        disabled={updating}
                      >
                        <Send className="h-4 w-4 mr-2" />
                        {updating ? "Delivering..." : "Deliver & Send Email Now"}
                      </Button>
                    )}
                  </>
                )}
                {/* Resend delivery email button for already-delivered orders */}
                {selectedOrder.status === "delivered" && selectedOrder.song_url && !selectedOrder.resend_scheduled_at && (
                  resendScheduledTime ? (
                    <Button
                      onClick={() => handleResendDeliveryEmail(selectedOrder, resendScheduledTime)}
                      disabled={schedulingResend}
                      className="gap-2"
                    >
                      <CalendarClock className="h-4 w-4" />
                      {schedulingResend ? "Scheduling..." : "Schedule Resend"}
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      onClick={() => handleResendDeliveryEmail(selectedOrder)}
                      disabled={resendingDelivery}
                    >
                      <RefreshCw className={`h-4 w-4 mr-2 ${resendingDelivery ? "animate-spin" : ""}`} />
                      {resendingDelivery ? "Resending..." : "Resend Delivery Email"}
                    </Button>
                  )
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Debug Info Dialog */}
      <Dialog open={showDebugInfo} onOpenChange={setShowDebugInfo}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Debug Information</DialogTitle>
            <DialogDescription>
              Order {selectedOrder?.id.slice(0, 8).toUpperCase()} - Automation Details
            </DialogDescription>
          </DialogHeader>
          
          {selectedOrder && (
            <div className="space-y-4">
              {/* Automation Timeline */}
              <div>
                <h4 className="font-medium text-sm mb-2">Automation Timeline (UTC)</h4>
                <div className="text-xs font-mono bg-muted p-3 rounded space-y-1">
                  <p>earliest_generate_at: {selectedOrder.earliest_generate_at || "N/A"}</p>
                  <p>automation_started_at: {selectedOrder.automation_started_at || "N/A"}</p>
                  <p>generated_at: {selectedOrder.generated_at || "N/A"}</p>
                  <p>target_send_at: {selectedOrder.target_send_at || "N/A"}</p>
                  <p>sent_at: {selectedOrder.sent_at || "N/A"}</p>
                </div>
              </div>

              {/* Audio URL Source */}
              {selectedOrder.automation_audio_url_source && (
                <div>
                  <h4 className="font-medium text-sm mb-2">Audio URL Extraction</h4>
                  <Badge variant="outline" className="font-mono">
                    Extracted from: {selectedOrder.automation_audio_url_source}
                  </Badge>
                </div>
              )}

              {/* Generated Lyrics */}
              {selectedOrder.automation_lyrics && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-medium text-sm">Generated Lyrics</h4>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs gap-1"
                      onClick={() => {
                        navigator.clipboard.writeText(selectedOrder.automation_lyrics!);
                        toast({ title: "Lyrics copied to clipboard" });
                      }}
                    >
                      <Copy className="h-3 w-3" /> Copy
                    </Button>
                  </div>
                  <pre className="text-xs bg-muted p-4 rounded overflow-auto max-h-48 whitespace-pre-wrap">
                    {selectedOrder.automation_lyrics}
                  </pre>
                </div>
              )}

              {/* Raw Callback Payload */}
              {selectedOrder.automation_raw_callback && (
                <div>
                  <h4 className="font-medium text-sm mb-2">Raw Suno Callback</h4>
                  <pre className="text-xs bg-muted p-4 rounded overflow-auto max-h-64">
                    {JSON.stringify(selectedOrder.automation_raw_callback, null, 2)}
                  </pre>
                </div>
              )}

              {/* Last Error */}
              {(selectedOrder.automation_last_error || selectedOrder.delivery_last_error) && (
                <div>
                  <h4 className="font-medium text-sm mb-2 text-red-600">Last Error</h4>
                  <pre className="text-xs bg-red-50 p-4 rounded overflow-auto text-red-800">
                    {selectedOrder.automation_last_error || selectedOrder.delivery_last_error}
                  </pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Reset Automation Confirmation */}
      <AlertDialog open={showResetConfirm === "soft"} onOpenChange={(open) => !open && setShowResetConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset Automation</AlertDialogTitle>
            <AlertDialogDescription>
              This will clear automation status and allow the order to be picked up for generation again.
              The existing song (if any) will be preserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => handleResetAutomation(false)} disabled={resettingAutomation}>
              {resettingAutomation ? "Resetting..." : "Reset Automation"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reset + Regenerate Confirmation (Two-Step) */}
      <AlertDialog open={showResetConfirm === "full"} onOpenChange={(open) => {
        if (!open) {
          setShowResetConfirm(null);
          setRegenerateConfirmText("");
        }
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-red-600 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Delete Song & Regenerate
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>This will <strong>permanently delete</strong> the existing song and all generated assets.</p>
                <p>The order will return to "paid" status and can be edited before regeneration.</p>
                <p className="text-red-600 font-medium">This action cannot be undone.</p>
                <div className="mt-4">
                  <Label>Type "REGENERATE" to confirm:</Label>
                  <Input 
                    value={regenerateConfirmText}
                    onChange={(e) => setRegenerateConfirmText(e.target.value)}
                    placeholder="REGENERATE"
                    className="mt-2"
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => handleResetAutomation(true)} 
              disabled={resettingAutomation || regenerateConfirmText !== "REGENERATE"}
              className="bg-red-600 hover:bg-red-700"
            >
              {resettingAutomation ? "Deleting..." : "Delete & Reset"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Restore Previous Version Confirmation Dialog */}
      <AlertDialog open={showRestoreConfirm} onOpenChange={setShowRestoreConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore Previous Version?</AlertDialogTitle>
            <AlertDialogDescription>
              This will revert the song and lyrics to the version before the last regeneration. Your <strong>current song and lyrics will be permanently replaced</strong>. Only one previous version is kept, so this cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={restoringPreviousVersion}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRestorePreviousVersion}
              disabled={restoringPreviousVersion}
              className="bg-teal-600 hover:bg-teal-700 text-white"
            >
              {restoringPreviousVersion ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RotateCcw className="h-4 w-4 mr-2" />}
              {restoringPreviousVersion ? "Restoring..." : "Yes, Restore Previous Version"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Regenerate Song Dialog */}
      <Dialog open={showRegenerateDialog} onOpenChange={(open) => {
        if (!open) {
          setShowRegenerateDialog(false);
          setRegenerateMode("new");
          setRegenerateSendOption("auto");
          setRegenerateScheduledAt(null);
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {regenerateMode === "with_lyrics" ? (
                <><RefreshCw className="h-5 w-5 text-amber-600" /> Regenerate with Current Lyrics</>
              ) : (
                <><Wand2 className="h-5 w-5 text-purple-600" /> Regenerate New Song</>
              )}
            </DialogTitle>
            <DialogDescription>
              {regenerateMode === "with_lyrics"
                ? "This will keep the current lyrics but generate a completely new melody, tempo, and vocals. The song will sound entirely different from the original."
                : "This will generate brand new lyrics AND a new melody from scratch. The entire song will be replaced."}
            </DialogDescription>
          </DialogHeader>

          {regenerateMode === "with_lyrics" && (
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              <p className="text-sm text-amber-800 dark:text-amber-200">
                <strong>Important:</strong> The melody will be completely different from the original. Only the lyrics text will be preserved.
              </p>
            </div>
          )}
          
          <div className="space-y-4 py-4">
            <div className="space-y-3">
              <Label className="font-medium">After generation, how should we send it?</Label>
              <div className="space-y-2">
                <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-muted/50">
                  <input
                    type="radio"
                    name="sendOption"
                    value="immediate"
                    checked={regenerateSendOption === "immediate"}
                    onChange={() => setRegenerateSendOption("immediate")}
                    className="h-4 w-4"
                  />
                  <div>
                    <p className="font-medium">Send immediately</p>
                    <p className="text-sm text-muted-foreground">Email sent ~5 minutes after generation</p>
                  </div>
                </label>
                <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-muted/50">
                  <input
                    type="radio"
                    name="sendOption"
                    value="scheduled"
                    checked={regenerateSendOption === "scheduled"}
                    onChange={() => setRegenerateSendOption("scheduled")}
                    className="h-4 w-4"
                  />
                  <div className="flex-1">
                    <p className="font-medium">Schedule send</p>
                    <p className="text-sm text-muted-foreground">Pick a specific date & time</p>
                  </div>
                </label>
                <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-muted/50">
                  <input
                    type="radio"
                    name="sendOption"
                    value="auto"
                    checked={regenerateSendOption === "auto"}
                    onChange={() => setRegenerateSendOption("auto")}
                    className="h-4 w-4"
                  />
                  <div>
                    <p className="font-medium">Default auto-send</p>
                    <p className="text-sm text-muted-foreground">Email sent 12 hours after generation</p>
                  </div>
                </label>
              </div>
            </div>

            {regenerateSendOption === "scheduled" && (
              <div className="pt-2">
                <ScheduledDeliveryPicker
                  expectedDelivery={selectedOrder?.expected_delivery}
                  value={regenerateScheduledAt}
                  onChange={setRegenerateScheduledAt}
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRegenerateDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleRegenerateSong} 
              disabled={regenerating || (regenerateSendOption === "scheduled" && !regenerateScheduledAt)}
              className={regenerateMode === "with_lyrics" ? "bg-amber-600 hover:bg-amber-700" : "bg-purple-600 hover:bg-purple-700"}
            >
              {regenerating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Regenerating...
                </>
              ) : regenerateMode === "with_lyrics" ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Regenerate with Current Lyrics
                </>
              ) : (
                <>
                  <Wand2 className="h-4 w-4 mr-2" />
                  Regenerate New Song
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
