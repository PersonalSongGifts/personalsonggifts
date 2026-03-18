import { Card, CardContent } from "@/components/ui/card";
import { DollarSign, ShoppingCart, Clock, Users, Play, Download, TrendingUp, RefreshCw, MessageSquare, BookOpen } from "lucide-react";
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
  lyrics_unlocked_at?: string | null;
  lyrics_price_cents?: number | null;
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
  loadingMore?: boolean;
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

  // Lyrics Unlocks
  const lyricsUnlocked = orders.filter((o) => o.lyrics_unlocked_at);
  const totalUnlocks = lyricsUnlocked.length;
  const paidUnlocks = lyricsUnlocked.filter((o) => o.lyrics_price_cents && o.lyrics_price_cents > 0).length;
  const freeUnlocks = totalUnlocks - paidUnlocks;
  const unlockRevenueCents = lyricsUnlocked.reduce((sum, o) => sum + (o.lyrics_price_cents || 0), 0);
  const unlockRevenue = unlockRevenueCents / 100;

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
      label: "Lyrics Unlocks",
      stats: [
        { title: "Total Unlocks", value: totalUnlocks.toString(), description: "All time", icon: BookOpen, color: "text-fuchsia-600", bgColor: "bg-fuchsia-100" },
        { title: "Unlock Revenue", value: `$${unlockRevenue.toLocaleString()}`, description: `Paid: ${paidUnlocks}, Free: ${freeUnlocks}`, icon: DollarSign, color: "text-fuchsia-600", bgColor: "bg-fuchsia-100" },
        { title: "Paid Unlocks", value: paidUnlocks.toString(), description: "At $4.99 each", icon: BookOpen, color: "text-green-600", bgColor: "bg-green-100" },
        { title: "Free Unlocks", value: freeUnlocks.toString(), description: "Admin/comp unlocks", icon: BookOpen, color: "text-slate-600", bgColor: "bg-slate-100" },
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

export function StatsCards({ orders, leads = [], loadingMore = false }: StatsCardsProps) {
  const sections = useStats(orders, leads);

  return (
    <div className="space-y-6 mb-8">
      {loadingMore && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-lg px-4 py-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Still loading data… metrics will update when complete.
        </div>
      )}
      {sections.map((section) => (
        <div key={section.label}>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            {section.label}
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {section.stats.map((stat) => (
              <Card key={stat.title}>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-muted-foreground">
                        {stat.title}
                      </p>
                      <p className="text-2xl font-bold mt-1">{stat.value}</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        {stat.description}
                      </p>
                    </div>
                    <div className={`p-2 rounded-lg ${stat.bgColor} shrink-0 ml-3`}>
                      <stat.icon className={`h-5 w-5 ${stat.color}`} />
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
