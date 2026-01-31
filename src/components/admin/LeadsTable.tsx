import { useState, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Download, Eye, Users, Upload, FileAudio, Play, Pause, Send, Clock, Gift, Star, AlertTriangle, Check, X, Timer } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

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
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [sendingPreview, setSendingPreview] = useState(false);
  const [sendingFollowup, setSendingFollowup] = useState(false);
  const [cancellingAutoSend, setCancellingAutoSend] = useState(false);
  const [playingAudio, setPlayingAudio] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  // Filter by status and quality
  const filteredLeads = leads
    .filter((lead) => statusFilter === "all" || lead.status === statusFilter)
    .filter((lead) => {
      if (qualityFilter === "all") return true;
      const score = lead.quality_score ?? 0;
      if (qualityFilter === "high") return score >= 70;
      if (qualityFilter === "medium") return score >= 40 && score < 70;
      if (qualityFilter === "low") return score < 40;
      return true;
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
    setUploadProgress(10);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("leadId", selectedLead.id);
      formData.append("type", "lead");
      formData.append("adminPassword", adminPassword);

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

  const handleSendPreview = async (lead: Lead) => {
    if (!adminPassword) return;

    setSendingPreview(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-lead-preview`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            leadId: lead.id,
            adminPassword,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to send preview");
      }

      toast({
        title: "Preview Sent!",
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
    }
  };

  const handleSendFollowup = async (lead: Lead) => {
    if (!adminPassword) return;

    setSendingFollowup(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-lead-followup`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            leadId: lead.id,
            adminPassword,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to send follow-up");
      }

      toast({
        title: "Follow-up Sent!",
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
    }
  };

  const handleCancelAutoSend = async (lead: Lead) => {
    if (!adminPassword) return;

    setCancellingAutoSend(true);
    try {
      // Update lead to clear the scheduled send time
      const { error } = await supabase
        .from("leads")
        .update({ preview_scheduled_at: null })
        .eq("id", lead.id);

      if (error) throw error;

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
            <Card key={lead.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-3 flex-wrap">
                      <h3 className="font-semibold text-lg">{lead.customer_name}</h3>
                      <Badge className={statusColors[lead.status] || "bg-gray-100 text-gray-800"}>
                        {statusLabels[lead.status] || lead.status}
                      </Badge>
                      {lead.preview_opened_at && !lead.converted_at && (
                        <Badge variant="outline" className="border-purple-500 text-purple-600">
                          <Eye className="h-3 w-3 mr-1" />
                          Viewed
                        </Badge>
                      )}
                      {isEligibleForFollowup(lead) && (
                        <Badge variant="outline" className="border-orange-500 text-orange-600">
                          <Gift className="h-3 w-3 mr-1" />
                          Follow-up Ready
                        </Badge>
                      )}
                      {/* Quality Score Badge */}
                      {(() => {
                        const quality = getQualityBadge(lead.quality_score);
                        const IconComponent = quality.icon;
                        return (
                          <Badge className={quality.className}>
                            {IconComponent && <IconComponent className="h-3 w-3 mr-1" />}
                            Q: {quality.label}
                          </Badge>
                        );
                      })()}
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
                      <strong>Captured:</strong> {new Date(lead.captured_at).toLocaleString("en-US", { timeZone: "America/Los_Angeles" })} PST
                    </p>
                    {lead.preview_sent_at && (
                      <p className="text-sm text-purple-600">
                        <strong>Preview sent:</strong> {new Date(lead.preview_sent_at).toLocaleString("en-US", { timeZone: "America/Los_Angeles" })} PST
                      </p>
                    )}
                    {hasScheduledAutoSend(lead) && (
                      <p className="text-sm text-blue-600">
                        <Timer className="h-3 w-3 inline mr-1" />
                        <strong>Auto-send in:</strong> {getAutoSendTimeRemaining(lead)}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2 flex-wrap">
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
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedLead(lead)}
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
      )}

      <Dialog open={!!selectedLead} onOpenChange={() => setSelectedLead(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {selectedLead && (
            <>
              <DialogHeader>
                <DialogTitle>Lead Details</DialogTitle>
                <DialogDescription>
                  Lead ID: {selectedLead.id.slice(0, 8).toUpperCase()}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-6 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-medium text-sm text-muted-foreground mb-1">Lead Name</h4>
                    <p>{selectedLead.customer_name}</p>
                    <p className="text-sm text-muted-foreground"><strong>Email:</strong> {selectedLead.email}</p>
                    {selectedLead.phone && (
                      <p className="text-sm text-muted-foreground"><strong>Phone:</strong> {selectedLead.phone}</p>
                    )}
                  </div>
                  <div>
                    <h4 className="font-medium text-sm text-muted-foreground mb-1">Recipient</h4>
                    <p>{selectedLead.recipient_name}</p>
                    <p className="text-sm text-muted-foreground">{selectedLead.recipient_type}</p>
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
                  <p className="text-sm">{selectedLead.special_qualities}</p>
                </div>

                <div>
                  <h4 className="font-medium text-sm text-muted-foreground mb-1">Favorite Memory</h4>
                  <p className="text-sm">{selectedLead.favorite_memory}</p>
                </div>

                {selectedLead.special_message && (
                  <div>
                    <h4 className="font-medium text-sm text-muted-foreground mb-1">Special Message</h4>
                    <p className="text-sm">{selectedLead.special_message}</p>
                  </div>
                )}

                {/* Upload Song Section - only show if song not uploaded yet */}
                {selectedLead.status === "lead" && !selectedLead.full_song_url && (
                  <div className="border-t pt-4">
                    <h4 className="font-medium mb-3">Upload Song for Lead Recovery</h4>
                    
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
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mt-3">
                          <div className="flex items-center gap-2 text-blue-700">
                            <Timer className="h-4 w-4" />
                            <span className="font-medium">Auto-send scheduled</span>
                          </div>
                          <p className="text-sm text-blue-600 mt-1">
                            Preview email will be sent automatically in {getAutoSendTimeRemaining(selectedLead)}
                            {selectedLead.preview_scheduled_at && (
                              <span className="block text-xs mt-1">
                                ({new Date(selectedLead.preview_scheduled_at).toLocaleString("en-US", { timeZone: "America/Los_Angeles" })} PST)
                              </span>
                            )}
                          </p>
                        </div>
                      )}

                      {/* Already sent indicator */}
                      {selectedLead.preview_sent_at && (
                        <div className="bg-green-50 border border-green-200 rounded-lg p-3 mt-3">
                          <div className="flex items-center gap-2 text-green-700">
                            <Check className="h-4 w-4" />
                            <span className="font-medium">Preview email sent</span>
                          </div>
                          <p className="text-sm text-green-600 mt-1">
                            Sent on {new Date(selectedLead.preview_sent_at).toLocaleString("en-US", { timeZone: "America/Los_Angeles" })} PST
                          </p>
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
                      {new Date(selectedLead.captured_at).toLocaleString()}
                    </div>
                    {selectedLead.preview_sent_at && (
                      <div>
                        <span className="text-muted-foreground">Preview Sent:</span>{" "}
                        {new Date(selectedLead.preview_sent_at).toLocaleString()}
                      </div>
                    )}
                    {selectedLead.preview_opened_at && (
                      <div>
                        <span className="text-muted-foreground">Preview Opened:</span>{" "}
                        {new Date(selectedLead.preview_opened_at).toLocaleString()}
                      </div>
                    )}
                    {selectedLead.follow_up_sent_at && (
                      <div>
                        <span className="text-muted-foreground">Follow-up Sent:</span>{" "}
                        {new Date(selectedLead.follow_up_sent_at).toLocaleString()}
                      </div>
                    )}
                    {selectedLead.converted_at && (
                      <div>
                        <span className="text-muted-foreground">Converted:</span>{" "}
                        {new Date(selectedLead.converted_at).toLocaleString()}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <DialogFooter className="flex-col sm:flex-row gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setSelectedLead(null);
                    setSelectedFile(null);
                    if (fileInputRef.current) {
                      fileInputRef.current.value = "";
                    }
                  }}
                >
                  Close
                </Button>
                {/* Send Preview button in dialog */}
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
                {/* Send Follow-up button in dialog */}
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
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
