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
import { Lock, Music, Send, RefreshCw, Eye, Package, Clock, CheckCircle, AlertCircle, BarChart3, List, Users, Mail, Upload, FileAudio, Video } from "lucide-react";
import { Label } from "@/components/ui/label";
import { StatsCards } from "@/components/admin/StatsCards";
import { RevenueChart } from "@/components/admin/RevenueChart";
import { OrdersChart } from "@/components/admin/OrdersChart";
import { StatusChart } from "@/components/admin/StatusChart";
import { GenreChart } from "@/components/admin/GenreChart";
import { LeadsTable, Lead } from "@/components/admin/LeadsTable";
import { EmailTemplates } from "@/components/admin/EmailTemplates";
import { ReactionsTable } from "@/components/admin/ReactionsTable";

interface Order {
  id: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  recipient_name: string;
  recipient_type: string;
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
  reaction_video_url: string | null;
  reaction_submitted_at: string | null;
}

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  paid: "bg-blue-100 text-blue-800",
  in_progress: "bg-purple-100 text-purple-800",
  completed: "bg-green-100 text-green-800",
  delivered: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-red-100 text-red-800",
};

const statusIcons: Record<string, React.ReactNode> = {
  pending: <Clock className="h-3 w-3" />,
  paid: <Package className="h-3 w-3" />,
  in_progress: <RefreshCw className="h-3 w-3" />,
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
  const [activeTab, setActiveTab] = useState("analytics");
  const [orderSort, setOrderSort] = useState<"latest" | "oldest">("latest");
  const [leadSort, setLeadSort] = useState<"latest" | "oldest">("latest");
  const [reactionSort, setReactionSort] = useState<"latest" | "oldest">("latest");
  const [uploadingFile, setUploadingFile] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
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

  const listOrders = async (status: string) => {
    return supabase.functions.invoke("admin-orders", {
      method: "POST",
      body: {
        action: "list",
        adminPassword: password,
        status,
      },
    });
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data, error } = await listOrders("all");

      if (error) throw error;
      
      setIsAuthenticated(true);
      setOrders(data.orders || []);
      setAllOrders(data.orders || []);
      setLeads(data.leads || []);
    } catch (err: unknown) {
      // Surface actual error type to help debugging (no secrets included)
      // eslint-disable-next-line no-console
      console.error("Admin login error:", err);

      const message =
        err instanceof Error
          ? err.message
          : typeof err === "string"
            ? err
            : "Request failed";

      toast({
        title: "Authentication Failed",
        description: `${message} (check password + try hard refresh)`,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchOrders = async () => {
    if (!password) {
      setIsAuthenticated(false);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await listOrders(statusFilter);

      if (error) throw error;
      setOrders(data.orders || []);
      if (statusFilter === "all") {
        setAllOrders(data.orders || []);
        setLeads(data.leads || []);
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

      toast({
        title: "Success",
        description: updates.deliver 
          ? "Song delivered and email sent!" 
          : "Order updated successfully.",
      });

      setSelectedOrder(null);
      setSongUrl("");
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

  useEffect(() => {
    // Intentionally do not auto-authenticate via browser storage.
    // Admin access must always be validated server-side.
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      fetchOrders();
    }
  }, [isAuthenticated, statusFilter]);

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
          <TabsList className="grid w-full max-w-2xl grid-cols-5">
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
            <TabsTrigger value="emails" className="gap-2">
              <Mail className="h-4 w-4" />
              Emails
            </TabsTrigger>
          </TabsList>

          <TabsContent value="analytics" className="space-y-6">
            <StatsCards orders={allOrders} leads={leads} />
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <RevenueChart orders={allOrders} />
              <OrdersChart orders={allOrders} />
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <StatusChart orders={allOrders} />
              <GenreChart orders={allOrders} />
            </div>
          </TabsContent>

          <TabsContent value="orders" className="space-y-6">
            <div className="flex items-center gap-4 flex-wrap">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Orders</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="delivered">Delivered</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
              <Select value={orderSort} onValueChange={(v) => setOrderSort(v as "latest" | "oldest")}>
                <SelectTrigger className="w-36">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="latest">Latest First</SelectItem>
                  <SelectItem value="oldest">Oldest First</SelectItem>
                </SelectContent>
              </Select>
              <span className="text-sm text-muted-foreground">
                {orders.length} order{orders.length !== 1 ? "s" : ""}
              </span>
            </div>

            {orders.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No orders found</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {[...orders].sort((a, b) => {
                  const dateA = new Date(a.created_at).getTime();
                  const dateB = new Date(b.created_at).getTime();
                  return orderSort === "latest" ? dateB - dateA : dateA - dateB;
                }).map((order) => (
                  <Card key={order.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-6">
                      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                        <div className="space-y-2 flex-1">
                          <div className="flex items-center gap-3 flex-wrap">
                            <h3 className="font-semibold text-lg">
                              {order.customer_name}
                            </h3>
                            <Badge className={statusColors[order.status] || "bg-gray-100 text-gray-800"}>
                              <span className="mr-1">{statusIcons[order.status]}</span>
                              {order.status}
                            </Badge>
                            <Badge variant="outline">
                              {order.pricing_tier === "priority" ? "Priority" : "Standard"}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            <strong>Song for:</strong> {order.recipient_name} ({order.recipient_type})
                          </p>
                          <p className="text-sm text-muted-foreground">
                            <strong>Order ID:</strong> {order.id.slice(0, 8).toUpperCase()}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            <strong>Order Date/Time:</strong>{" "}
                            {new Date(order.created_at).toLocaleString()}
                          </p>
                          {order.expected_delivery && (
                            <p className="text-sm text-muted-foreground">
                              <strong>Expected Delivery:</strong>{" "}
                              {new Date(order.expected_delivery).toLocaleString()}
                            </p>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                          onClick={() => {
                              setSelectedOrder(order);
                              setSongUrl(order.song_url || "");
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
            )}
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
            <LeadsTable leads={leads} loading={loading} sort={leadSort} onSortChange={setLeadSort} />
          </TabsContent>

          <TabsContent value="emails" className="space-y-6">
            <EmailTemplates />
          </TabsContent>
        </Tabs>
      </main>

      <Dialog open={!!selectedOrder} onOpenChange={() => setSelectedOrder(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {selectedOrder && (
            <>
              <DialogHeader>
                <DialogTitle>Order Details</DialogTitle>
                <DialogDescription>
                  Order ID: {selectedOrder.id.slice(0, 8).toUpperCase()}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-6 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-medium text-sm text-muted-foreground mb-1">Customer</h4>
                    <p>{selectedOrder.customer_name}</p>
                    <p className="text-sm text-muted-foreground">{selectedOrder.customer_email}</p>
                    {selectedOrder.customer_phone && (
                      <p className="text-sm text-muted-foreground">{selectedOrder.customer_phone}</p>
                    )}
                  </div>
                  <div>
                    <h4 className="font-medium text-sm text-muted-foreground mb-1">Recipient</h4>
                    <p>{selectedOrder.recipient_name}</p>
                    <p className="text-sm text-muted-foreground">
                      {selectedOrder.recipient_type} • {selectedOrder.relationship}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-medium text-sm text-muted-foreground mb-1">Occasion</h4>
                    <p>{selectedOrder.occasion}</p>
                  </div>
                  <div>
                    <h4 className="font-medium text-sm text-muted-foreground mb-1">Music</h4>
                    <p>{selectedOrder.genre} • {selectedOrder.singer_preference}</p>
                  </div>
                </div>

                <div>
                  <h4 className="font-medium text-sm text-muted-foreground mb-1">Special Qualities</h4>
                  <p className="text-sm">{selectedOrder.special_qualities}</p>
                </div>

                <div>
                  <h4 className="font-medium text-sm text-muted-foreground mb-1">Favorite Memory</h4>
                  <p className="text-sm">{selectedOrder.favorite_memory}</p>
                </div>

                {selectedOrder.special_message && (
                  <div>
                    <h4 className="font-medium text-sm text-muted-foreground mb-1">Special Message</h4>
                    <p className="text-sm">{selectedOrder.special_message}</p>
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

                {selectedOrder.song_title && (
                  <div className="border-t pt-4">
                    <h4 className="font-medium mb-2">Song Title</h4>
                    <p className="text-sm text-muted-foreground">{selectedOrder.song_title}</p>
                  </div>
                )}

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
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                onClick={() => {
                    setSelectedOrder(null);
                    setSelectedFile(null);
                    if (fileInputRef.current) {
                      fileInputRef.current.value = "";
                    }
                  }}
                >
                  Close
                </Button>
                {(songUrl || selectedOrder.song_url) && selectedOrder.status !== "delivered" && (
                  <Button
                    onClick={() => updateOrder(selectedOrder.id, { deliver: true })}
                    disabled={updating}
                  >
                    <Send className="h-4 w-4 mr-2" />
                    {updating ? "Delivering..." : "Deliver & Send Email"}
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
