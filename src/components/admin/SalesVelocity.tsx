import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { toZonedTime } from "date-fns-tz";
import { format, startOfDay, isSameDay } from "date-fns";

const TZ = "America/Los_Angeles";

interface Order {
  id: string;
  price: number;
  status: string;
  created_at: string;
}

interface SalesVelocityProps {
  orders: Order[];
}

export function SalesVelocity({ orders }: SalesVelocityProps) {
  const data = useMemo(() => {
    const nowPST = toZonedTime(new Date(), TZ);
    const todayStartPST = startOfDay(nowPST);
    const yesterdayStartPST = new Date(todayStartPST);
    yesterdayStartPST.setDate(yesterdayStartPST.getDate() - 1);

    // Current time-of-day in minutes since midnight (PST)
    const minutesSinceMidnight = nowPST.getHours() * 60 + nowPST.getMinutes();

    // The cutoff for "yesterday by now" is yesterday's start + same minutes
    const yesterdayCutoffPST = new Date(yesterdayStartPST);
    yesterdayCutoffPST.setMinutes(yesterdayCutoffPST.getMinutes() + minutesSinceMidnight);

    let todayOrders = 0;
    let todayRevenue = 0;
    let yesterdayByNowOrders = 0;
    let yesterdayByNowRevenue = 0;
    let yesterdayFullOrders = 0;
    let yesterdayFullRevenue = 0;

    const active = orders.filter((o) => o.status !== "cancelled");

    for (const order of active) {
      const orderPST = toZonedTime(new Date(order.created_at), TZ);

      if (isSameDay(orderPST, todayStartPST)) {
        todayOrders++;
        todayRevenue += order.price;
      } else if (isSameDay(orderPST, yesterdayStartPST)) {
        yesterdayFullOrders++;
        yesterdayFullRevenue += order.price;
        if (orderPST <= yesterdayCutoffPST) {
          yesterdayByNowOrders++;
          yesterdayByNowRevenue += order.price;
        }
      }
    }

    const ordersPctChange =
      yesterdayByNowOrders > 0
        ? ((todayOrders - yesterdayByNowOrders) / yesterdayByNowOrders) * 100
        : null;

    const revenuePctChange =
      yesterdayByNowRevenue > 0
        ? ((todayRevenue - yesterdayByNowRevenue) / yesterdayByNowRevenue) * 100
        : null;

    const progressPct =
      yesterdayFullOrders > 0
        ? Math.min(Math.round((todayOrders / yesterdayFullOrders) * 100), 100)
        : todayOrders > 0
          ? 100
          : 0;

    const yesterdayDayName = format(yesterdayStartPST, "EEEE");
    const currentTimePST = format(nowPST, "h:mm a");

    return {
      todayOrders,
      todayRevenue,
      yesterdayByNowOrders,
      yesterdayByNowRevenue,
      yesterdayFullOrders,
      yesterdayFullRevenue,
      ordersPctChange,
      revenuePctChange,
      progressPct,
      yesterdayDayName,
      currentTimePST,
    };
  }, [orders]);

  const PctBadge = ({ pct }: { pct: number | null }) => {
    if (pct === null) {
      return <span className="text-xs text-muted-foreground ml-2">N/A (no orders yesterday)</span>;
    }
    const isUp = pct > 0;
    const isFlat = Math.abs(pct) < 1;
    const Icon = isFlat ? Minus : isUp ? TrendingUp : TrendingDown;
    const color = isFlat
      ? "text-muted-foreground"
      : isUp
        ? "text-green-600"
        : "text-red-600";
    return (
      <span className={`inline-flex items-center gap-1 text-sm font-medium ml-2 ${color}`}>
        <Icon className="h-3.5 w-3.5" />
        {isFlat ? "Flat" : `${Math.abs(Math.round(pct))}% ${isUp ? "ahead" : "behind"}`}
      </span>
    );
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-medium flex items-center justify-between">
          <span>Today's Pace</span>
          <span className="text-xs font-normal text-muted-foreground">
            as of {data.currentTimePST} PST · vs {data.yesterdayDayName}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Orders comparison */}
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Orders</p>
            <div className="flex items-baseline flex-wrap">
              <span className="text-2xl font-bold">{data.todayOrders}</span>
              <span className="text-sm text-muted-foreground ml-1.5">
                vs {data.yesterdayByNowOrders} by now
              </span>
              <PctBadge pct={data.ordersPctChange} />
            </div>
          </div>

          {/* Revenue comparison */}
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Revenue</p>
            <div className="flex items-baseline flex-wrap">
              <span className="text-2xl font-bold">${data.todayRevenue.toLocaleString()}</span>
              <span className="text-sm text-muted-foreground ml-1.5">
                vs ${data.yesterdayByNowRevenue.toLocaleString()} by now
              </span>
              <PctBadge pct={data.revenuePctChange} />
            </div>
          </div>
        </div>

        {/* Progress toward yesterday's full day */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Progress toward {data.yesterdayDayName}'s total</span>
            <span>
              {data.todayOrders} / {data.yesterdayFullOrders} orders · ${data.todayRevenue.toLocaleString()} / ${data.yesterdayFullRevenue.toLocaleString()}
            </span>
          </div>
          <Progress value={data.progressPct} className="h-2" />
        </div>
      </CardContent>
    </Card>
  );
}
