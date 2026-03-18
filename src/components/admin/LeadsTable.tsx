import { useState, useRef, useEffect, useCallback } from "react";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Download, Eye, Users, Upload, FileAudio, Play, Pause, Send, Clock, Gift, Star, AlertTriangle, Check, X, Timer, CheckCircle2, Archive, RotateCcw, RefreshCw, Search, Pencil, Save, ArrowRightCircle, Wand2, Loader2, AlertCircle, Bot, Copy } from "lucide-react";
import { formatAdminDate, formatAdminDateShort } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { LeadPreviewTimingPicker, type LeadPreviewTimingMode } from "@/components/admin/LeadPreviewTimingPicker";
import { createAudioPreview } from "@/lib/audioClipper";
import { AlbumArtUpload } from "@/components/admin/AlbumArtUpload";
import { genreOptions, singerOptions, occasionOptions, languageOptions, getLanguageLabel } from "@/components/admin/adminDropdownOptions";
import { getCountryFromTimezone } from "@/lib/timezoneCountry";

export interface Lead {
  id: string;
  email: string;
  phone: string | null;
  lead_email_override?: string | null;
  lead_email_cc?: string | null;
  preview_sent_to_emails?: string[] | null;
  customer_name: string;
  recipient_name: string;
  recipient_type: string;
  recipient_name_pronunciation?: string | null;
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
  // Automation fields
  automation_status?: string | null;
  automation_task_id?: string | null;
  automation_retry_count?: number | null;
  automation_last_error?: string | null;
  automation_started_at?: string | null;
  automation_lyrics?: string | null;
  automation_style_id?: string | null;
  automation_manual_override_at?: string | null;
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
  // Previous version backup
  prev_song_url?: string | null;
  prev_automation_lyrics?: string | null;
  prev_cover_image_url?: string | null;
}

