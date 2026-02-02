import { Card, CardContent } from "@/components/ui/card";
import { DollarSign, ShoppingCart, Clock, Users, Play, Download, TrendingUp } from "lucide-react";

interface Order {
  id: string;
  price: number;
  status: string;
  pricing_tier: string;
  created_at: string;
  song_played_at?: string | null;
  song_play_count?: number | null;
  song_downloaded_at?: string | null;
  song_download_count?: number | null;
}

interface Lead {
  id: string;
  status: string;
  captured_at: string;
  preview_played_at?: string | null;
  preview_play_count?: number | null;
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

  const pendingOrders = orders.filter((o) => 
    ["paid", "in_progress"].includes(o.status)
  ).length;

  // Lead stats
  const totalLeads = leads.length;
  const unconvertedLeads = leads.filter((l) => l.status === "lead").length;
  const convertedLeads = leads.filter((l) => l.status === "converted").length;

  // Engagement stats
  const leadsWhoPlayed = leads.filter((l) => l.preview_played_at).length;
  const playedLeadsWhoConverted = leads.filter((l) => l.preview_played_at && l.status === "converted").length;
  const playToConvertRate = leadsWhoPlayed > 0 
    ? Math.round((playedLeadsWhoConverted / leadsWhoPlayed) * 100) 
    : 0;

  // Order engagement
  const deliveredOrders = orders.filter((o) => o.status === "delivered");
  const songsPlayed = orders.filter((o) => o.song_played_at).length;
  const songsDownloaded = orders.filter((o) => o.song_downloaded_at).length;

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
      description: `${convertedLeads} converted, ${unconvertedLeads} pending`,
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
    {
      title: "Previews Played",
      value: leadsWhoPlayed.toString(),
      description: `${leadsWhoPlayed} of ${totalLeads} leads`,
      icon: Play,
      color: "text-purple-600",
      bgColor: "bg-purple-100",
    },
    {
      title: "Play → Convert",
      value: `${playToConvertRate}%`,
      description: `${playedLeadsWhoConverted} of ${leadsWhoPlayed} who played`,
      icon: TrendingUp,
      color: "text-emerald-600",
      bgColor: "bg-emerald-100",
    },
    {
      title: "Songs Played",
      value: songsPlayed.toString(),
      description: `of ${deliveredOrders.length} delivered`,
      icon: Play,
      color: "text-cyan-600",
      bgColor: "bg-cyan-100",
    },
    {
      title: "Downloads",
      value: songsDownloaded.toString(),
      description: `of ${deliveredOrders.length} delivered`,
      icon: Download,
      color: "text-rose-600",
      bgColor: "bg-rose-100",
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9 gap-4 mb-8">
      {stats.map((stat) => (
        <Card key={stat.title}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-muted-foreground truncate">
                  {stat.title}
                </p>
                <p className="text-xl font-bold mt-1">{stat.value}</p>
                <p className="text-xs text-muted-foreground mt-1 truncate">
                  {stat.description}
                </p>
              </div>
              <div className={`p-1.5 rounded-lg ${stat.bgColor} shrink-0 ml-2`}>
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
