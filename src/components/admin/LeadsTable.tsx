import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Download, Eye, Users } from "lucide-react";

export interface Lead {
  id: string;
  email: string;
  phone: string | null;
  customer_name: string;
  recipient_name: string;
  recipient_type: string;
  occasion: string;
  genre: string;
  singer_preference: string;
  special_qualities: string;
  favorite_memory: string;
  special_message: string | null;
  status: string;
  captured_at: string;
  converted_at: string | null;
  order_id: string | null;
}

interface LeadsTableProps {
  leads: Lead[];
  loading: boolean;
}

const statusColors: Record<string, string> = {
  lead: "bg-amber-100 text-amber-800",
  converted: "bg-green-100 text-green-800",
};

export function LeadsTable({ leads, loading }: LeadsTableProps) {
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);

  const filteredLeads = statusFilter === "all" 
    ? leads 
    : leads.filter((lead) => lead.status === statusFilter);

  const exportToCSV = () => {
    if (filteredLeads.length === 0) return;

    const headers = [
      "Email",
      "Phone",
      "Customer Name",
      "Recipient Name",
      "Recipient Type",
      "Occasion",
      "Genre",
      "Singer",
      "Status",
      "Captured At",
    ];

    const rows = filteredLeads.map((lead) => [
      lead.email,
      lead.phone || "",
      lead.customer_name,
      lead.recipient_name,
      lead.recipient_type,
      lead.occasion,
      lead.genre,
      lead.singer_preference,
      lead.status,
      new Date(lead.captured_at).toLocaleString(),
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `leads-${statusFilter}-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Leads</SelectItem>
              <SelectItem value="lead">Unconverted</SelectItem>
              <SelectItem value="converted">Converted</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-sm text-muted-foreground">
            {filteredLeads.length} lead{filteredLeads.length !== 1 ? "s" : ""}
          </span>
        </div>
        <Button variant="outline" size="sm" onClick={exportToCSV} disabled={filteredLeads.length === 0}>
          <Download className="h-4 w-4 mr-2" />
          Export CSV
        </Button>
      </div>

      {loading ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">Loading leads...</p>
          </CardContent>
        </Card>
      ) : filteredLeads.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No leads found</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredLeads.map((lead) => (
            <Card key={lead.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-3 flex-wrap">
                      <h3 className="font-semibold text-lg">{lead.customer_name}</h3>
                      <Badge className={statusColors[lead.status] || "bg-gray-100 text-gray-800"}>
                        {lead.status === "lead" ? "Unconverted" : "Converted"}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      <strong>Email:</strong> {lead.email}
                      {lead.phone && <> • <strong>Phone:</strong> {lead.phone}</>}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      <strong>Song for:</strong> {lead.recipient_name} ({lead.recipient_type}) •{" "}
                      <strong>Occasion:</strong> {lead.occasion}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      <strong>Captured:</strong> {new Date(lead.captured_at).toLocaleString()}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedLead(lead)}
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    View Details
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!selectedLead} onOpenChange={() => setSelectedLead(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {selectedLead && (
            <>
              <DialogHeader>
                <DialogTitle>Lead Details</DialogTitle>
                <DialogDescription>
                  Lead ID: {selectedLead.id.slice(0, 8).toUpperCase()}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-6 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-medium text-sm text-muted-foreground mb-1">Customer</h4>
                    <p>{selectedLead.customer_name}</p>
                    <p className="text-sm text-muted-foreground">{selectedLead.email}</p>
                    {selectedLead.phone && (
                      <p className="text-sm text-muted-foreground">{selectedLead.phone}</p>
                    )}
                  </div>
                  <div>
                    <h4 className="font-medium text-sm text-muted-foreground mb-1">Recipient</h4>
                    <p>{selectedLead.recipient_name}</p>
                    <p className="text-sm text-muted-foreground">{selectedLead.recipient_type}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-medium text-sm text-muted-foreground mb-1">Occasion</h4>
                    <p>{selectedLead.occasion}</p>
                  </div>
                  <div>
                    <h4 className="font-medium text-sm text-muted-foreground mb-1">Music</h4>
                    <p>{selectedLead.genre} • {selectedLead.singer_preference}</p>
                  </div>
                </div>

                <div>
                  <h4 className="font-medium text-sm text-muted-foreground mb-1">Special Qualities</h4>
                  <p className="text-sm">{selectedLead.special_qualities}</p>
                </div>

                <div>
                  <h4 className="font-medium text-sm text-muted-foreground mb-1">Favorite Memory</h4>
                  <p className="text-sm">{selectedLead.favorite_memory}</p>
                </div>

                {selectedLead.special_message && (
                  <div>
                    <h4 className="font-medium text-sm text-muted-foreground mb-1">Special Message</h4>
                    <p className="text-sm">{selectedLead.special_message}</p>
                  </div>
                )}

                <div className="border-t pt-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Status:</span>{" "}
                      <Badge className={statusColors[selectedLead.status]}>
                        {selectedLead.status === "lead" ? "Unconverted" : "Converted"}
                      </Badge>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Captured:</span>{" "}
                      {new Date(selectedLead.captured_at).toLocaleString()}
                    </div>
                    {selectedLead.converted_at && (
                      <div>
                        <span className="text-muted-foreground">Converted:</span>{" "}
                        {new Date(selectedLead.converted_at).toLocaleString()}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
