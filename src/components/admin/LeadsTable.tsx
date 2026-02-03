import { useState, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Download, Eye, Users, Upload, FileAudio, Play, Pause, Send, Clock, Gift, Star, AlertTriangle, Check, X, Timer, CheckCircle2, Archive, RotateCcw, RefreshCw, Search, Pencil, Save, ArrowRightCircle } from "lucide-react";
import { formatAdminDate, formatAdminDateShort } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { LeadPreviewTimingPicker, type LeadPreviewTimingMode } from "@/components/admin/LeadPreviewTimingPicker";
import { createAudioPreview } from "@/lib/audioClipper";

export interface Lead {
  id: string;
  email: string;
  phone: string | null;
  customer_name: string;
  recipient_name: string;
  recipient_type: string;
  occasion: string;
  genre: string;
  singer_preference: string;
  special_qualities: string;
  favorite_memory: string;
  special_message: string | null;
  status: string;
  captured_at: string;
  converted_at: string | null;
  order_id: string | null;
  quality_score?: number | null;
  // Lead recovery fields
  preview_song_url?: string | null;
  full_song_url?: string | null;
  song_title?: string | null;
  cover_image_url?: string | null;
  preview_token?: string | null;
  preview_sent_at?: string | null;
  preview_opened_at?: string | null;
  follow_up_sent_at?: string | null;
  preview_scheduled_at?: string | null;
  dismissed_at?: string | null;
  // Engagement tracking fields
  preview_played_at?: string | null;
  preview_play_count?: number | null;
  // UTM tracking fields
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
  utm_term?: string | null;
}

interface LeadsTableProps {
  leads: Lead[];
  loading: boolean;
  sort: "latest" | "oldest" | "quality";
  onSortChange: (sort: "latest" | "oldest" | "quality") => void;
  adminPassword?: string;
  onRefresh?: () => void;
}

const statusColors: Record<string, string> = {
  lead: "bg-amber-100 text-amber-800",
  song_ready: "bg-blue-100 text-blue-800",
  preview_sent: "bg-purple-100 text-purple-800",
  converted: "bg-green-100 text-green-800",
};

const statusLabels: Record<string, string> = {
  lead: "Unconverted",
  song_ready: "Song Ready",
  preview_sent: "Preview Sent",
  converted: "Converted",
};

// Quality score badge helper
function getQualityBadge(score: number | null | undefined) {
  if (score === null || score === undefined) {
    return { label: "N/A", className: "bg-gray-100 text-gray-600", icon: null };
  }
  if (score >= 70) {
    return { label: `${score}`, className: "bg-emerald-100 text-emerald-700", icon: Check };
  }
  if (score >= 40) {
    return { label: `${score}`, className: "bg-amber-100 text-amber-700", icon: Star };
  }
  return { label: `${score}`, className: "bg-red-100 text-red-700", icon: AlertTriangle };
}

