import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { ImagePlus, X, Loader2 } from "lucide-react";

interface AlbumArtUploadProps {
  entityType: "order" | "lead";
  entityId: string;
  currentUrl: string | null;
  occasion?: string;
  adminPassword: string;
  onUpdate: (newUrl: string | null) => void;
}

export function AlbumArtUpload({ entityType, entityId, currentUrl, adminPassword, onUpdate }: AlbumArtUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate type
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      toast({ title: "Invalid File", description: "Please select a JPEG, PNG, or WebP image.", variant: "destructive" });
      return;
    }

    // Validate size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "File Too Large", description: "Maximum file size is 5MB.", variant: "destructive" });
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("adminPassword", adminPassword);
      formData.append(entityType === "order" ? "orderId" : "leadId", entityId);

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/upload-cover-art`,
        { method: "POST", body: formData }
      );

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || "Upload failed");
      }

      const data = await response.json();
      onUpdate(data.cover_image_url);
      toast({ title: "Album Art Updated", description: "Cover image has been updated." });
    } catch (error) {
      console.error("Cover art upload error:", error);
      toast({ title: "Upload Failed", description: error instanceof Error ? error.message : "Failed to upload", variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleRemove = async () => {
    setRemoving(true);
    try {
      const formData = new FormData();
      formData.append("adminPassword", adminPassword);
      formData.append(entityType === "order" ? "orderId" : "leadId", entityId);
      formData.append("action", "remove");

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/upload-cover-art`,
        { method: "POST", body: formData }
      );

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || "Remove failed");
      }

      onUpdate(null);
      toast({ title: "Album Art Removed", description: "Cover image has been removed." });
    } catch (error) {
      console.error("Cover art remove error:", error);
      toast({ title: "Remove Failed", description: error instanceof Error ? error.message : "Failed to remove", variant: "destructive" });
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div className="border-t pt-4">
      <h4 className="font-medium text-sm text-muted-foreground mb-2">Album Art</h4>
      <div className="flex items-start gap-4">
        {/* Thumbnail */}
        <div className="w-20 h-20 rounded-lg border overflow-hidden bg-muted flex items-center justify-center flex-shrink-0">
          {currentUrl ? (
            <img src={currentUrl} alt="Cover art" className="w-full h-full object-cover" />
          ) : (
            <ImagePlus className="h-6 w-6 text-muted-foreground" />
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleFileSelect}
            className="hidden"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || removing}
          >
            {uploading ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Uploading...</>
            ) : (
              <><ImagePlus className="h-4 w-4 mr-2" />{currentUrl ? "Change" : "Upload"}</>
            )}
          </Button>
          {currentUrl && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRemove}
              disabled={uploading || removing}
              className="text-red-600 hover:text-red-700 hover:bg-red-50"
            >
              {removing ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Removing...</>
              ) : (
                <><X className="h-4 w-4 mr-2" />Remove</>
              )}
            </Button>
          )}
          <p className="text-xs text-muted-foreground">JPEG, PNG, or WebP · Max 5MB</p>
        </div>
      </div>
    </div>
  );
}
