import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Flame, Eye, Archive } from "lucide-react";
import { formatAdminDateShort } from "@/lib/utils";
import { getLabelForOption, occasionOptions } from "@/components/admin/adminDropdownOptions";
import type { Lead } from "@/components/admin/LeadsTable";
import { formatDistanceToNow } from "date-fns";

interface HotLeadsCardProps {
  leads: Lead[];
  onViewLead: (leadId: string) => void;
}

export function HotLeadsCard({ leads, onViewLead }: HotLeadsCardProps) {
  const hotLeads = leads
    .filter((l) => l.status !== "converted" && !l.order_id && (l.preview_play_count ?? 0) > 0)
    .sort((a, b) => (b.preview_play_count ?? 0) - (a.preview_play_count ?? 0))
    .slice(0, 10);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Flame className="h-5 w-5 text-orange-500" />
          <CardTitle className="text-lg">Hot Leads</CardTitle>
        </div>
        <CardDescription>
          Most-engaged unconverted leads — people who keep listening but haven't purchased yet
        </CardDescription>
      </CardHeader>
      <CardContent>
        {hotLeads.length === 0 ? (
          <p className="text-sm text-muted-foreground italic py-4 text-center">
            No preview plays recorded yet
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">#</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead className="text-center">Plays</TableHead>
                <TableHead>Last Played</TableHead>
                <TableHead>Occasion</TableHead>
                <TableHead>Became Lead</TableHead>
                <TableHead>Preview Sent</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {hotLeads.map((lead, i) => (
                <TableRow key={lead.id}>
                  <TableCell className="font-medium text-muted-foreground">{i + 1}</TableCell>
                  <TableCell className="font-medium">
                    {lead.customer_name}
                    {lead.dismissed_at && (
                      <Badge variant="outline" className="ml-1.5 text-[10px] px-1 py-0 gap-0.5">
                        <Archive className="h-2.5 w-2.5" /> dismissed
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{lead.email}</TableCell>
                  <TableCell className="text-center font-semibold">{lead.preview_play_count}</TableCell>
                  <TableCell className="text-xs">
                    {lead.preview_played_at
                      ? formatAdminDateShort(lead.preview_played_at)
                      : "—"}
                  </TableCell>
                  <TableCell className="text-xs">
                    {getLabelForOption(occasionOptions, lead.occasion)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(lead.captured_at), { addSuffix: true })}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {lead.preview_sent_at
                      ? formatAdminDateShort(lead.preview_sent_at)
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => onViewLead(lead.id)}
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