interface LeadsTableProps {
  leads: Lead[];
  loading: boolean;
  sort: "latest" | "oldest" | "quality";
  onSortChange: (sort: "latest" | "oldest" | "quality") => void;
  adminPassword?: string;
  onRefresh?: () => void;
  onNavigateToOrder?: (orderId: string) => void;
  initialSelectedLeadId?: string | null;
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

export function LeadsTable({ leads, loading, sort, onSortChange, adminPassword, onRefresh, onNavigateToOrder, initialSelectedLeadId }: LeadsTableProps) {
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
  // Automation state
  const [triggeringAutomation, setTriggeringAutomation] = useState<string | null>(null);
  const [convertingLead, setConvertingLead] = useState(false);
  const [stoppingAutomation, setStoppingAutomation] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  // Regenerate song state
  const [showRegenerateDialog, setShowRegenerateDialog] = useState(false);
  const [regenerateMode, setRegenerateMode] = useState<"new" | "with_lyrics">("new");
  const [regenerateSendOption, setRegenerateSendOption] = useState<"immediate" | "scheduled" | "auto">("auto");
  const [regenerateScheduledAt, setRegenerateScheduledAt] = useState<Date | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  // Restore previous version state
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
  const [restoringPreviousVersion, setRestoringPreviousVersion] = useState(false);
  // Lyrics editing state
  const [editingLeadLyrics, setEditingLeadLyrics] = useState(false);
  const [editedLeadLyricsText, setEditedLeadLyricsText] = useState("");
  const [savingLeadLyrics, setSavingLeadLyrics] = useState(false);
  // Song title editing state
  const [editingLeadTitle, setEditingLeadTitle] = useState(false);
  const [editedLeadTitle, setEditedLeadTitle] = useState("");
  const [savingLeadTitle, setSavingLeadTitle] = useState(false);
  // Auto-open lead from external navigation (e.g., Hot Leads card)
  useEffect(() => {
    if (initialSelectedLeadId) {
      const lead = leads.find((l) => l.id === initialSelectedLeadId);
      if (lead) { setSelectedLead(lead); fetchLeadDetail(lead.id); }
    }
  }, [initialSelectedLeadId, leads]);

  // Fetch full lead detail (includes automation_lyrics) when a lead is selected
  const fetchLeadDetail = useCallback(async (leadId: string) => {
    if (!adminPassword) return;
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-orders`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "get_lead_detail", leadId, adminPassword }),
        }
      );
      if (!response.ok) return;
      const data = await response.json();
      if (data?.lead) {
        setSelectedLead(prev => prev?.id === leadId ? { ...prev, ...data.lead } : prev);
      }
    } catch (err) {
      console.error("Failed to fetch lead detail:", err);
    }
  }, [adminPassword]);

  const [currentPage, setCurrentPage] = useState(0);
  const PAGE_SIZE = 50;

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
      const rawSearch = searchQuery.trim();
      const urlMatch = rawSearch.match(/\/(?:preview|song)\/([A-Za-z0-9_-]+)/);
      const searchLower = (urlMatch ? urlMatch[1] : rawSearch).toLowerCase();
      return (
        lead.id.toLowerCase().includes(searchLower) ||
        lead.customer_name.toLowerCase().includes(searchLower) ||
        lead.email.toLowerCase().includes(searchLower) ||
        lead.recipient_name.toLowerCase().includes(searchLower) ||
        lead.genre.toLowerCase().includes(searchLower) ||
        lead.special_qualities.toLowerCase().includes(searchLower) ||
        lead.favorite_memory.toLowerCase().includes(searchLower) ||
        (lead.special_message?.toLowerCase().includes(searchLower) ?? false) ||
        (lead.singer_preference?.toLowerCase().includes(searchLower) ?? false) ||
        lead.occasion.toLowerCase().includes(searchLower) ||
        (lead.preview_song_url?.toLowerCase().includes(searchLower) ?? false) ||
        (lead.preview_token?.toLowerCase().includes(searchLower) ?? false) ||
        (lead.cover_image_url?.toLowerCase().includes(searchLower) ?? false)
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

  // Automation trigger handler
  const handleTriggerAutomation = async (lead: Lead, forceRun = false) => {
    if (!adminPassword) return;

    setTriggeringAutomation(lead.id);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/automation-trigger`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ leadId: lead.id, forceRun }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to start automation");
      }

      toast({
        title: "Song Generation Started",
        description: "AI is creating lyrics and audio. This takes 1-3 minutes.",
      });

      onRefresh?.();
    } catch (error) {
      console.error("Automation trigger error:", error);
      toast({
        title: "Automation Failed",
        description: error instanceof Error ? error.message : "Failed to start song generation",
        variant: "destructive",
      });
    } finally {
      setTriggeringAutomation(null);
    }
  };

  // Get automation status badge - with STUCK detection
  const getAutomationBadge = (lead: Lead) => {
    const status = lead.automation_status;
    if (!status) return null;

    // Check if stuck in audio_generating for more than 5 minutes
    const isStuck = status === "audio_generating" && 
      lead.automation_started_at && 
      (Date.now() - new Date(lead.automation_started_at).getTime()) > 5 * 60 * 1000;

    switch (status) {
      case "pending":
      case "lyrics_generating":
        return { label: "Generating Lyrics...", className: "bg-yellow-100 text-yellow-800", icon: Loader2, spin: true, isStuck: false };
      case "lyrics_ready":
        return { label: "Lyrics Ready", className: "bg-blue-100 text-blue-800", icon: Check, spin: false, isStuck: false };
      case "audio_generating":
        if (isStuck) {
          const elapsedMs = Date.now() - new Date(lead.automation_started_at!).getTime();
          const elapsedMin = Math.floor(elapsedMs / 60000);
          return { label: `STUCK (${elapsedMin}m)`, className: "bg-red-100 text-red-800 animate-pulse", icon: AlertCircle, spin: false, isStuck: true };
        }
        return { label: "Generating Audio...", className: "bg-purple-100 text-purple-800", icon: Loader2, spin: true, isStuck: false };
      case "completed":
        return { label: "AI Generated", className: "bg-green-100 text-green-800", icon: Wand2, spin: false, isStuck: false };
      case "failed":
        return { label: "Failed", className: "bg-red-100 text-red-800", icon: AlertCircle, spin: false, isStuck: false };
      case "manual":
        return { label: "Manual", className: "bg-gray-100 text-gray-600", icon: null, spin: false, isStuck: false };
      default:
        return null;
    }
  };

  // Handle manual audio recovery for stuck leads
  const handleRecoverAudio = async (lead: Lead) => {
    if (!adminPassword) return;

    try {
      toast({
        title: "Recovering...",
        description: "Attempting to recover audio generation",
      });

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "recover_audio",
          leadId: lead.id,
          adminPassword,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Recovery failed");
      }

      toast({
        title: "Recovery Triggered",
        description: "Checking audio status with provider. Refresh in a moment.",
      });

      // Refresh after a short delay
      setTimeout(() => onRefresh?.(), 2000);
    } catch (error) {
      console.error("Recovery error:", error);
      toast({
        title: "Recovery Failed",
        description: error instanceof Error ? error.message : "Failed to recover audio",
        variant: "destructive",
      });
    }
  };

  // Check if lead can trigger automation
  const canTriggerAutomation = (lead: Lead) => {
    // Already has a song or is converted - no need
    if (lead.preview_song_url || lead.status === "converted") return false;
    // Already running
    if (["pending", "lyrics_generating", "audio_generating"].includes(lead.automation_status || "")) return false;
    // Dismissed leads can't trigger
    if (lead.dismissed_at) return false;
    return true;
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

      // UX nudge if language changed
      if (editedLead.lyrics_language_code && 
          editedLead.lyrics_language_code !== selectedLead.lyrics_language_code) {
        toast({
          title: "Language Changed",
          description: "Click Regenerate Song to produce the new version.",
        });
      }

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
      lead_email_override: selectedLead.lead_email_override || "",
      lead_email_cc: selectedLead.lead_email_cc || "",
      recipient_name: selectedLead.recipient_name,
      recipient_name_pronunciation: selectedLead.recipient_name_pronunciation || "",
      occasion: selectedLead.occasion,
      genre: selectedLead.genre,
      singer_preference: selectedLead.singer_preference,
      special_qualities: selectedLead.special_qualities,
      favorite_memory: selectedLead.favorite_memory,
      special_message: selectedLead.special_message || "",
      lyrics_language_code: selectedLead.lyrics_language_code || "en",
    });
    setIsEditingLead(true);
  };

  const cancelEditingLead = () => {
    setIsEditingLead(false);
    setEditedLead({});
  };

  // Handler for regenerating lead song (supports both modes)
  const handleRegenerateLeadSong = async () => {
    if (!selectedLead || !adminPassword) return;
    
    setRegenerating(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: regenerateMode === "with_lyrics" ? "regenerate_with_lyrics" : "regenerate_song",
          leadId: selectedLead.id,
          sendOption: regenerateSendOption,
          scheduledAt: regenerateSendOption === "scheduled" && regenerateScheduledAt 
            ? regenerateScheduledAt.toISOString() 
            : null,
          adminPassword,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to regenerate song");
      }

      toast({
        title: regenerateMode === "with_lyrics" ? "Regeneration Started (Lyrics Preserved)" : "Regeneration Started",
        description: `Preview for ${selectedLead.recipient_name} is being regenerated. This will take 1-3 minutes.`,
      });

      setShowRegenerateDialog(false);
      setRegenerateMode("new");
      setRegenerateSendOption("auto");
      setRegenerateScheduledAt(null);
      setSelectedLead(null);
      onRefresh?.();
    } catch (err) {
      console.error("Regenerate lead song error:", err);
      toast({
        title: "Regeneration Failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setRegenerating(false);
    }
  };

  // Handler for restoring previous version of lead song
  const handleRestoreLeadPreviousVersion = async () => {
    if (!selectedLead || !adminPassword) return;
    setRestoringPreviousVersion(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "restore_previous_version",
          leadId: selectedLead.id,
          adminPassword,
        }),
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || "Restore failed");
      }
      const data = await response.json();
      toast({
        title: "Song Restored",
        description: `Previous version of the song for ${selectedLead.recipient_name} has been restored.`,
      });
      setShowRestoreConfirm(false);
      setSelectedLead({
        ...selectedLead,
        prev_song_url: null,
        prev_automation_lyrics: null,
        prev_cover_image_url: null,
        full_song_url: data?.restoredUrl ?? selectedLead.full_song_url,
        automation_lyrics: data?.lyricsRestored ? selectedLead.prev_automation_lyrics : selectedLead.automation_lyrics,
      });
      onRefresh?.();
    } catch (err) {
      console.error("Lead restore failed:", err);
      toast({
        title: "Restore Failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setRestoringPreviousVersion(false);
    }
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
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setCurrentPage(0); }}>
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
          <Select value={qualityFilter} onValueChange={(v) => { setQualityFilter(v); setCurrentPage(0); }}>
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
          <Select value={dismissedFilter} onValueChange={(v) => { setDismissedFilter(v as "active" | "dismissed" | "all"); setCurrentPage(0); }}>
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
            placeholder="Search by name, email, lead ID, or song link..."
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(0); }}
            className="w-64"
          />
          <span className="text-sm text-muted-foreground">
            {filteredLeads.length} lead{filteredLeads.length !== 1 ? "s" : ""}
            {filteredLeads.length > PAGE_SIZE && ` (page ${currentPage + 1} of ${Math.ceil(filteredLeads.length / PAGE_SIZE)})`}
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
          {filteredLeads.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE).map((lead) => (
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
                      {/* Automation Status Badge */}
                      {!lead.dismissed_at && (() => {
                        const automationBadge = getAutomationBadge(lead);
                        if (!automationBadge) return null;
                        const IconComponent = automationBadge.icon;
                        
                        // For stuck items, wrap in tooltip
                        if (automationBadge.isStuck) {
                          return (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge className={`${automationBadge.className} cursor-help`}>
                                  {IconComponent && <IconComponent className="h-3 w-3 mr-1" />}
                                  {automationBadge.label}
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs">
                                <p className="font-semibold">Audio Provider Callback Delayed</p>
                                <p className="text-xs mt-1">The audio provider hasn't responded yet.</p>
                                <p className="text-xs mt-1 text-green-600">System will auto-retry every minute.</p>
                              </TooltipContent>
                            </Tooltip>
                          );
                        }
                        
                        return (
                          <Badge className={automationBadge.className}>
                            {IconComponent && <IconComponent className={`h-3 w-3 mr-1 ${automationBadge.spin ? 'animate-spin' : ''}`} />}
                            {automationBadge.label}
                          </Badge>
                        );
                      })()}
                      {/* Automation Error Badge */}
                      {lead.automation_status === "failed" && lead.automation_last_error && !lead.dismissed_at && (
                        <Badge variant="outline" className="border-red-500 text-red-600 max-w-48 truncate" title={lead.automation_last_error}>
                          <AlertCircle className="h-3 w-3 mr-1 flex-shrink-0" />
                          <span className="truncate">{lead.automation_last_error}</span>
                        </Badge>
                      )}
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
                    {/* Converted lead shows linked order with navigation */}
                    {lead.status === "converted" && lead.order_id && (
                      <div className="space-y-2">
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
                        <div className="flex items-center gap-2 flex-wrap">
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs"
                            onClick={() => {
                              setSelectedLead(null);
                              onNavigateToOrder?.(lead.order_id!);
                            }}
                          >
                            <ArrowRightCircle className="h-3 w-3 mr-1" />
                            Manage Order
                          </Button>
                          <a
                            href={`https://www.personalsonggifts.com/song/${lead.order_id.slice(0, 8).toUpperCase()}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                          >
                            <Eye className="h-3 w-3" />
                            Song Page
                          </a>
                        </div>
                      </div>
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
                        {/* AI Generate Song button - show for leads that can trigger automation */}
                        {canTriggerAutomation(lead) && (
                          <Button
                            size="sm"
                            variant="default"
                             onClick={() => handleTriggerAutomation(lead, true)}
                            disabled={triggeringAutomation === lead.id}
                            className="bg-purple-600 hover:bg-purple-700"
                          >
                            {triggeringAutomation === lead.id ? (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                              <Wand2 className="h-4 w-4 mr-2" />
                            )}
                            {triggeringAutomation === lead.id ? "Starting..." : "AI Generate"}
                          </Button>
                        )}
                        {/* Upload Song button - show for unconverted leads without a song */}
                        {lead.status === "lead" && !lead.full_song_url && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => { setSelectedLead(lead); fetchLeadDetail(lead.id); }}
                          >
                            <Upload className="h-4 w-4 mr-2" />
                            Manual Upload
                          </Button>
                        )}
                        {/* Retry Automation button - show for failed automation */}
                        {lead.automation_status === "failed" && !lead.preview_song_url && !lead.dismissed_at && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleTriggerAutomation(lead, true)}
                            disabled={triggeringAutomation === lead.id}
                            className="border-orange-500 text-orange-600 hover:bg-orange-50"
                          >
                            {triggeringAutomation === lead.id ? (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                              <RefreshCw className="h-4 w-4 mr-2" />
                            )}
                            Retry AI
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
                          onClick={() => { setSelectedLead(lead); fetchLeadDetail(lead.id); }}
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
          {/* Pagination controls */}
          {filteredLeads.length > PAGE_SIZE && (
            <div className="flex items-center justify-between pt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
                disabled={currentPage === 0}
              >
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {currentPage + 1} of {Math.ceil(filteredLeads.length / PAGE_SIZE)}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.min(Math.ceil(filteredLeads.length / PAGE_SIZE) - 1, p + 1))}
                disabled={currentPage >= Math.ceil(filteredLeads.length / PAGE_SIZE) - 1}
              >
                Next
              </Button>
            </div>
          )}
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
                          <Label className="text-xs">Original Email (read-only)</Label>
                          <Input
                            value={selectedLead.email}
                            disabled
                            className="bg-muted"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Preview Email Override</Label>
                          <Input
                            type="email"
                            value={editedLead.lead_email_override || ""}
                            onChange={(e) => setEditedLead({ ...editedLead, lead_email_override: e.target.value })}
                            placeholder="Leave empty to use original email"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">CC Email (Optional)</Label>
                          <Input
                            type="email"
                            value={editedLead.lead_email_cc || ""}
                            onChange={(e) => setEditedLead({ ...editedLead, lead_email_cc: e.target.value })}
                            placeholder="Add additional recipient"
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
                        <p className="text-sm text-muted-foreground">
                          <strong>Email:</strong> {selectedLead.lead_email_override || selectedLead.email}
                          {selectedLead.lead_email_override && (
                            <span className="text-xs text-orange-600 ml-1">(overridden)</span>
                          )}
                        </p>
                        {selectedLead.lead_email_cc && (
                          <p className="text-sm text-muted-foreground">
                            <strong>CC:</strong> {selectedLead.lead_email_cc}
                          </p>
                        )}
                        {selectedLead.phone && (
                          <p className="text-sm text-muted-foreground"><strong>Phone:</strong> {selectedLead.phone}</p>
                        )}
                        {getCountryFromTimezone(selectedLead.timezone) && (
                          <p className="text-sm text-muted-foreground">
                            🌍 {getCountryFromTimezone(selectedLead.timezone)}
                            <span className="text-xs text-muted-foreground ml-1">(from timezone)</span>
                          </p>
                        )}
                      </>
                    )}
                  </div>
                  <div>
                    <h4 className="font-medium text-sm text-muted-foreground mb-1">Recipient</h4>
                    {isEditingLead ? (
                      <div className="space-y-2">
                        <div>
                          <Label className="text-xs">Name</Label>
                          <Input
                            value={editedLead.recipient_name || ""}
                            onChange={(e) => setEditedLead({ ...editedLead, recipient_name: e.target.value })}
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Pronunciation Override</Label>
                          <Input
                            value={editedLead.recipient_name_pronunciation || ""}
                            onChange={(e) => setEditedLead({ ...editedLead, recipient_name_pronunciation: e.target.value })}
                            placeholder="e.g. koree, jhanay, ahleesa"
                          />
                          <p className="text-xs text-muted-foreground mt-1">
                            Spell the name how you want it sung. Avoid dashes or symbols.
                          </p>
                        </div>
                        <p className="text-sm text-muted-foreground">{selectedLead.recipient_type}</p>
                      </div>
                    ) : (
                      <>
                        <p>{selectedLead.recipient_name}</p>
                        {selectedLead.recipient_name_pronunciation && (
                          <p className="text-sm text-purple-600">
                            <span className="text-muted-foreground">Sung as:</span> {selectedLead.recipient_name_pronunciation}
                          </p>
                        )}
                        <p className="text-sm text-muted-foreground">{selectedLead.recipient_type}</p>
                      </>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-4">
                  <div>
                    <h4 className="font-medium text-sm text-muted-foreground mb-1">Occasion</h4>
                    {isEditingLead ? (
                      <Select
                        value={editedLead.occasion || selectedLead.occasion}
                        onValueChange={(val) => setEditedLead({ ...editedLead, occasion: val })}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {occasionOptions.map((opt) => (
                            <SelectItem key={opt.id} value={opt.id}>{opt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <p>{selectedLead.occasion}</p>
                    )}
                  </div>
                  <div>
                    <h4 className="font-medium text-sm text-muted-foreground mb-1">Genre</h4>
                    {isEditingLead ? (
                      <Select
                        value={editedLead.genre || selectedLead.genre}
                        onValueChange={(val) => setEditedLead({ ...editedLead, genre: val })}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {genreOptions.map((opt) => (
                            <SelectItem key={opt.id} value={opt.id}>{opt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <p>{selectedLead.genre}</p>
                    )}
                  </div>
                  <div>
                    <h4 className="font-medium text-sm text-muted-foreground mb-1">Singer</h4>
                    {isEditingLead ? (
                      <Select
                        value={editedLead.singer_preference || selectedLead.singer_preference}
                        onValueChange={(val) => setEditedLead({ ...editedLead, singer_preference: val })}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {singerOptions.map((opt) => (
                            <SelectItem key={opt.id} value={opt.id}>{opt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <p>{selectedLead.singer_preference}</p>
                    )}
                  </div>
                  <div>
                    <h4 className="font-medium text-sm text-muted-foreground mb-1">Language</h4>
                    {isEditingLead ? (
                      <Select
                        value={editedLead.lyrics_language_code || selectedLead.lyrics_language_code || "en"}
                        onValueChange={(val) => setEditedLead({ ...editedLead, lyrics_language_code: val })}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {languageOptions.map((opt) => (
                            <SelectItem key={opt.id} value={opt.id}>{opt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <p>{(selectedLead.lyrics_language_code || "en")} — {getLanguageLabel(selectedLead.lyrics_language_code || "en")}</p>
                    )}
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

                {/* Album Art Upload */}
                {selectedLead.status !== "converted" && adminPassword && (
                  <AlbumArtUpload
                    entityType="lead"
                    entityId={selectedLead.id}
                    currentUrl={selectedLead.cover_image_url || null}
                    adminPassword={adminPassword}
                    onUpdate={(newUrl) => {
                      setSelectedLead({ ...selectedLead, cover_image_url: newUrl });
                      onRefresh?.();
                    }}
                  />
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

                {/* Regenerate Song Buttons - for leads with existing song */}
                {selectedLead.preview_song_url && selectedLead.status !== "converted" && (
                  <div className="border-t pt-4">
                    <div className="bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-900 rounded-lg p-4">
                      <div className="flex items-start gap-3">
                        <Wand2 className="h-5 w-5 text-purple-600 mt-0.5" />
                        <div className="flex-1">
                          <h4 className="font-medium text-purple-800 dark:text-purple-200">Regenerate Song</h4>
                          <p className="text-sm text-purple-700 dark:text-purple-300 mt-1">
                            Generate a new version of this song. Choose whether to create entirely new lyrics or keep the current ones.
                          </p>
                          <div className="flex flex-wrap gap-2 mt-3">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button 
                                  variant="outline" 
                                  size="sm" 
                                  className="border-purple-300 text-purple-700 hover:bg-purple-100 dark:border-purple-700 dark:text-purple-300 dark:hover:bg-purple-900/50"
                                  onClick={() => { setRegenerateMode("new"); setShowRegenerateDialog(true); }}
                                >
                                  <Wand2 className="h-4 w-4 mr-2" />
                                  Regenerate New Song
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent side="bottom" className="max-w-xs text-center">
                                Generates brand new lyrics AND a new melody from scratch. The entire song will be replaced.
                              </TooltipContent>
                            </Tooltip>
                            
                            {selectedLead.automation_lyrics && selectedLead.automation_lyrics.trim().length > 0 && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button 
                                    variant="outline" 
                                    size="sm" 
                                    className="border-amber-300 text-amber-700 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-900/50"
                                    onClick={() => { setRegenerateMode("with_lyrics"); setShowRegenerateDialog(true); }}
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

                            {/* Restore Previous Version Button */}
                            {selectedLead.prev_song_url && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="border-teal-300 text-teal-700 hover:bg-teal-100 dark:border-teal-700 dark:text-teal-300 dark:hover:bg-teal-900/50"
                                    onClick={() => setShowRestoreConfirm(true)}
                                    disabled={restoringPreviousVersion}
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
                      </div>
                    </div>
                  </div>
                )}

                {/* Automation Status Section */}
                {selectedLead.automation_status && (
                  <div className="border-t pt-4 mt-4">
                    <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
                      <Bot className="h-4 w-4" />
                      Automation Status
                    </h4>
                    <div className="text-sm space-y-2">
                      <p><strong>Status:</strong> {selectedLead.automation_status}</p>
                      {selectedLead.automation_started_at && (
                        <p><strong>Started:</strong> {formatAdminDate(selectedLead.automation_started_at)}</p>
                      )}
                      {selectedLead.automation_last_error && (
                        <p className="text-red-600"><strong>Last Error:</strong> {selectedLead.automation_last_error}</p>
                      )}
                      
                      {/* Stuck explanation */}
                      {selectedLead.automation_status === "audio_generating" && 
                       selectedLead.automation_started_at &&
                       (Date.now() - new Date(selectedLead.automation_started_at).getTime()) > 5 * 60 * 1000 && (
                        <div className="bg-amber-50 border border-amber-200 rounded p-3 mt-2">
                          <p className="font-medium text-amber-800">Why is this stuck?</p>
                          <p className="text-xs text-amber-700 mt-1">
                            The audio provider (Kie.ai) hasn't sent the completion callback yet.
                            This can happen if their webhook delivery fails.
                          </p>
                          <p className="text-xs text-green-700 mt-2 font-medium">
                            What the system will do: Auto-retry every minute by polling the provider for status.
                          </p>
                        </div>
                      )}

                      {/* Stop Automation Button */}
                      {["queued", "pending", "lyrics_generating", "lyrics_ready", "audio_generating"].includes(selectedLead.automation_status || "") && !selectedLead.automation_manual_override_at && (
                        <Button
                          variant="destructive"
                          size="sm"
                          disabled={stoppingAutomation}
                          onClick={async () => {
                            if (!adminPassword) return;
                            setStoppingAutomation(true);
                            try {
                              const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-orders`, {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  action: "cancel_automation",
                                  leadId: selectedLead.id,
                                  adminPassword,
                                }),
                              });
                              if (!response.ok) {
                                const err = await response.json().catch(() => ({}));
                                throw new Error(err.error || "Failed to stop automation");
                              }
                              toast({ title: "Automation Stopped", description: "You can now safely upload a song manually." });
                              setSelectedLead({ ...selectedLead, automation_status: null, automation_manual_override_at: new Date().toISOString(), automation_last_error: "Cancelled by admin" });
                              onRefresh?.();
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
                    </div>
                  </div>
                )}

                {/* Editable Lyrics Section */}
                <div className="border-t pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-medium">{selectedLead.automation_lyrics ? "Generated Lyrics" : "Lyrics"}</h4>
                    <div className="flex items-center gap-1">
                      {selectedLead.automation_lyrics && !editingLeadLyrics && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs gap-1"
                          onClick={() => {
                            navigator.clipboard.writeText(selectedLead.automation_lyrics!);
                            toast({ title: "Lyrics copied to clipboard" });
                          }}
                        >
                          <Copy className="h-3 w-3" /> Copy
                        </Button>
                      )}
                      {!editingLeadLyrics && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs gap-1"
                          onClick={() => {
                            setEditingLeadLyrics(true);
                            setEditedLeadLyricsText(selectedLead.automation_lyrics || "");
                          }}
                        >
                          <Pencil className="h-3 w-3" /> Edit
                        </Button>
                      )}
                    </div>
                  </div>
                  {editingLeadLyrics ? (
                    <div className="space-y-2">
                      <Textarea
                        value={editedLeadLyricsText}
                        onChange={(e) => setEditedLeadLyricsText(e.target.value.slice(0, 5000))}
                        className="min-h-[200px] text-xs font-mono"
                        placeholder="Enter or paste lyrics here..."
                      />
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">{editedLeadLyricsText.length}/5000</span>
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditingLeadLyrics(false)}
                            disabled={savingLeadLyrics}
                          >
                            <X className="h-3 w-3 mr-1" /> Cancel
                          </Button>
                          <Button
                            size="sm"
                            disabled={savingLeadLyrics}
                            onClick={async () => {
                              setSavingLeadLyrics(true);
                              try {
                                const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-orders`, {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({
                                    action: "update_lead_fields",
                                    leadId: selectedLead.id,
                                    updates: { automation_lyrics: editedLeadLyricsText },
                                    adminPassword,
                                  }),
                                });
                                if (!response.ok) throw new Error("Failed to save");
                                toast({ title: "Lyrics saved" });
                                setSelectedLead({ ...selectedLead, automation_lyrics: editedLeadLyricsText });
                                setEditingLeadLyrics(false);
                                onRefresh?.();
                              } catch {
                                toast({ title: "Failed to save lyrics", variant: "destructive" });
                              } finally {
                                setSavingLeadLyrics(false);
                              }
                            }}
                          >
                            <Save className="h-3 w-3 mr-1" /> Save
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : selectedLead.automation_lyrics ? (
                    <pre className="text-sm bg-muted/40 border border-border rounded-lg p-4 whitespace-pre-wrap break-words max-h-64 overflow-y-auto font-sans">
                      {selectedLead.automation_lyrics}
                    </pre>
                  ) : (
                    <p className="text-xs text-muted-foreground italic">No lyrics yet. Click Edit to add.</p>
                  )}
                </div>

                {/* Song Info - show when song is uploaded */}
                {selectedLead.full_song_url && (
                  <div className="border-t pt-4">
                    <h4 className="font-medium mb-3">Song Details</h4>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <strong className="text-sm">Title:</strong>
                        {!editingLeadTitle && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs gap-1"
                            onClick={() => {
                              setEditingLeadTitle(true);
                              setEditedLeadTitle(selectedLead.song_title || "");
                            }}
                          >
                            <Pencil className="h-3 w-3" /> Edit
                          </Button>
                        )}
                      </div>
                      {editingLeadTitle ? (
                        <div className="space-y-2">
                          <Input
                            value={editedLeadTitle}
                            onChange={(e) => setEditedLeadTitle(e.target.value)}
                            placeholder="Enter song title..."
                            className="text-sm"
                            maxLength={200}
                          />
                          <div className="flex gap-2 justify-end">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setEditingLeadTitle(false)}
                              disabled={savingLeadTitle}
                            >
                              <X className="h-3 w-3 mr-1" /> Cancel
                            </Button>
                            <Button
                              size="sm"
                              disabled={savingLeadTitle}
                              onClick={async () => {
                                setSavingLeadTitle(true);
                                try {
                                  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-orders`, {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({
                                      action: "update_lead_fields",
                                      leadId: selectedLead.id,
                                      updates: { song_title: editedLeadTitle },
                                      adminPassword,
                                    }),
                                  });
                                  if (!response.ok) throw new Error("Failed to save");
                                  toast({ title: "Song title saved" });
                                  setSelectedLead({ ...selectedLead, song_title: editedLeadTitle });
                                  setEditingLeadTitle(false);
                                  onRefresh?.();
                                } catch {
                                  toast({ title: "Failed to save title", variant: "destructive" });
                                } finally {
                                  setSavingLeadTitle(false);
                                }
                              }}
                            >
                              <Save className="h-3 w-3 mr-1" /> Save
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm">{selectedLead.song_title || <span className="italic text-muted-foreground">No title set</span>}</p>
                      )}
                      {selectedLead.preview_token && (
                        <p className="text-sm">
                          <strong>Preview URL:</strong>{" "}
                          <a 
                            href={`/preview/${selectedLead.preview_token}`}
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
                <RadioGroupItem value="49" id="price-standard" />
                <Label htmlFor="price-standard" className="cursor-pointer">$49 (Standard)</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="79" id="price-priority" />
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
              onClick={handleRestoreLeadPreviousVersion}
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
                ? "This will keep the current lyrics but generate a completely new melody, tempo, and vocals. The song will sound entirely different."
                : "This will generate brand new lyrics AND a new melody from scratch. The existing song will be replaced."}
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
                    name="leadSendOption"
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
                    name="leadSendOption"
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
                    name="leadSendOption"
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
                <LeadPreviewTimingPicker
                  mode={previewTimingMode}
                  scheduledAt={regenerateScheduledAt}
                  onModeChange={(mode) => {
                    setPreviewTimingMode(mode);
                    if (mode === "auto_24h") {
                      setRegenerateScheduledAt(new Date(Date.now() + 24 * 60 * 60 * 1000));
                    }
                  }}
                  onScheduledAtChange={setRegenerateScheduledAt}
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRegenerateDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleRegenerateLeadSong} 
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