export function LeadsTable({ leads, loading, sort, onSortChange, adminPassword, onRefresh }: LeadsTableProps) {
  const [statusFilter, setStatusFilter] = useState("all");
  const [qualityFilter, setQualityFilter] = useState("all");
  const [dismissedFilter, setDismissedFilter] = useState<"active" | "dismissed" | "all">("active");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [sendingPreview, setSendingPreview] = useState(false);
  const [resendingPreview, setResendingPreview] = useState(false);
  const [sendingFollowup, setSendingFollowup] = useState(false);
  const [resendingFollowup, setResendingFollowup] = useState(false);
  const [cancellingAutoSend, setCancellingAutoSend] = useState(false);
  const [dismissingLead, setDismissingLead] = useState<string | null>(null);
  const [savingPreviewTiming, setSavingPreviewTiming] = useState(false);
  const [previewTimingMode, setPreviewTimingMode] = useState<LeadPreviewTimingMode>("auto_24h");
  const [previewScheduledAt, setPreviewScheduledAt] = useState<Date | null>(null);
  const [playingAudio, setPlayingAudio] = useState<string | null>(null);
  // Edit mode state
  const [isEditingLead, setIsEditingLead] = useState(false);
  const [editedLead, setEditedLead] = useState<Partial<Lead>>({});
  const [savingLeadEdits, setSavingLeadEdits] = useState(false);
  // Convert to order state
  const [showConvertDialog, setShowConvertDialog] = useState(false);
  const [convertPrice, setConvertPrice] = useState<number>(49);
  const [convertingLead, setConvertingLead] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  // Filter by status, quality, dismissed state, and search query
  const filteredLeads = leads
    .filter((lead) => {
      // Dismissed filter
      if (dismissedFilter === "active") return !lead.dismissed_at;
      if (dismissedFilter === "dismissed") return !!lead.dismissed_at;
      return true; // "all"
    })
    .filter((lead) => statusFilter === "all" || lead.status === statusFilter)
    .filter((lead) => {
      if (qualityFilter === "all") return true;
      const score = lead.quality_score ?? 0;
      if (qualityFilter === "high") return score >= 70;
      if (qualityFilter === "medium") return score >= 40 && score < 70;
      if (qualityFilter === "low") return score < 40;
      return true;
    })
    .filter((lead) => {
      if (!searchQuery.trim()) return true;
      const searchLower = searchQuery.toLowerCase();
      return (
        lead.customer_name.toLowerCase().includes(searchLower) ||
        lead.email.toLowerCase().includes(searchLower) ||
        lead.recipient_name.toLowerCase().includes(searchLower) ||
        lead.genre.toLowerCase().includes(searchLower) ||
        lead.special_qualities.toLowerCase().includes(searchLower) ||
        lead.favorite_memory.toLowerCase().includes(searchLower) ||
        (lead.special_message?.toLowerCase().includes(searchLower) ?? false) ||
        (lead.singer_preference?.toLowerCase().includes(searchLower) ?? false) ||
        lead.occasion.toLowerCase().includes(searchLower)
      );
    })
    .sort((a, b) => {
      if (sort === "quality") {
        return (b.quality_score ?? 0) - (a.quality_score ?? 0);
      }
      const dateA = new Date(a.captured_at).getTime();
      const dateB = new Date(b.captured_at).getTime();
      return sort === "latest" ? dateB - dateA : dateA - dateB;
    });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
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
    if (!selectedFile || !selectedLead || !adminPassword) return;

    setUploadingFile(true);
    setUploadProgress(5);

    try {
      // Generate 45-second preview client-side using Web Audio API
      toast({
        title: "Generating Preview",
        description: "Creating 45-second preview clip...",
      });
      
      setUploadProgress(10);
      const previewBlob = await createAudioPreview(selectedFile);
      const previewFile = new File([previewBlob], "preview.wav", { type: "audio/wav" });
      
      setUploadProgress(25);
      
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("previewFile", previewFile);
      formData.append("leadId", selectedLead.id);
      formData.append("type", "lead");
      formData.append("adminPassword", adminPassword);

      setUploadProgress(35);

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

      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

      // Update selectedLead with new data from response
      if (selectedLead) {
        setSelectedLead({
          ...selectedLead,
          full_song_url: data.fullUrl,
          preview_song_url: data.previewUrl,
          preview_token: data.previewToken,
          song_title: data.songTitle,
          cover_image_url: data.coverImageUrl || selectedLead.cover_image_url,
          status: "song_ready",
          preview_scheduled_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        });
      }

      toast({
        title: "Upload Successful",
        description: `Song uploaded! Email will auto-send in 24 hours. Click "Send Now" to send immediately.`,
      });

      // Refresh leads list
      onRefresh?.();
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

  const handleSendPreview = async (lead: Lead, resend = false) => {
    if (!adminPassword) return;

    if (resend) {
      setResendingPreview(true);
    } else {
      setSendingPreview(true);
    }
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-lead-preview`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            leadId: lead.id,
            adminPassword,
            resend,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to send preview");
      }

      toast({
        title: resend ? "Preview Resent!" : "Preview Sent!",
        description: `Email sent to ${lead.email}`,
      });

      onRefresh?.();
    } catch (error) {
      console.error("Send preview error:", error);
      toast({
        title: "Failed to Send",
        description: error instanceof Error ? error.message : "Failed to send preview email",
        variant: "destructive",
      });
    } finally {
      setSendingPreview(false);
      setResendingPreview(false);
    }
  };

  const handleSendFollowup = async (lead: Lead, resend = false) => {
    if (!adminPassword) return;

    if (resend) {
      setResendingFollowup(true);
    } else {
      setSendingFollowup(true);
    }
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-lead-followup`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            leadId: lead.id,
            adminPassword,
            resend,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to send follow-up");
      }

      toast({
        title: resend ? "Follow-up Resent!" : "Follow-up Sent!",
        description: `$5 discount email sent to ${lead.email}`,
      });

      onRefresh?.();
    } catch (error) {
      console.error("Send follow-up error:", error);
      toast({
        title: "Failed to Send",
        description: error instanceof Error ? error.message : "Failed to send follow-up email",
        variant: "destructive",
      });
    } finally {
      setSendingFollowup(false);
      setResendingFollowup(false);
    }
  };

  const updateLeadPreviewSchedule = async (leadId: string, scheduledAt: Date | null) => {
    if (!adminPassword) return;

    // Using backend function because leads table is not client-updatable (RLS).
    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "update_lead_preview_schedule",
        leadId,
        previewScheduledAt: scheduledAt ? scheduledAt.toISOString() : null,
        adminPassword,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || "Failed to update schedule");
    }

    return await response.json();
  };

  const handleCancelAutoSend = async (lead: Lead) => {
    if (!adminPassword) return;
    setCancellingAutoSend(true);
    try {
      await updateLeadPreviewSchedule(lead.id, null);
      toast({
        title: "Auto-Send Cancelled",
        description: "The preview email will not be sent automatically",
      });
      onRefresh?.();
    } catch (error) {
      console.error("Cancel auto-send error:", error);
      toast({
        title: "Failed to Cancel",
        description: error instanceof Error ? error.message : "Failed to cancel auto-send",
        variant: "destructive",
      });
    } finally {
      setCancellingAutoSend(false);
    }
  };

  const handleDismissLead = async (lead: Lead, dismiss: boolean) => {
    if (!adminPassword) return;
    
    setDismissingLead(lead.id);
    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_lead_dismissal",
          leadId: lead.id,
          dismissed: dismiss,
          adminPassword,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to update lead");
      }

      toast({
        title: dismiss ? "Lead Dismissed" : "Lead Restored",
        description: dismiss 
          ? `${lead.customer_name} has been archived` 
          : `${lead.customer_name} has been restored to active leads`,
      });

      onRefresh?.();
    } catch (error) {
      console.error("Dismiss lead error:", error);
      toast({
        title: "Failed to Update",
        description: error instanceof Error ? error.message : "Failed to update lead",
        variant: "destructive",
      });
    } finally {
      setDismissingLead(null);
    }
  };

  // Check if lead has pending auto-send
  const hasScheduledAutoSend = (lead: Lead) => {
    return lead.preview_scheduled_at && 
           !lead.preview_sent_at && 
           lead.status === "song_ready" &&
           new Date(lead.preview_scheduled_at) > new Date();
  };

  // Get time until auto-send
  const getAutoSendTimeRemaining = (lead: Lead) => {
    if (!lead.preview_scheduled_at) return null;
    const scheduledTime = new Date(lead.preview_scheduled_at);
    const now = new Date();
    const diffMs = scheduledTime.getTime() - now.getTime();
    if (diffMs <= 0) return "any moment";
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  const toggleAudioPlayback = (url: string) => {
    if (playingAudio === url) {
      audioRef.current?.pause();
      setPlayingAudio(null);
    } else {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      audioRef.current = new Audio(url);
      audioRef.current.play();
      audioRef.current.onended = () => setPlayingAudio(null);
      setPlayingAudio(url);
    }
  };

  const exportToCSV = () => {
    if (filteredLeads.length === 0) return;

    const headers = [
      "Lead Name",
      "Lead Email",
      "Lead Phone",
      "Recipient Name",
      "Recipient Type",
      "Occasion",
      "Genre",
      "Singer",
      "Status",
      "Quality Score",
      "Captured At",
      "Preview Sent",
      "Follow-up Sent",
    ];

    const rows = filteredLeads.map((lead) => [
      lead.customer_name,
      lead.email,
      lead.phone || "",
      lead.recipient_name,
      lead.recipient_type,
      lead.occasion,
      lead.genre,
      lead.singer_preference,
      lead.status,
      lead.quality_score?.toString() || "",
      new Date(lead.captured_at).toLocaleString(),
      lead.preview_sent_at ? new Date(lead.preview_sent_at).toLocaleString() : "",
      lead.follow_up_sent_at ? new Date(lead.follow_up_sent_at).toLocaleString() : "",
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `leads-${statusFilter}-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Check if lead is eligible for follow-up (24+ hours after preview sent, not converted, opened preview)
  const isEligibleForFollowup = (lead: Lead) => {
    if (lead.status === "converted" || lead.follow_up_sent_at) return false;
    if (!lead.preview_sent_at) return false;
    const previewSentTime = new Date(lead.preview_sent_at).getTime();
    const hoursSincePreview = (Date.now() - previewSentTime) / (1000 * 60 * 60);
    return hoursSincePreview >= 24;
  };

  const handleSaveLeadEdits = async () => {
    if (!selectedLead || !adminPassword) return;

    setSavingLeadEdits(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_lead_fields",
          leadId: selectedLead.id,
          updates: editedLead,
          adminPassword,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to save changes");
      }

      const data = await response.json();

      toast({
        title: "Changes Saved",
        description: "Lead information updated successfully",
      });

      // Update local state
      setSelectedLead(data.lead);
      setIsEditingLead(false);
      setEditedLead({});
      onRefresh?.();
    } catch (err) {
      console.error("Save lead edits error:", err);
      toast({
        title: "Failed to Save",
        description: err instanceof Error ? err.message : "Failed to save changes",
        variant: "destructive",
      });
    } finally {
      setSavingLeadEdits(false);
    }
  };

  const startEditingLead = () => {
    if (!selectedLead) return;
    setEditedLead({
      customer_name: selectedLead.customer_name,
      email: selectedLead.email,
      phone: selectedLead.phone || "",
      recipient_name: selectedLead.recipient_name,
      special_qualities: selectedLead.special_qualities,
      favorite_memory: selectedLead.favorite_memory,
      special_message: selectedLead.special_message || "",
    });
    setIsEditingLead(true);
  };

  const cancelEditingLead = () => {
    setIsEditingLead(false);
    setEditedLead({});
  };

  const handleConvertToOrder = async () => {
    if (!selectedLead || !adminPassword) return;

    setConvertingLead(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "convert_lead_to_order",
          leadId: selectedLead.id,
          price: convertPrice,
          adminPassword,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to convert lead");
      }

      const data = await response.json();

      toast({
        title: "Lead Converted to Order!",
        description: `Order ${data.order.id.slice(0, 8).toUpperCase()} created. Switch to Orders tab to manage.`,
      });

      setShowConvertDialog(false);
      setSelectedLead(null);
      onRefresh?.();
    } catch (err) {
      console.error("Convert lead error:", err);
      toast({
        title: "Failed to Convert",
        description: err instanceof Error ? err.message : "Failed to convert lead to order",
        variant: "destructive",
      });
    } finally {
      setConvertingLead(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4 flex-wrap">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Leads</SelectItem>
              <SelectItem value="lead">Unconverted (No Song)</SelectItem>
              <SelectItem value="song_ready">Song Ready</SelectItem>
              <SelectItem value="preview_sent">Preview Sent</SelectItem>
              <SelectItem value="converted">Converted</SelectItem>
            </SelectContent>
          </Select>
          <Select value={qualityFilter} onValueChange={setQualityFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Quality" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Quality</SelectItem>
              <SelectItem value="high">High (70+)</SelectItem>
              <SelectItem value="medium">Medium (40-69)</SelectItem>
              <SelectItem value="low">Low (&lt;40)</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={(v) => onSortChange(v as "latest" | "oldest" | "quality")}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="latest">Latest First</SelectItem>
              <SelectItem value="oldest">Oldest First</SelectItem>
              <SelectItem value="quality">By Quality</SelectItem>
            </SelectContent>
          </Select>
          <Select value={dismissedFilter} onValueChange={(v) => setDismissedFilter(v as "active" | "dismissed" | "all")}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Show" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active Only</SelectItem>
              <SelectItem value="dismissed">Dismissed</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
          <Input
            placeholder="Search leads..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-64"
          />
          <span className="text-sm text-muted-foreground">
            {filteredLeads.length} lead{filteredLeads.length !== 1 ? "s" : ""}
          </span>
        </div>
        <Button variant="outline" size="sm" onClick={exportToCSV} disabled={filteredLeads.length === 0}>
          <Download className="h-4 w-4 mr-2" />
          Export CSV
        </Button>
      </div>

      {loading ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">Loading leads...</p>
          </CardContent>
        </Card>
      ) : filteredLeads.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No leads found</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredLeads.map((lead) => (
            <Card 
              key={lead.id} 
              className={`hover:shadow-md transition-shadow ${lead.dismissed_at ? 'opacity-60 bg-muted/50' : ''} ${lead.status === "converted" ? 'border-2 border-green-500 bg-green-50/30 dark:bg-green-950/20' : ''}`}
            >
              <CardContent className="p-6">
                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-3 flex-wrap">
                      <h3 className={`font-semibold text-lg ${lead.dismissed_at ? 'line-through text-muted-foreground' : ''}`}>
                        {lead.customer_name}
                      </h3>
                      {/* Prominent CONVERTED badge */}
                      {lead.status === "converted" && (
                        <Badge className="bg-green-600 text-white font-semibold">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          CONVERTED
                        </Badge>
                      )}
                      {/* Prominent SONG SENT badge */}
                      {lead.preview_sent_at && lead.status !== "converted" && (
                        <Badge className="bg-emerald-500 text-white font-semibold">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          SONG SENT
                        </Badge>
                      )}
                      {/* Dismissed badge */}
                      {lead.dismissed_at && (
                        <Badge variant="outline" className="border-gray-400 text-gray-500">
                          <Archive className="h-3 w-3 mr-1" />
                          Dismissed
                        </Badge>
                      )}
                      {!lead.dismissed_at && lead.status !== "converted" && (
                        <Badge className={statusColors[lead.status] || "bg-gray-100 text-gray-800"}>
                          {statusLabels[lead.status] || lead.status}
                        </Badge>
                      )}
                      {lead.preview_opened_at && !lead.converted_at && !lead.dismissed_at && (
                        <Badge variant="outline" className="border-purple-500 text-purple-600">
                          <Eye className="h-3 w-3 mr-1" />
                          Viewed
                        </Badge>
                      )}
                      {/* Engagement: Preview Played badge */}
                      {lead.preview_played_at && !lead.dismissed_at && (
                        <Badge variant="outline" className="border-green-500 text-green-600">
                          <Play className="h-3 w-3 mr-1" />
                          Played {lead.preview_play_count || 1}x
                        </Badge>
                      )}
                      {isEligibleForFollowup(lead) && !lead.dismissed_at && (
                        <Badge variant="outline" className="border-orange-500 text-orange-600">
                          <Gift className="h-3 w-3 mr-1" />
                          Follow-up Ready
                        </Badge>
                      )}
                      {/* Quality Score Badge */}
                      {!lead.dismissed_at && (() => {
                        const quality = getQualityBadge(lead.quality_score);
                        const IconComponent = quality.icon;
                        return (
                          <Badge className={quality.className}>
                            {IconComponent && <IconComponent className="h-3 w-3 mr-1" />}
                            Q: {quality.label}
                          </Badge>
                        );
                      })()}
                      {/* UTM Source Badge */}
                      {lead.utm_source && !lead.dismissed_at && (
                        <Badge variant="outline" className="border-blue-300 text-blue-600">
                          {lead.utm_source}{lead.utm_medium ? ` / ${lead.utm_medium}` : ""}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      <strong>Lead Email:</strong> {lead.email}
                      {lead.phone && <> • <strong>Phone:</strong> {lead.phone}</>}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      <strong>Song for:</strong> {lead.recipient_name} ({lead.recipient_type}) •{" "}
                      <strong>Occasion:</strong> {lead.occasion}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      <strong>Captured:</strong> {formatAdminDate(lead.captured_at)}
                    </p>
                    {lead.preview_sent_at && (
                      <p className="text-sm text-emerald-600 font-medium">
                        <CheckCircle2 className="h-3 w-3 inline mr-1" />
                        <strong>Preview sent:</strong> {formatAdminDate(lead.preview_sent_at)}
                      </p>
                    )}
                    {lead.follow_up_sent_at && (
                      <p className="text-sm text-orange-600">
                        <Gift className="h-3 w-3 inline mr-1" />
                        <strong>Follow-up sent:</strong> {formatAdminDate(lead.follow_up_sent_at)}
                      </p>
                    )}
                    {hasScheduledAutoSend(lead) && !lead.dismissed_at && (
                      <p className="text-sm text-muted-foreground">
                        <Timer className="h-3 w-3 inline mr-1" />
                        <strong>Auto-send in:</strong> {getAutoSendTimeRemaining(lead)}
                      </p>
                    )}
                    {/* Converted lead shows linked order */}
                    {lead.status === "converted" && lead.order_id && (
                      <p className="text-sm text-green-600 font-medium">
                        <CheckCircle2 className="h-3 w-3 inline mr-1" />
                        <strong>Converted to Order:</strong>{" "}
                        <span className="font-mono">{lead.order_id.slice(0, 8).toUpperCase()}</span>
                        {lead.converted_at && (
                          <span className="text-muted-foreground font-normal ml-2">
                            on {formatAdminDateShort(lead.converted_at)}
                          </span>
                        )}
                      </p>
                    )}
                    {lead.dismissed_at && (
                      <p className="text-sm text-gray-500 italic">
                        Dismissed: {formatAdminDate(lead.dismissed_at)}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {/* Show restore button for dismissed leads */}
                    {lead.dismissed_at ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDismissLead(lead, false)}
                        disabled={dismissingLead === lead.id}
                      >
                        <RotateCcw className="h-4 w-4 mr-2" />
                        {dismissingLead === lead.id ? "Restoring..." : "Restore"}
                      </Button>
                    ) : (
                      <>
                        {/* Upload Song button - show for unconverted leads without a song */}
                        {lead.status === "lead" && !lead.full_song_url && (
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => setSelectedLead(lead)}
                          >
                            <Upload className="h-4 w-4 mr-2" />
                            Upload Song
                          </Button>
                        )}
                        {/* Preview audio button */}
                        {lead.preview_song_url && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => toggleAudioPlayback(lead.preview_song_url!)}
                          >
                            {playingAudio === lead.preview_song_url ? (
                              <Pause className="h-4 w-4 mr-2" />
                            ) : (
                              <Play className="h-4 w-4 mr-2" />
                            )}
                            Preview
                          </Button>
                        )}
                        {/* Send preview button - show when song ready but not sent */}
                        {lead.status === "song_ready" && lead.preview_song_url && !lead.preview_sent_at && (
                          <>
                            <Button
                              size="sm"
                              onClick={() => handleSendPreview(lead)}
                              disabled={sendingPreview}
                            >
                              <Send className="h-4 w-4 mr-2" />
                              {sendingPreview ? "Sending..." : "Send Now"}
                            </Button>
                            {hasScheduledAutoSend(lead) && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleCancelAutoSend(lead)}
                                disabled={cancellingAutoSend}
                              >
                                <X className="h-4 w-4 mr-2" />
                                {cancellingAutoSend ? "Cancelling..." : "Cancel Auto"}
                              </Button>
                            )}
                          </>
                        )}
                        {/* Resend preview button - show when preview was already sent */}
                        {lead.preview_sent_at && lead.status !== "converted" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleSendPreview(lead, true)}
                            disabled={resendingPreview}
                          >
                            <RefreshCw className="h-4 w-4 mr-2" />
                            {resendingPreview ? "Resending..." : "Resend Preview"}
                          </Button>
                        )}
                        {/* Send follow-up button */}
                        {isEligibleForFollowup(lead) && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleSendFollowup(lead)}
                            disabled={sendingFollowup}
                          >
                            <Gift className="h-4 w-4 mr-2" />
                            {sendingFollowup ? "Sending..." : "Send $5 Follow-up"}
                          </Button>
                        )}
                        {/* Resend follow-up button - show when follow-up was already sent */}
                        {lead.follow_up_sent_at && lead.status !== "converted" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleSendFollowup(lead, true)}
                            disabled={resendingFollowup}
                          >
                            <RefreshCw className="h-4 w-4 mr-2" />
                            {resendingFollowup ? "Resending..." : "Resend Follow-up"}
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedLead(lead)}
                        >
                          <Eye className="h-4 w-4 mr-2" />
                          View Details
                        </Button>
                        {/* Dismiss button */}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => handleDismissLead(lead, true)}
                          disabled={dismissingLead === lead.id}
                        >
                          <Archive className="h-4 w-4 mr-2" />
                          {dismissingLead === lead.id ? "..." : "Dismiss"}
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!selectedLead} onOpenChange={(open) => {
        if (!open) {
          setSelectedLead(null);
          setIsEditingLead(false);
          setEditedLead({});
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {selectedLead && (
            <>
              <DialogHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <DialogTitle>Lead Details</DialogTitle>
                    <DialogDescription>
                      Lead ID: {selectedLead.id.slice(0, 8).toUpperCase()}
                    </DialogDescription>
                  </div>
                  {selectedLead.status !== "converted" && (
                    !isEditingLead ? (
                      <Button variant="outline" size="sm" onClick={startEditingLead}>
                        <Pencil className="h-4 w-4 mr-2" />
                        Edit
                      </Button>
                    ) : (
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={cancelEditingLead} disabled={savingLeadEdits}>
                          <X className="h-4 w-4 mr-2" />
                          Cancel
                        </Button>
                        <Button size="sm" onClick={handleSaveLeadEdits} disabled={savingLeadEdits}>
                          <Save className="h-4 w-4 mr-2" />
                          {savingLeadEdits ? "Saving..." : "Save"}
                        </Button>
                      </div>
                    )
                  )}
                </div>
              </DialogHeader>

              <div className="space-y-6 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-medium text-sm text-muted-foreground mb-1">Lead Name</h4>
                    {isEditingLead ? (
                      <div className="space-y-2">
                        <div>
                          <Label className="text-xs">Name</Label>
                          <Input
                            value={editedLead.customer_name || ""}
                            onChange={(e) => setEditedLead({ ...editedLead, customer_name: e.target.value })}
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Email</Label>
                          <Input
                            type="email"
                            value={editedLead.email || ""}
                            onChange={(e) => setEditedLead({ ...editedLead, email: e.target.value })}
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Phone</Label>
                          <Input
                            value={editedLead.phone || ""}
                            onChange={(e) => setEditedLead({ ...editedLead, phone: e.target.value })}
                          />
                        </div>
                      </div>
                    ) : (
                      <>
                        <p>{selectedLead.customer_name}</p>
                        <p className="text-sm text-muted-foreground"><strong>Email:</strong> {selectedLead.email}</p>
                        {selectedLead.phone && (
                          <p className="text-sm text-muted-foreground"><strong>Phone:</strong> {selectedLead.phone}</p>
                        )}
                      </>
                    )}
                  </div>
                  <div>
                    <h4 className="font-medium text-sm text-muted-foreground mb-1">Recipient</h4>
                    {isEditingLead ? (
                      <div>
                        <Label className="text-xs">Name</Label>
                        <Input
                          value={editedLead.recipient_name || ""}
                          onChange={(e) => setEditedLead({ ...editedLead, recipient_name: e.target.value })}
                        />
                        <p className="text-sm text-muted-foreground mt-1">{selectedLead.recipient_type}</p>
                      </div>
                    ) : (
                      <>
                        <p>{selectedLead.recipient_name}</p>
                        <p className="text-sm text-muted-foreground">{selectedLead.recipient_type}</p>
                      </>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-medium text-sm text-muted-foreground mb-1">Occasion</h4>
                    <p>{selectedLead.occasion}</p>
                  </div>
                  <div>
                    <h4 className="font-medium text-sm text-muted-foreground mb-1">Music</h4>
                    <p>{selectedLead.genre} • {selectedLead.singer_preference}</p>
                  </div>
                </div>

                <div>
                  <h4 className="font-medium text-sm text-muted-foreground mb-1">Special Qualities</h4>
                  {isEditingLead ? (
                    <Textarea
                      value={editedLead.special_qualities || ""}
                      onChange={(e) => setEditedLead({ ...editedLead, special_qualities: e.target.value })}
                      rows={3}
                    />
                  ) : (
                    <p className="text-sm">{selectedLead.special_qualities}</p>
                  )}
                </div>

                <div>
                  <h4 className="font-medium text-sm text-muted-foreground mb-1">Favorite Memory</h4>
                  {isEditingLead ? (
                    <Textarea
                      value={editedLead.favorite_memory || ""}
                      onChange={(e) => setEditedLead({ ...editedLead, favorite_memory: e.target.value })}
                      rows={3}
                    />
                  ) : (
                    <p className="text-sm">{selectedLead.favorite_memory}</p>
                  )}
                </div>

                <div>
                  <h4 className="font-medium text-sm text-muted-foreground mb-1">Special Message</h4>
                  {isEditingLead ? (
                    <Textarea
                      value={editedLead.special_message || ""}
                      onChange={(e) => setEditedLead({ ...editedLead, special_message: e.target.value })}
                      rows={2}
                    />
                  ) : (
                    selectedLead.special_message ? (
                      <p className="text-sm">{selectedLead.special_message}</p>
                    ) : (
                      <p className="text-sm text-muted-foreground italic">No special message</p>
                    )
                  )}
                </div>

                {/* Convert to Order section - for unconverted leads */}
                {selectedLead.status !== "converted" && (
                  <div className="border-t pt-4">
                    <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-lg p-4">
                      <div className="flex items-start gap-3">
                        <ArrowRightCircle className="h-5 w-5 text-amber-600 mt-0.5" />
                        <div className="flex-1">
                          <h4 className="font-medium text-amber-800 dark:text-amber-200">Convert to Order</h4>
                          <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                            Use when customer paid via Stripe but order wasn't created (webhook failure).
                            Verify payment in Stripe first.
                          </p>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="mt-3 border-amber-300 text-amber-700 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-900/50"
                            onClick={() => setShowConvertDialog(true)}
                          >
                            <ArrowRightCircle className="h-4 w-4 mr-2" />
                            Convert to Order
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Upload Song Section - show for new leads OR to replace existing song */}
                {(selectedLead.status !== "converted") && (
                  <div className="border-t pt-4">
                    <h4 className="font-medium mb-3">
                      {selectedLead.full_song_url ? "Replace Song" : "Upload Song for Lead Recovery"}
                    </h4>
                    
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
                            {selectedLead.full_song_url && (
                              <p className="text-xs text-amber-600 mt-1">
                                This will replace the existing song
                              </p>
                            )}
                          </div>
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept=".mp3,.wav,.m4a,.ogg,.flac,audio/*"
                            onChange={handleFileSelect}
                            className="hidden"
                            id="lead-song-upload"
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
                                {uploadingFile ? "Uploading..." : selectedLead.full_song_url ? "Replace" : "Upload"}
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
                )}

                {/* Song Info - show when song is uploaded */}
                {selectedLead.full_song_url && (
                  <div className="border-t pt-4">
                    <h4 className="font-medium mb-3">Song Details</h4>
                    <div className="space-y-2">
                      {selectedLead.song_title && (
                        <p className="text-sm"><strong>Title:</strong> {selectedLead.song_title}</p>
                      )}
                      {selectedLead.preview_token && (
                        <p className="text-sm">
                          <strong>Preview URL:</strong>{" "}
                          <a 
                            href={`https://personalsonggifts.lovable.app/preview/${selectedLead.preview_token}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline"
                          >
                            /preview/{selectedLead.preview_token}
                          </a>
                        </p>
                      )}
                      
                      {/* Auto-send status */}
                      {hasScheduledAutoSend(selectedLead) && (
                        <div className="bg-muted/40 border border-border rounded-lg p-3 mt-3">
                          <div className="flex items-center gap-2 text-foreground">
                            <Timer className="h-4 w-4" />
                            <span className="font-medium">Auto-send scheduled</span>
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">
                            Preview email will be sent automatically in {getAutoSendTimeRemaining(selectedLead)}
                            {selectedLead.preview_scheduled_at && (
                              <span className="block text-xs mt-1">
                                ({formatAdminDate(selectedLead.preview_scheduled_at)})
                              </span>
                            )}
                          </p>
                        </div>
                      )}

                      {/* Already sent indicator */}
                      {selectedLead.preview_sent_at && (
                        <div className="bg-muted/40 border border-border rounded-lg p-3 mt-3">
                          <div className="flex items-center gap-2 text-foreground">
                            <Check className="h-4 w-4" />
                            <span className="font-medium">Preview email sent</span>
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">
                            Sent on {formatAdminDate(selectedLead.preview_sent_at)}
                          </p>
                        </div>
                      )}

                      {/* Order-like timing controls */}
                      {!selectedLead.preview_sent_at && selectedLead.status === "song_ready" && (
                        <div className="mt-4">
                          <LeadPreviewTimingPicker
                            mode={previewTimingMode}
                            scheduledAt={previewScheduledAt}
                            onModeChange={(mode) => {
                              setPreviewTimingMode(mode);

                              // Keep scheduledAt consistent with mode
                              if (mode === "paused" || mode === "send_now") {
                                setPreviewScheduledAt(null);
                                return;
                              }

                              if (mode === "auto_24h" && !previewScheduledAt) {
                                setPreviewScheduledAt(new Date(Date.now() + 24 * 60 * 60 * 1000));
                              }

                              if (mode === "custom" && !previewScheduledAt) {
                                setPreviewScheduledAt(new Date(Date.now() + 24 * 60 * 60 * 1000));
                              }
                            }}
                            onScheduledAtChange={setPreviewScheduledAt}
                          />

                          <div className="mt-3 flex flex-col sm:flex-row gap-2">
                            <Button
                              onClick={async () => {
                                if (!selectedLead) return;
                                if (previewTimingMode === "send_now") {
                                  await handleSendPreview(selectedLead);
                                  return;
                                }

                                setSavingPreviewTiming(true);
                                try {
                                  const next =
                                    previewTimingMode === "auto_24h"
                                      ? (previewScheduledAt ?? new Date(Date.now() + 24 * 60 * 60 * 1000))
                                      : previewTimingMode === "custom"
                                        ? previewScheduledAt
                                        : null;

                                  await updateLeadPreviewSchedule(selectedLead.id, next ?? null);

                                  toast({
                                    title: "Preview timing saved",
                                    description:
                                      next
                                        ? `Scheduled for ${next.toLocaleString("en-US", { timeZone: "America/Los_Angeles" })} PST`
                                        : "Auto-send cancelled (paused)",
                                  });

                                  // Keep local selectedLead in sync
                                  setSelectedLead({
                                    ...selectedLead,
                                    preview_scheduled_at: next ? next.toISOString() : null,
                                  });

                                  onRefresh?.();
                                } catch (e) {
                                  const msg = e instanceof Error ? e.message : "Failed to save";
                                  toast({ title: "Save failed", description: msg, variant: "destructive" });
                                } finally {
                                  setSavingPreviewTiming(false);
                                }
                              }}
                              disabled={
                                savingPreviewTiming ||
                                (previewTimingMode === "custom" && !previewScheduledAt) ||
                                sendingPreview
                              }
                            >
                              {previewTimingMode === "send_now"
                                ? "Send Preview Email Now"
                                : savingPreviewTiming
                                  ? "Saving..."
                                  : "Save Timing"}
                            </Button>

                            {selectedLead.preview_scheduled_at && !selectedLead.preview_sent_at && (
                              <Button
                                variant="outline"
                                onClick={() => handleCancelAutoSend(selectedLead)}
                                disabled={cancellingAutoSend}
                              >
                                {cancellingAutoSend ? "Cancelling..." : "Cancel Scheduled Send"}
                              </Button>
                            )}
                          </div>
                        </div>
                      )}

                      <div className="flex gap-2 mt-3">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => selectedLead.preview_song_url && toggleAudioPlayback(selectedLead.preview_song_url)}
                        >
                          {playingAudio === selectedLead.preview_song_url ? (
                            <Pause className="h-4 w-4 mr-2" />
                          ) : (
                            <Play className="h-4 w-4 mr-2" />
                          )}
                          Preview (35s)
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => selectedLead.full_song_url && toggleAudioPlayback(selectedLead.full_song_url)}
                        >
                          {playingAudio === selectedLead.full_song_url ? (
                            <Pause className="h-4 w-4 mr-2" />
                          ) : (
                            <Play className="h-4 w-4 mr-2" />
                          )}
                          Full Song
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                <div className="border-t pt-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Status:</span>{" "}
                      <Badge className={statusColors[selectedLead.status]}>
                        {statusLabels[selectedLead.status] || selectedLead.status}
                      </Badge>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Quality Score:</span>{" "}
                      {(() => {
                        const quality = getQualityBadge(selectedLead.quality_score);
                        const IconComponent = quality.icon;
                        return (
                          <Badge className={quality.className}>
                            {IconComponent && <IconComponent className="h-3 w-3 mr-1" />}
                            {quality.label}
                          </Badge>
                        );
                      })()}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Captured:</span>{" "}
                      {formatAdminDate(selectedLead.captured_at)}
                    </div>
                    {selectedLead.preview_sent_at && (
                      <div>
                        <span className="text-muted-foreground">Preview Sent:</span>{" "}
                        {formatAdminDate(selectedLead.preview_sent_at)}
                      </div>
                    )}
                    {selectedLead.preview_opened_at && (
                      <div>
                        <span className="text-muted-foreground">Preview Opened:</span>{" "}
                        {formatAdminDate(selectedLead.preview_opened_at)}
                      </div>
                    )}
                    {selectedLead.follow_up_sent_at && (
                      <div>
                        <span className="text-muted-foreground">Follow-up Sent:</span>{" "}
                        {formatAdminDate(selectedLead.follow_up_sent_at)}
                      </div>
                    )}
                    {selectedLead.converted_at && (
                      <div>
                        <span className="text-muted-foreground">Converted:</span>{" "}
                        {formatAdminDate(selectedLead.converted_at)}
                      </div>
                    )}
                    {selectedLead.order_id && (
                      <div>
                        <span className="text-muted-foreground">Order ID:</span>{" "}
                        <span className="font-mono">{selectedLead.order_id.slice(0, 8).toUpperCase()}</span>
                      </div>
                    )}
                    {/* Engagement tracking */}
                    {selectedLead.preview_played_at && (
                      <div>
                        <span className="text-muted-foreground">Preview Played:</span>{" "}
                        {formatAdminDate(selectedLead.preview_played_at)}
                        {selectedLead.preview_play_count && selectedLead.preview_play_count > 1 && (
                          <span className="ml-1 text-green-600">({selectedLead.preview_play_count} times)</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Traffic Source Section */}
                <div className="border-t pt-4">
                  <h4 className="font-medium mb-3">Traffic Source</h4>
                  {selectedLead.utm_source ? (
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-muted-foreground">Source:</span> {selectedLead.utm_source}
                      </div>
                      {selectedLead.utm_medium && (
                        <div>
                          <span className="text-muted-foreground">Medium:</span> {selectedLead.utm_medium}
                        </div>
                      )}
                      {selectedLead.utm_campaign && (
                        <div className="col-span-2">
                          <span className="text-muted-foreground">Campaign:</span> {selectedLead.utm_campaign}
                        </div>
                      )}
                      {selectedLead.utm_content && (
                        <div>
                          <span className="text-muted-foreground">Content:</span> {selectedLead.utm_content}
                        </div>
                      )}
                      {selectedLead.utm_term && (
                        <div>
                          <span className="text-muted-foreground">Term:</span> {selectedLead.utm_term}
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">Direct (no tracking data)</p>
                  )}
                </div>
              </div>

              <DialogFooter className="flex-col sm:flex-row gap-2 flex-wrap">
                <Button
                  variant="outline"
                  onClick={() => {
                    setSelectedLead(null);
                    setSelectedFile(null);
                    setIsEditingLead(false);
                    setEditedLead({});
                    if (fileInputRef.current) {
                      fileInputRef.current.value = "";
                    }
                  }}
                >
                  Close
                </Button>
                {/* Send Preview button in dialog - first time */}
                {selectedLead.status === "song_ready" && selectedLead.preview_song_url && !selectedLead.preview_sent_at && (
                  <>
                    <Button
                      onClick={() => handleSendPreview(selectedLead)}
                      disabled={sendingPreview}
                    >
                      <Send className="h-4 w-4 mr-2" />
                      {sendingPreview ? "Sending..." : "Send Now"}
                    </Button>
                    {hasScheduledAutoSend(selectedLead) && (
                      <Button
                        variant="destructive"
                        onClick={() => handleCancelAutoSend(selectedLead)}
                        disabled={cancellingAutoSend}
                      >
                        <X className="h-4 w-4 mr-2" />
                        {cancellingAutoSend ? "Cancelling..." : "Cancel Auto-Send"}
                      </Button>
                    )}
                  </>
                )}
                {/* Resend Preview button in dialog - when already sent */}
                {selectedLead.preview_sent_at && selectedLead.status !== "converted" && (
                  <Button
                    variant="outline"
                    onClick={() => handleSendPreview(selectedLead, true)}
                    disabled={resendingPreview}
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    {resendingPreview ? "Resending..." : "Resend Preview Email"}
                  </Button>
                )}
                {/* Send Follow-up button in dialog - first time */}
                {isEligibleForFollowup(selectedLead) && (
                  <Button
                    variant="secondary"
                    onClick={() => handleSendFollowup(selectedLead)}
                    disabled={sendingFollowup}
                  >
                    <Gift className="h-4 w-4 mr-2" />
                    {sendingFollowup ? "Sending..." : "Send $5 Follow-up"}
                  </Button>
                )}
                {/* Resend Follow-up button in dialog - when already sent */}
                {selectedLead.follow_up_sent_at && selectedLead.status !== "converted" && (
                  <Button
                    variant="outline"
                    onClick={() => handleSendFollowup(selectedLead, true)}
                    disabled={resendingFollowup}
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    {resendingFollowup ? "Resending..." : "Resend Follow-up"}
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Convert to Order Confirmation Dialog */}
      <AlertDialog open={showConvertDialog} onOpenChange={setShowConvertDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Convert Lead to Order</AlertDialogTitle>
            <AlertDialogDescription>
              This will create a new order from this lead's information. Use this when a customer has already paid via Stripe but the order wasn't created automatically (webhook failure).
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          <div className="py-4">
            <Label className="text-sm font-medium">Price Paid</Label>
            <RadioGroup 
              value={convertPrice.toString()} 
              onValueChange={(v) => setConvertPrice(parseInt(v))}
              className="mt-2"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="4900" id="price-standard" />
                <Label htmlFor="price-standard" className="cursor-pointer">$49 (Standard)</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="7900" id="price-priority" />
                <Label htmlFor="price-priority" className="cursor-pointer">$79 (Priority)</Label>
              </div>
            </RadioGroup>
            
            {selectedLead && (
              <div className="mt-4 p-3 bg-muted rounded-lg text-sm">
                <p><strong>Customer:</strong> {selectedLead.customer_name}</p>
                <p><strong>Email:</strong> {selectedLead.email}</p>
                <p><strong>Song for:</strong> {selectedLead.recipient_name}</p>
                {selectedLead.full_song_url && (
                  <p className="text-green-600 mt-1">✓ Song already uploaded - will be included in order</p>
                )}
              </div>
            )}
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={convertingLead}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConvertToOrder} disabled={convertingLead}>
              {convertingLead ? "Converting..." : "Convert to Order"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

