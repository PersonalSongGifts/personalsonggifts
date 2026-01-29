import { Card, CardContent } from "@/components/ui/card";
import { DollarSign, ShoppingCart, TrendingUp, Clock, Users } from "lucide-react";

interface Order {
  id: string;
  price: number;
  status: string;
  pricing_tier: string;
  created_at: string;
}

interface Lead {
  id: string;
  status: string;
  captured_at: string;
}

interface StatsCardsProps {
  orders: Order[];
  leads?: Lead[];
}

export function StatsCards({ orders, leads = [] }: StatsCardsProps) {
  const totalRevenue = orders.reduce((sum, order) => {
    if (order.status !== "cancelled") {
      return sum + order.price;
    }
    return sum;
  }, 0);

  const totalOrders = orders.length;
  
  // Orders today
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const ordersToday = orders.filter((o) => {
    const orderDate = new Date(o.created_at);
    return orderDate >= today;
  }).length;

  const priorityOrders = orders.filter((o) => o.pricing_tier === "priority").length;
  const pendingOrders = orders.filter((o) => 
    ["paid", "in_progress"].includes(o.status)
  ).length;

  const totalLeads = leads.length;
  const unconvertedLeads = leads.filter((l) => l.status === "lead").length;

  const priorityRate = totalOrders > 0 
    ? Math.round((priorityOrders / totalOrders) * 100) 
    : 0;

  const stats = [
    {
      title: "Total Revenue",
      value: `$${totalRevenue.toLocaleString()}`,
      description: "All time earnings",
      icon: DollarSign,
      color: "text-green-600",
      bgColor: "bg-green-100",
    },
    {
      title: "Orders Today",
      value: ordersToday.toString(),
      description: "New orders today",
      icon: ShoppingCart,
      color: "text-blue-600",
      bgColor: "bg-blue-100",
    },
    {
      title: "Total Orders",
      value: totalOrders.toString(),
      description: "All time",
      icon: ShoppingCart,
      color: "text-slate-600",
      bgColor: "bg-slate-100",
    },
    {
      title: "Leads",
      value: totalLeads.toString(),
      description: `${unconvertedLeads} unconverted`,
      icon: Users,
      color: "text-indigo-600",
      bgColor: "bg-indigo-100",
    },
    {
      title: "Pending",
      value: pendingOrders.toString(),
      description: "Awaiting completion",
      icon: Clock,
      color: "text-amber-600",
      bgColor: "bg-amber-100",
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
      {stats.map((stat) => (
        <Card key={stat.title}>
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  {stat.title}
                </p>
                <p className="text-2xl font-bold mt-1">{stat.value}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {stat.description}
                </p>
              </div>
              <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                <stat.icon className={`h-5 w-5 ${stat.color}`} />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
