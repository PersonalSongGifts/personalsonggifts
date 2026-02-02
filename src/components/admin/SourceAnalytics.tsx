import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";

interface Order {
  id: string;
  price: number;
  status: string;
  utm_source?: string | null;
}

interface Lead {
  id: string;
  status: string;
  utm_source?: string | null;
}

interface SourceAnalyticsProps {
  orders: Order[];
  leads: Lead[];
}

// Color palette for sources
const SOURCE_COLORS: Record<string, string> = {
  facebook: "#1877F2",
  google: "#EA4335",
  tiktok: "#000000",
  instagram: "#E4405F",
  twitter: "#1DA1F2",
  email: "#7C3AED",
  direct: "#6B7280",
  other: "#9CA3AF",
};

function getSourceColor(source: string): string {
  const normalizedSource = source.toLowerCase();
  return SOURCE_COLORS[normalizedSource] || SOURCE_COLORS.other;
}

function normalizeSource(source: string | null | undefined): string {
  if (!source) return "Direct";
  // Capitalize first letter
  return source.charAt(0).toUpperCase() + source.slice(1).toLowerCase();
}

export function SourceAnalytics({ orders, leads }: SourceAnalyticsProps) {
  // Aggregate leads by source
  const leadsBySource = leads.reduce((acc, lead) => {
    const source = normalizeSource(lead.utm_source);
    acc[source] = (acc[source] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Aggregate orders by source (excluding cancelled)
  const ordersBySource = orders.reduce((acc, order) => {
    if (order.status === "cancelled") return acc;
    const source = normalizeSource(order.utm_source);
    acc[source] = (acc[source] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Aggregate revenue by source
  const revenueBySource = orders.reduce((acc, order) => {
    if (order.status === "cancelled") return acc;
    const source = normalizeSource(order.utm_source);
    acc[source] = (acc[source] || 0) + order.price;
    return acc;
  }, {} as Record<string, number>);

  // Get unique sources across leads and orders
  const allSources = [...new Set([
    ...Object.keys(leadsBySource),
    ...Object.keys(ordersBySource),
  ])].sort((a, b) => {
    // Sort by leads count descending
    return (leadsBySource[b] || 0) - (leadsBySource[a] || 0);
  });

  // Prepare pie chart data for leads
  const leadsPieData = allSources.map((source) => ({
    name: source,
    value: leadsBySource[source] || 0,
    color: getSourceColor(source),
  })).filter((d) => d.value > 0);

  // Prepare pie chart data for revenue
  const revenuePieData = allSources.map((source) => ({
    name: source,
    value: revenueBySource[source] || 0,
    color: getSourceColor(source),
  })).filter((d) => d.value > 0);

  // Calculate conversion rates by source
  const conversionData = allSources.map((source) => {
    const sourceLeads = leadsBySource[source] || 0;
    const sourceOrders = ordersBySource[source] || 0;
    const conversionRate = sourceLeads > 0 ? Math.round((sourceOrders / sourceLeads) * 100) : 0;
    return {
      source,
      leads: sourceLeads,
      orders: sourceOrders,
      revenue: revenueBySource[source] || 0,
      conversionRate,
    };
  }).filter((d) => d.leads > 0 || d.orders > 0);

  const totalLeads = leads.length;
  const totalOrders = orders.filter((o) => o.status !== "cancelled").length;
  const totalRevenue = orders.reduce((sum, o) => o.status !== "cancelled" ? sum + o.price : sum, 0);

  if (totalLeads === 0 && totalOrders === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Traffic Sources</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-8">
            No data yet. Traffic sources will appear once leads and orders are captured with UTM parameters.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Traffic Source Performance</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 font-medium">Source</th>
                  <th className="text-right py-2 font-medium">Leads</th>
                  <th className="text-right py-2 font-medium">Orders</th>
                  <th className="text-right py-2 font-medium">Revenue</th>
                  <th className="text-right py-2 font-medium">Conv. Rate</th>
                </tr>
              </thead>
              <tbody>
                {conversionData.map((row) => (
                  <tr key={row.source} className="border-b last:border-0">
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: getSourceColor(row.source) }}
                        />
                        {row.source}
                      </div>
                    </td>
                    <td className="text-right py-2">{row.leads}</td>
                    <td className="text-right py-2">{row.orders}</td>
                    <td className="text-right py-2">${row.revenue.toLocaleString()}</td>
                    <td className="text-right py-2">{row.conversionRate}%</td>
                  </tr>
                ))}
                {/* Totals row */}
                <tr className="font-medium bg-muted/50">
                  <td className="py-2">Total</td>
                  <td className="text-right py-2">{totalLeads}</td>
                  <td className="text-right py-2">{totalOrders}</td>
                  <td className="text-right py-2">${totalRevenue.toLocaleString()}</td>
                  <td className="text-right py-2">
                    {totalLeads > 0 ? Math.round((totalOrders / totalLeads) * 100) : 0}%
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Leads by Source */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Leads by Source</CardTitle>
          </CardHeader>
          <CardContent>
            {leadsPieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={leadsPieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    {leadsPieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => [`${value} leads`, "Leads"]} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-muted-foreground text-center py-8">No lead data</p>
            )}
          </CardContent>
        </Card>

        {/* Revenue by Source */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Revenue by Source</CardTitle>
          </CardHeader>
          <CardContent>
            {revenuePieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={revenuePieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    {revenuePieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => [`$${value.toLocaleString()}`, "Revenue"]} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-muted-foreground text-center py-8">No revenue data</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Conversion Rate Chart */}
      {conversionData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Conversion Rate by Source</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={conversionData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                <YAxis type="category" dataKey="source" width={80} />
                <Tooltip formatter={(value: number) => [`${value}%`, "Conversion Rate"]} />
                <Bar dataKey="conversionRate" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
