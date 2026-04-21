import { Card, CardContent } from "@/components/ui/card";
import { DollarSign, ShoppingCart, Clock, Users, Play, Download, TrendingUp, RefreshCw, MessageSquare, BookOpen, Loader2, Video, Gift, Sparkles } from "lucide-react";
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
  download_unlocked_at?: string | null;
  download_price_cents?: number | null;
  bonus_unlocked_at?: string | null;
  bonus_price_cents?: number | null;
  bonus_song_url?: string | null;
  notes?: string | null;
  reaction_video_url?: string | null;
  reaction_submitted_at?: string | null;
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
  extra?: string;
}

interface StatSection {
  label: string;
  stats: StatItem[];
}

function getPaymentSource(order: Order): "paypal" | "stripe" {
  return order.notes?.startsWith("paypal_order:") ? "paypal" : "stripe";
}

// Total revenue per order in dollars = base price + paid upsells (cents-safe)
function orderTotalDollars(o: Order): number {
  const upsellCents =
    (o.lyrics_price_cents ?? 0) +
    (o.download_price_cents ?? 0) +
    (o.bonus_price_cents ?? 0);
  return o.price + upsellCents / 100;
}

function useStats(orders: Order[], leads: Lead[]): StatSection[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Revenue with payment source breakdown — includes base + all upsells
  const activeOrders = orders.filter((o) => o.status !== "cancelled");
  const baseRevenue = activeOrders.reduce((sum, o) => sum + o.price, 0);
  const lyricsRevAll = activeOrders.reduce((sum, o) => sum + (o.lyrics_price_cents ?? 0), 0) / 100;
  const downloadRevAll = activeOrders.reduce((sum, o) => sum + (o.download_price_cents ?? 0), 0) / 100;
  const bonusRevAll = activeOrders.reduce((sum, o) => sum + (o.bonus_price_cents ?? 0), 0) / 100;
  const totalRevenue = baseRevenue + lyricsRevAll + downloadRevAll + bonusRevAll;
  const stripeTotal = activeOrders.filter((o) => getPaymentSource(o) === "stripe").reduce((sum, o) => sum + orderTotalDollars(o), 0);
  const paypalTotal = activeOrders.filter((o) => getPaymentSource(o) === "paypal").reduce((sum, o) => sum + orderTotalDollars(o), 0);

  // Today: include base orders created today + any upsells unlocked today (regardless of order date)
  const todayOrders = activeOrders.filter((o) => new Date(o.created_at) >= today);
  const baseRevToday = todayOrders.reduce((sum, o) => sum + o.price, 0);
  const isToday = (iso?: string | null) => !!iso && new Date(iso) >= today;
  const lyricsRevToday = activeOrders
    .filter((o) => isToday(o.lyrics_unlocked_at))
    .reduce((s, o) => s + (o.lyrics_price_cents ?? 0), 0) / 100;
  const downloadRevToday = activeOrders
    .filter((o) => isToday(o.download_unlocked_at))
    .reduce((s, o) => s + (o.download_price_cents ?? 0), 0) / 100;
  const bonusRevToday = activeOrders
    .filter((o) => isToday(o.bonus_unlocked_at))
    .reduce((s, o) => s + (o.bonus_price_cents ?? 0), 0) / 100;
  const revenueToday = baseRevToday + lyricsRevToday + downloadRevToday + bonusRevToday;
  // Per-source today: base by order created_at + upsells by unlock timestamp on the parent order
  const sourceTotalToday = (src: "stripe" | "paypal") => {
    const baseToday = todayOrders.filter((o) => getPaymentSource(o) === src).reduce((s, o) => s + o.price, 0);
    const upsellToday = activeOrders
      .filter((o) => getPaymentSource(o) === src)
      .reduce((s, o) => {
        let cents = 0;
        if (isToday(o.lyrics_unlocked_at)) cents += o.lyrics_price_cents ?? 0;
        if (isToday(o.download_unlocked_at)) cents += o.download_price_cents ?? 0;
        if (isToday(o.bonus_unlocked_at)) cents += o.bonus_price_cents ?? 0;
        return s + cents;
      }, 0) / 100;
    return baseToday + upsellToday;
  };
  const stripeTodayRev = sourceTotalToday("stripe");
  const paypalTodayRev = sourceTotalToday("paypal");

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
    .reduce((sum, o) => sum + orderTotalDollars(o), 0);
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

  // Reaction Videos
  const reactionCount = orders.filter((o) => o.reaction_video_url && o.reaction_submitted_at).length;
  const reactionRate = deliveredOrders.length > 0 ? Math.round((reactionCount / deliveredOrders.length) * 100) : 0;

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

  // Download / Usage Rights Unlocks
  const downloadUnlocked = orders.filter((o) => o.download_unlocked_at);
  const downloadCount = downloadUnlocked.length;
  const downloadRev = downloadUnlocked.reduce((s, o) => s + (o.download_price_cents ?? 0), 0) / 100;
  const downloadAttachRate = deliveredOrders.length > 0
    ? Math.round((downloadCount / deliveredOrders.length) * 100)
    : 0;

  // Bonus Track Unlocks
  const bonusUnlocked = orders.filter((o) => o.bonus_unlocked_at);
  const bonusTotalCount = bonusUnlocked.length;
  const bonusPaidCount = bonusUnlocked.filter((o) => (o.bonus_price_cents ?? 0) > 0).length;
  const bonusCompedCount = bonusTotalCount - bonusPaidCount;
  const bonusRev = bonusUnlocked.reduce((s, o) => s + (o.bonus_price_cents ?? 0), 0) / 100;

  // Lyrics paid/comped breakdown for the Upsell row
  const lyricsCompedCount = freeUnlocks;
  const lyricsPaidCount = paidUnlocks;

  const totalUpsellRevenue = unlockRevenue + downloadRev + bonusRev;
  const upsellShare = totalRevenue > 0 ? Math.round((totalUpsellRevenue / totalRevenue) * 100) : 0;

  return [
    {
      label: "Revenue & Orders",
      stats: [
        { title: "Total Revenue", value: `$${Math.round(totalRevenue).toLocaleString()}`, description: `Base $${Math.round(baseRevenue).toLocaleString()} · Lyrics $${Math.round(lyricsRevAll).toLocaleString()} · DL $${Math.round(downloadRevAll).toLocaleString()} · Bonus $${Math.round(bonusRevAll).toLocaleString()}`, icon: DollarSign, color: "text-green-600", bgColor: "bg-green-100", extra: `Stripe $${Math.round(stripeTotal).toLocaleString()} · PayPal $${Math.round(paypalTotal).toLocaleString()}` },
        { title: "Revenue Today", value: `$${Math.round(revenueToday).toLocaleString()}`, description: `${ordersToday} orders today`, icon: DollarSign, color: "text-emerald-600", bgColor: "bg-emerald-100", extra: `Stripe $${Math.round(stripeTodayRev).toLocaleString()} · PayPal $${Math.round(paypalTodayRev).toLocaleString()}` },
        { title: "Orders Today", value: ordersToday.toString(), description: "New orders today", icon: ShoppingCart, color: "text-blue-600", bgColor: "bg-blue-100" },
        { title: "Total Orders", value: totalOrders.toString(), description: "All time", icon: ShoppingCart, color: "text-slate-600", bgColor: "bg-slate-100" },
        { title: "Pending", value: pendingOrders.toString(), description: "Awaiting completion", icon: Clock, color: "text-amber-600", bgColor: "bg-amber-100" },
        { title: "AOV", value: `$${activeOrders.length > 0 ? (totalRevenue / activeOrders.length).toFixed(2) : "0.00"}`, description: `Across ${activeOrders.length} orders (incl. upsells)`, icon: TrendingUp, color: "text-violet-600", bgColor: "bg-violet-100" },
      ],
    },
    {
      label: "Lead Recovery",
      stats: [
        { title: "Leads", value: totalLeads.toString(), description: `${convertedLeads} converted, ${unconvertedLeads} pending`, icon: Users, color: "text-indigo-600", bgColor: "bg-indigo-100" },
        { title: "Previews Sent", value: previewsSent.toString(), description: `of ${totalLeads} leads`, icon: Users, color: "text-violet-600", bgColor: "bg-violet-100" },
        { title: "True Recoveries", value: trueRecoveryCount.toString(), description: `$${Math.round(trueRecoveryRevenue).toLocaleString()} revenue`, icon: TrendingUp, color: "text-emerald-600", bgColor: "bg-emerald-100" },
        { title: "Recovery Rate", value: `${recoveryRate}%`, description: `${trueRecoveryCount} of ${previewsSent} sent`, icon: RefreshCw, color: "text-teal-600", bgColor: "bg-teal-100" },
        { title: "Play → Buy", value: `${playToBuyRate}%`, description: `${leadsWhoPlayedAndConverted} of ${leadsWhoPlayedPreview} played`, icon: Play, color: "text-purple-600", bgColor: "bg-purple-100" },
      ],
    },
    {
      label: "Upsell Performance",
      stats: [
        { title: "Lyrics Unlocks", value: `$${Math.round(unlockRevenue).toLocaleString()}`, description: `${lyricsPaidCount} paid · ${lyricsCompedCount} comped`, icon: BookOpen, color: "text-fuchsia-600", bgColor: "bg-fuchsia-100" },
        { title: "Download Unlocks", value: `$${Math.round(downloadRev).toLocaleString()}`, description: `${downloadCount} customers · ${downloadAttachRate}% attach`, icon: Download, color: "text-blue-600", bgColor: "bg-blue-100" },
        { title: "Bonus Track Unlocks", value: `$${Math.round(bonusRev).toLocaleString()}`, description: `${bonusPaidCount} paid · ${bonusCompedCount} comped`, icon: Gift, color: "text-amber-600", bgColor: "bg-amber-100" },
        { title: "Total Upsell Revenue", value: `$${Math.round(totalUpsellRevenue).toLocaleString()}`, description: `${upsellShare}% of total revenue`, icon: Sparkles, color: "text-violet-600", bgColor: "bg-violet-100" },
      ],
    },
    {
      label: "Engagement & SMS",
      stats: [
        { title: "Songs Played", value: songsPlayed.toString(), description: `of ${deliveredOrders.length} delivered`, icon: Play, color: "text-cyan-600", bgColor: "bg-cyan-100" },
        { title: "Downloads", value: songsDownloaded.toString(), description: `of ${deliveredOrders.length} delivered`, icon: Download, color: "text-rose-600", bgColor: "bg-rose-100" },
        { title: "SMS Sent", value: smsSent.toString(), description: `of ${smsOptedIn} opted in`, icon: MessageSquare, color: "text-sky-600", bgColor: "bg-sky-100" },
        { title: "SMS Failed", value: smsFailed.toString(), description: `${smsFailed} errors`, icon: MessageSquare, color: "text-orange-600", bgColor: "bg-orange-100" },
        { title: "Reactions", value: reactionCount.toString(), description: `${reactionRate}% of ${deliveredOrders.length} delivered`, icon: Video, color: "text-rose-600", bgColor: "bg-rose-100" },
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
                      {stat.extra && (
                        <p className="text-xs text-muted-foreground/70 mt-0.5">
                          {stat.extra}
                        </p>
                      )}
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
