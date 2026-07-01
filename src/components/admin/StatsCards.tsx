import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { DollarSign, ShoppingCart, Clock, Users, Play, Download, TrendingUp, RefreshCw, MessageSquare, BookOpen, Loader2, Video, Gift, Sparkles, Heart } from "lucide-react";
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
  adminPassword?: string;
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

interface TipsSummary {
  countAll: number;
  sumCentsAll: number;
  countToday: number;
  sumCentsToday: number;
}

function useStats(orders: Order[], leads: Lead[], tips: TipsSummary | null): StatSection[] {
  // PST midnight (America/Los_Angeles) as an absolute UTC timestamp, so
  // "today" matches server-side PST logic instead of the browser's local tz.
  const today = (() => {
    const now = new Date();
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(now);
    const y = parts.find(p => p.type === "year")!.value;
    const m = parts.find(p => p.type === "month")!.value;
    const d = parts.find(p => p.type === "day")!.value;
    const tzName = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles", timeZoneName: "short",
    }).formatToParts(now).find(p => p.type === "timeZoneName")!.value;
    const offset = tzName === "PDT" ? "-07:00" : "-08:00";
    return new Date(`${y}-${m}-${d}T00:00:00${offset}`);
  })();

  // Revenue with payment source breakdown — includes base + all upsells
  const activeOrders = orders.filter((o) => o.status !== "cancelled");
  const baseRevenue = activeOrders.reduce((sum, o) => sum + o.price, 0);
  const lyricsRevAll = activeOrders.reduce((sum, o) => sum + (o.lyrics_price_cents ?? 0), 0) / 100;
  const downloadRevAll = activeOrders.reduce((sum, o) => sum + (o.download_price_cents ?? 0), 0) / 100;
  const bonusRevAll = activeOrders.reduce((sum, o) => sum + (o.bonus_price_cents ?? 0), 0) / 100;
  const totalRevenue = baseRevenue + lyricsRevAll + downloadRevAll + bonusRevAll;
  const stripeTotal = activeOrders.filter((o) => getPaymentSource(o) === "stripe").reduce((sum, o) => sum + orderTotalDollars(o), 0);
  const paypalTotal = activeOrders.filter((o) => getPaymentSource(o) === "paypal").reduce((sum, o) => sum + orderTotalDollars(o), 0);

  // Tips (donations) — separate revenue stream
  const tipsRevAll = tips ? tips.sumCentsAll / 100 : 0;
  const tipsCountAll = tips?.countAll ?? 0;
  const tipsRevToday = tips ? tips.sumCentsToday / 100 : 0;
  const tipsCountToday = tips?.countToday ?? 0;

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
  const revenueToday = baseRevToday + lyricsRevToday + downloadRevToday + bonusRevToday + tipsRevToday;
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

  const grandTotalRevenue = totalRevenue + tipsRevAll;

  // Orders
  const totalOrders = orders.length;
  const ordersToday = orders.filter((o) => new Date(o.created_at) >= today).length;
  const pendingOrders = orders.filter((o) => ["paid", "in_progress"].includes(o.status)).length;

  // Lead basics
  const totalLeads = leads.length;
  const unconvertedLeads = leads.filter((l) => l.status === "lead").length;
  const convertedLeads = leads.filter((l) => l.status === "converted").length;
  const previewSentLeads = leads.filter((l) => l.status === "preview_sent").length;

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
  const upsellShare = grandTotalRevenue > 0 ? Math.round((totalUpsellRevenue / grandTotalRevenue) * 100) : 0;

  return [
    {
      label: "Revenue & Orders",
      stats: [
        { title: "Total Revenue", value: `$${Math.round(grandTotalRevenue).toLocaleString()}`, description: `Base $${Math.round(baseRevenue).toLocaleString()} · Lyrics $${Math.round(lyricsRevAll).toLocaleString()} · DL $${Math.round(downloadRevAll).toLocaleString()} · Bonus $${Math.round(bonusRevAll).toLocaleString()} · Tips $${Math.round(tipsRevAll).toLocaleString()}`, icon: DollarSign, color: "text-green-600", bgColor: "bg-green-100", extra: `Stripe $${Math.round(stripeTotal).toLocaleString()} · PayPal $${Math.round(paypalTotal).toLocaleString()} · Tips $${Math.round(tipsRevAll).toLocaleString()}` },
        { title: "Revenue Today", value: `$${Math.round(revenueToday).toLocaleString()}`, description: `${ordersToday} orders today`, icon: DollarSign, color: "text-emerald-600", bgColor: "bg-emerald-100", extra: `Stripe $${Math.round(stripeTodayRev).toLocaleString()} · PayPal $${Math.round(paypalTodayRev).toLocaleString()} · Tips $${Math.round(tipsRevToday).toLocaleString()}` },
        { title: "Tips / Donations", value: tipsCountAll.toString(), description: `$${Math.round(tipsRevAll).toLocaleString()} all-time${tipsCountAll > 0 ? ` · avg $${(tipsRevAll / tipsCountAll).toFixed(2)}` : ""}`, icon: Heart, color: "text-pink-600", bgColor: "bg-pink-100", extra: `${tipsCountToday} today · $${Math.round(tipsRevToday).toLocaleString()}` },
        { title: "Orders Today", value: ordersToday.toString(), description: "New orders today", icon: ShoppingCart, color: "text-blue-600", bgColor: "bg-blue-100" },
        { title: "Total Orders", value: totalOrders.toString(), description: "All time", icon: ShoppingCart, color: "text-slate-600", bgColor: "bg-slate-100" },
        { title: "Pending", value: pendingOrders.toString(), description: "Awaiting completion", icon: Clock, color: "text-amber-600", bgColor: "bg-amber-100" },
        { title: "AOV", value: `$${activeOrders.length > 0 ? (totalRevenue / activeOrders.length).toFixed(2) : "0.00"}`, description: `Across ${activeOrders.length} orders (incl. upsells, excl. tips)`, icon: TrendingUp, color: "text-violet-600", bgColor: "bg-violet-100" },
      ],
    },
    {
      label: "Lead Recovery",
      stats: [
        { title: "Leads", value: totalLeads.toString(), description: `${convertedLeads} converted · ${previewSentLeads} preview sent · ${unconvertedLeads} new`, icon: Users, color: "text-indigo-600", bgColor: "bg-indigo-100" },
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

export function StatsCards({ orders, leads = [], loadingMore = false, adminPassword }: StatsCardsProps) {
  const [tips, setTips] = useState<TipsSummary | null>(null);

  useEffect(() => {
    if (!adminPassword) return;
    let cancelled = false;
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const fetchTips = async () => {
      try {
        const [allRes, todayRes] = await Promise.all([
          fetch(`${supabaseUrl}/functions/v1/admin-tips-stats`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-admin-password": adminPassword },
            body: JSON.stringify({ windowDays: null, tippersLimit: 1 }),
          }).then((r) => r.json()),
          fetch(`${supabaseUrl}/functions/v1/admin-tips-stats`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-admin-password": adminPassword },
            body: JSON.stringify({ windowDays: 1, tippersLimit: 1 }),
          }).then((r) => r.json()),
        ]);
        if (cancelled) return;
        // Today = PST calendar day from the daily bucket
        const pstToday = new Intl.DateTimeFormat("en-CA", {
          timeZone: "America/Los_Angeles",
          year: "numeric", month: "2-digit", day: "2-digit",
        }).format(new Date());
        const todayBucket = (todayRes?.daily || []).find((d: { date: string }) => d.date === pstToday);
        setTips({
          countAll: allRes?.totals?.count ?? 0,
          sumCentsAll: allRes?.totals?.sumCents ?? 0,
          countToday: todayBucket?.count ?? 0,
          sumCentsToday: todayBucket?.cents ?? 0,
        });
      } catch (e) {
        console.error("Failed to load tips summary:", e);
      }
    };
    fetchTips();
    return () => { cancelled = true; };
  }, [adminPassword]);

  const sections = useStats(orders, leads, tips);

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
