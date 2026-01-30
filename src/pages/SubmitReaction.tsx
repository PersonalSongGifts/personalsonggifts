import { useState } from "react";
import { Link } from "react-router-dom";
import { Upload, CheckCircle, Video, Lightbulb, Mail, ArrowRight, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";

type Step = "lookup" | "upload" | "success";

interface OrderInfo {
  orderId: string;
  recipientName: string;
  occasion: string;
}

const SubmitReaction = () => {
  const [step, setStep] = useState<Step>("lookup");
  const [email, setEmail] = useState("");
  const [orderInfo, setOrderInfo] = useState<OrderInfo | null>(null);
  const [isLooking, setIsLooking] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      toast.error("Please enter your email address");
      return;
    }

    setIsLooking(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/upload-reaction`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "lookup", email: email.trim() }),
        }
      );

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || "Order not found");
      }

      setOrderInfo({
        orderId: data.orderId,
        recipientName: data.recipientName,
        occasion: data.occasion,
      });
      setStep("upload");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to find order");
    } finally {
      setIsLooking(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("video/")) {
      toast.error("Please select a video file");
      return;
    }

    // Validate file size (max 500MB)
    if (file.size > 500 * 1024 * 1024) {
      toast.error("Video must be under 500MB");
      return;
    }

    setSelectedFile(file);
  };

  const handleUpload = async () => {
    if (!selectedFile || !orderInfo) return;

    setIsUploading(true);
    setUploadProgress(0);

    try {
      // Create form data
      const formData = new FormData();
      formData.append("action", "upload");
      formData.append("email", email);
      formData.append("orderId", orderInfo.orderId);
      formData.append("video", selectedFile);

      // Simulate progress updates
      const progressInterval = setInterval(() => {
        setUploadProgress((prev) => Math.min(prev + 10, 90));
      }, 500);

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/upload-reaction`,
        {
          method: "POST",
          body: formData,
        }
      );

      clearInterval(progressInterval);

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Upload failed");
      }

      setUploadProgress(100);
      setStep("success");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
      setUploadProgress(0);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
      <div className="container max-w-xl mx-auto px-4 py-8 md:py-16">
        {/* Header */}
        <div className="text-center mb-8">
          <Video className="w-16 h-16 text-primary mx-auto mb-4" />
          <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-2">
            Submit Your Reaction
          </h1>
          <p className="text-muted-foreground">
            Share your reaction video and receive a $50 gift card!
          </p>
        </div>

        {/* Step: Email Lookup */}
        {step === "lookup" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5" />
                Find Your Order
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleLookup} className="space-y-4">
                <div>
                  <Label htmlFor="email">Email Address</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="Enter the email you used to order"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={isLooking}
                  />
                  <p className="text-sm text-muted-foreground mt-1">
                    Use the same email address from your song order
                  </p>
                </div>
                <Button type="submit" className="w-full gap-2" disabled={isLooking}>
                  {isLooking ? "Looking up..." : "Find My Order"}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Step: Upload */}
        {step === "upload" && orderInfo && (
          <div className="space-y-6">
            {/* Order confirmation */}
            <Card className="bg-primary/5 border-primary/20">
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground mb-1">Order found!</p>
                <p className="font-semibold">
                  {orderInfo.occasion} song for {orderInfo.recipientName}
                </p>
              </CardContent>
            </Card>

            {/* Tips */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Lightbulb className="h-5 w-5 text-yellow-500" />
                  Tips for a Great Reaction Video
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>• Record in a quiet, well-lit space</li>
                  <li>• Capture your genuine first-time reaction</li>
                  <li>• Hold your phone horizontally for best quality</li>
                  <li>• Make sure audio is clear and audible</li>
                  <li>• 30 seconds to 2 minutes is ideal length</li>
                </ul>
              </CardContent>
            </Card>

            {/* Upload area */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Upload className="h-5 w-5" />
                  Upload Your Video
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="border-2 border-dashed rounded-lg p-8 text-center hover:border-primary/50 transition-colors">
                  <input
                    type="file"
                    accept="video/*"
                    onChange={handleFileChange}
                    className="hidden"
                    id="video-upload"
                    disabled={isUploading}
                  />
                  <label
                    htmlFor="video-upload"
                    className="cursor-pointer flex flex-col items-center"
                  >
                    <Video className="h-12 w-12 text-muted-foreground mb-4" />
                    {selectedFile ? (
                      <p className="font-medium text-foreground">{selectedFile.name}</p>
                    ) : (
                      <>
                        <p className="font-medium text-foreground">
                          Click to select your video
                        </p>
                        <p className="text-sm text-muted-foreground">
                          MP4, MOV, or other video formats (max 500MB)
                        </p>
                      </>
                    )}
                  </label>
                </div>

                {isUploading && (
                  <div className="space-y-2">
                    <Progress value={uploadProgress} />
                    <p className="text-sm text-center text-muted-foreground">
                      Uploading... {uploadProgress}%
                    </p>
                  </div>
                )}

                <Button
                  onClick={handleUpload}
                  disabled={!selectedFile || isUploading}
                  className="w-full gap-2"
                >
                  {isUploading ? "Uploading..." : "Submit Reaction"}
                  <Upload className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Step: Success */}
        {step === "success" && (
          <Card className="text-center">
            <CardContent className="pt-8 pb-8">
              <CheckCircle className="h-20 w-20 text-green-500 mx-auto mb-6" />
              <h2 className="text-2xl font-bold mb-2">Thank You!</h2>
              <p className="text-muted-foreground mb-6">
                Your reaction video has been submitted successfully. We'll review it and
                send your $50 gift card within 48 hours!
              </p>
              <Link to="/">
                <Button variant="outline" className="gap-2">
                  <Home className="h-4 w-4" />
                  Return Home
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}

        {/* Footer */}
        <div className="text-center mt-12 pt-8 border-t">
          <p className="text-sm text-muted-foreground mb-2">
            Made with ❤️ by Personal Song Gifts
          </p>
          <Link to="/" className="text-sm text-primary hover:underline">
            Create your own personalized song
          </Link>
        </div>
      </div>
    </div>
  );
};

export default SubmitReaction;
