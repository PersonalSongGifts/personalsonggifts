import { Card, CardContent } from "@/components/ui/card";
import { DollarSign, ShoppingCart, Clock, Users, Play, Download, TrendingUp, RefreshCw, MessageSquare } from "lucide-react";
import { LucideIcon } from "lucide-react";

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
  source?: string | null;
  sms_opt_in?: boolean;
  sms_status?: string | null;
}

interface Lead {
  id: string;
  status: string;
  captured_at: string;
  preview_played_at?: string | null;
  preview_play_count?: number | null;
  preview_sent_at?: string | null;
  order_id?: string | null;
  sms_opt_in?: boolean;
  sms_status?: string | null;
}

interface StatsCardsProps {
  orders: Order[];
  leads?: Lead[];
}

interface StatItem {
  title: string;
  value: string;
  description: string;
  icon: LucideIcon;
  color: string;
  bgColor: string;
}

interface StatSection {
  label: string;
  stats: StatItem[];
}

function useStats(orders: Order[], leads: Lead[]): StatSection[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Revenue
  const totalRevenue = orders.reduce((sum, o) => o.status !== "cancelled" ? sum + o.price : sum, 0);
  const revenueToday = orders.reduce((sum, o) => {
    if (o.status !== "cancelled" && new Date(o.created_at) >= today) {
      return sum + o.price;
    }
    return sum;
  }, 0);

  // Orders
  const totalOrders = orders.length;
  const ordersToday = orders.filter((o) => new Date(o.created_at) >= today).length;
  const pendingOrders = orders.filter((o) => ["paid", "in_progress"].includes(o.status)).length;

  // Lead basics
  const totalLeads = leads.length;
  const unconvertedLeads = leads.filter((l) => l.status === "lead").length;
  const convertedLeads = leads.filter((l) => l.status === "converted").length;

  // Lead recovery
  const previewsSent = leads.filter((l) => l.preview_sent_at).length;
  const trueRecoveries = leads.filter((l) => l.preview_sent_at && l.status === "converted");
  const trueRecoveryCount = trueRecoveries.length;
  const trueRecoveryOrderIds = new Set(trueRecoveries.map((l) => l.order_id).filter(Boolean));
  const trueRecoveryRevenue = orders
    .filter((o) => trueRecoveryOrderIds.has(o.id) && o.status !== "cancelled")
    .reduce((sum, o) => sum + o.price, 0);
  const recoveryRate = previewsSent > 0 ? Math.round((trueRecoveryCount / previewsSent) * 100) : 0;

  // Play-to-buy
  const leadsWhoPlayedAndConverted = leads.filter(
    (l) => l.preview_sent_at && l.preview_played_at && l.status === "converted"
  ).length;
  const leadsWhoPlayedPreview = leads.filter(
    (l) => l.preview_sent_at && l.preview_played_at
  ).length;
  const playToBuyRate = leadsWhoPlayedPreview > 0
    ? Math.round((leadsWhoPlayedAndConverted / leadsWhoPlayedPreview) * 100)
    : 0;

  // Engagement
  const deliveredOrders = orders.filter((o) => o.status === "delivered");
  const songsPlayed = orders.filter((o) => o.song_played_at).length;
  const songsDownloaded = orders.filter((o) => o.song_downloaded_at).length;

  // SMS
  const allEntities = [...orders, ...leads];
  const smsOptedIn = allEntities.filter((e) => e.sms_opt_in).length;
  const smsSent = allEntities.filter((e) => e.sms_status === "sent").length;
  const smsFailed = allEntities.filter((e) => e.sms_status === "failed").length;

  return [
    {
      label: "Revenue & Orders",
      stats: [
        { title: "Total Revenue", value: `$${totalRevenue.toLocaleString()}`, description: "All time earnings", icon: DollarSign, color: "text-green-600", bgColor: "bg-green-100" },
        { title: "Revenue Today", value: `$${revenueToday.toLocaleString()}`, description: `${ordersToday} orders today`, icon: DollarSign, color: "text-emerald-600", bgColor: "bg-emerald-100" },
        { title: "Orders Today", value: ordersToday.toString(), description: "New orders today", icon: ShoppingCart, color: "text-blue-600", bgColor: "bg-blue-100" },
        { title: "Total Orders", value: totalOrders.toString(), description: "All time", icon: ShoppingCart, color: "text-slate-600", bgColor: "bg-slate-100" },
        { title: "Pending", value: pendingOrders.toString(), description: "Awaiting completion", icon: Clock, color: "text-amber-600", bgColor: "bg-amber-100" },
      ],
    },
    {
      label: "Lead Recovery",
      stats: [
        { title: "Leads", value: totalLeads.toString(), description: `${convertedLeads} converted, ${unconvertedLeads} pending`, icon: Users, color: "text-indigo-600", bgColor: "bg-indigo-100" },
        { title: "Previews Sent", value: previewsSent.toString(), description: `of ${totalLeads} leads`, icon: Users, color: "text-violet-600", bgColor: "bg-violet-100" },
        { title: "True Recoveries", value: trueRecoveryCount.toString(), description: `$${trueRecoveryRevenue.toLocaleString()} revenue`, icon: TrendingUp, color: "text-emerald-600", bgColor: "bg-emerald-100" },
        { title: "Recovery Rate", value: `${recoveryRate}%`, description: `${trueRecoveryCount} of ${previewsSent} sent`, icon: RefreshCw, color: "text-teal-600", bgColor: "bg-teal-100" },
        { title: "Play → Buy", value: `${playToBuyRate}%`, description: `${leadsWhoPlayedAndConverted} of ${leadsWhoPlayedPreview} played`, icon: Play, color: "text-purple-600", bgColor: "bg-purple-100" },
      ],
    },
    {
      label: "Engagement & SMS",
      stats: [
        { title: "Songs Played", value: songsPlayed.toString(), description: `of ${deliveredOrders.length} delivered`, icon: Play, color: "text-cyan-600", bgColor: "bg-cyan-100" },
        { title: "Downloads", value: songsDownloaded.toString(), description: `of ${deliveredOrders.length} delivered`, icon: Download, color: "text-rose-600", bgColor: "bg-rose-100" },
        { title: "SMS Sent", value: smsSent.toString(), description: `of ${smsOptedIn} opted in`, icon: MessageSquare, color: "text-sky-600", bgColor: "bg-sky-100" },
        { title: "SMS Failed", value: smsFailed.toString(), description: `${smsFailed} errors`, icon: MessageSquare, color: "text-orange-600", bgColor: "bg-orange-100" },
      ],
    },
  ];
}

export function StatsCards({ orders, leads = [] }: StatsCardsProps) {
  const sections = useStats(orders, leads);

  return (
    <div className="space-y-6 mb-8">
      {sections.map((section) => (
        <div key={section.label}>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            {section.label}
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {section.stats.map((stat) => (
              <Card key={stat.title}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-muted-foreground">
                        {stat.title}
                      </p>
                      <p className="text-xl font-bold mt-1">{stat.value}</p>
                      <p className="text-xs text-muted-foreground mt-1">
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
        </div>
      ))}
    </div>
  );
}
