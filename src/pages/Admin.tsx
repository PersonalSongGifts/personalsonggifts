import { useState, useEffect } from "react";
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
import { useToast } from "@/hooks/use-toast";
import { Lock, Music, Send, RefreshCw, Eye, Package, Clock, CheckCircle, AlertCircle, BarChart3, List } from "lucide-react";
import { StatsCards } from "@/components/admin/StatsCards";
import { RevenueChart } from "@/components/admin/RevenueChart";
import { OrdersChart } from "@/components/admin/OrdersChart";
import { StatusChart } from "@/components/admin/StatusChart";

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
  expected_delivery: string | null;
  delivered_at: string | null;
  created_at: string;
  notes: string | null;
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

export default function Admin() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [orders, setOrders] = useState<Order[]>([]);
  const [allOrders, setAllOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [songUrl, setSongUrl] = useState("");
  const [updating, setUpdating] = useState(false);
  const [activeTab, setActiveTab] = useState("analytics");
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("admin-orders", {
        headers: { "x-admin-password": password },
      });

      if (error) throw error;
      
      setIsAuthenticated(true);
      setOrders(data.orders || []);
      setAllOrders(data.orders || []);
      sessionStorage.setItem("adminPassword", password);
    } catch {
      toast({
        title: "Authentication Failed",
        description: "Invalid password. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchOrders = async () => {
    const storedPassword = sessionStorage.getItem("adminPassword");
    if (!storedPassword) return;

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        `admin-orders?status=${statusFilter}`,
        {
          headers: { "x-admin-password": storedPassword },
        }
      );

      if (error) throw error;
      setOrders(data.orders || []);
      if (statusFilter === "all") {
        setAllOrders(data.orders || []);
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
    const storedPassword = sessionStorage.getItem("adminPassword");
    if (!storedPassword) return;

    setUpdating(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-orders", {
        method: "POST",
        headers: { "x-admin-password": storedPassword },
        body: { orderId, ...updates },
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
    const storedPassword = sessionStorage.getItem("adminPassword");
    if (storedPassword) {
      setPassword(storedPassword);
      setIsAuthenticated(true);
    }
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
                sessionStorage.removeItem("adminPassword");
                setIsAuthenticated(false);
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
          <TabsList>
            <TabsTrigger value="analytics" className="gap-2">
              <BarChart3 className="h-4 w-4" />
              Analytics
            </TabsTrigger>
            <TabsTrigger value="orders" className="gap-2">
              <List className="h-4 w-4" />
              Orders
            </TabsTrigger>
          </TabsList>

          <TabsContent value="analytics" className="space-y-6">
            <StatsCards orders={allOrders} />
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <RevenueChart orders={allOrders} />
              <OrdersChart orders={allOrders} />
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <StatusChart orders={allOrders} />
            </div>
          </TabsContent>

          <TabsContent value="orders" className="space-y-6">
            <div className="flex items-center gap-4">
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
                {orders.map((order) => (
                  <Card key={order.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-6">
                      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                        <div className="space-y-2 flex-1">
                          <div className="flex items-center gap-3 flex-wrap">
                            <h3 className="font-semibold text-lg">
                              Song for {order.recipient_name}
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
                            <strong>From:</strong> {order.customer_name} ({order.customer_email})
                          </p>
                          <p className="text-sm text-muted-foreground">
                            <strong>Occasion:</strong> {order.occasion} • <strong>Genre:</strong> {order.genre}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            <strong>Created:</strong>{" "}
                            {new Date(order.created_at).toLocaleString()}
                          </p>
                          {order.expected_delivery && (
                            <p className="text-sm text-muted-foreground">
                              <strong>Expected:</strong>{" "}
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
                  <h4 className="font-medium mb-3">Update Order</h4>
                  
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

                    <div>
                      <label className="text-sm font-medium">Song URL</label>
                      <div className="flex gap-2 mt-1">
                        <Textarea
                          value={songUrl}
                          onChange={(e) => setSongUrl(e.target.value)}
                          placeholder="https://..."
                          className="flex-1"
                        />
                        <Button
                          variant="outline"
                          onClick={() => updateOrder(selectedOrder.id, { songUrl })}
                          disabled={updating || !songUrl}
                        >
                          Save
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setSelectedOrder(null)}
                >
                  Close
                </Button>
                {selectedOrder.song_url && selectedOrder.status !== "delivered" && (
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
