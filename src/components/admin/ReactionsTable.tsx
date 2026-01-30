import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Video, Mail, Copy, Check, ExternalLink, Gift } from "lucide-react";
import { toast } from "sonner";

interface ReactionOrder {
  id: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  recipient_name: string;
  occasion: string;
  song_title: string | null;
  reaction_video_url: string;
  reaction_submitted_at: string;
}

interface ReactionsTableProps {
  orders: ReactionOrder[];
  loading: boolean;
  sort: "latest" | "oldest";
  onSortChange: (sort: "latest" | "oldest") => void;
}

export function ReactionsTable({ orders, loading, sort, onSortChange }: ReactionsTableProps) {
  const [selectedReaction, setSelectedReaction] = useState<ReactionOrder | null>(null);
  const [copiedEmail, setCopiedEmail] = useState<string | null>(null);

  const sortedOrders = [...orders].sort((a, b) => {
    const dateA = new Date(a.reaction_submitted_at).getTime();
    const dateB = new Date(b.reaction_submitted_at).getTime();
    return sort === "latest" ? dateB - dateA : dateA - dateB;
  });

  const handleCopyEmail = (email: string) => {
    navigator.clipboard.writeText(email);
    setCopiedEmail(email);
    toast.success("Email copied to clipboard!");
    setTimeout(() => setCopiedEmail(null), 2000);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <div className="animate-pulse">Loading reactions...</div>
        </CardContent>
      </Card>
    );
  }

  if (orders.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Video className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">No reaction videos submitted yet</p>
          <p className="text-sm text-muted-foreground mt-2">
            Customers can submit reactions at /submit-reaction after their song is delivered
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="flex items-center gap-4 flex-wrap mb-4">
        <Select value={sort} onValueChange={(v) => onSortChange(v as "latest" | "oldest")}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="latest">Latest First</SelectItem>
            <SelectItem value="oldest">Oldest First</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">
          {orders.length} reaction{orders.length !== 1 ? "s" : ""}
        </span>
        <Badge variant="secondary" className="gap-1">
          <Gift className="h-3 w-3" />
          ${orders.length * 50} in gift cards owed
        </Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {sortedOrders.map((order) => (
          <Card key={order.id} className="overflow-hidden hover:shadow-md transition-shadow">
            <div 
              className="aspect-video bg-muted relative cursor-pointer group"
              onClick={() => setSelectedReaction(order)}
            >
              <video
                src={order.reaction_video_url}
                className="w-full h-full object-cover"
                preload="metadata"
              />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <Video className="h-10 w-10 text-white" />
              </div>
            </div>
            <CardContent className="p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{order.customer_name}</p>
                  <p className="text-sm text-muted-foreground truncate">
                    Song for {order.recipient_name}
                  </p>
                </div>
                <Badge variant="outline" className="shrink-0">
                  {order.occasion}
                </Badge>
              </div>
              
              <div className="flex items-center gap-2 text-sm">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs gap-1"
                  onClick={() => handleCopyEmail(order.customer_email)}
                >
                  {copiedEmail === order.customer_email ? (
                    <Check className="h-3 w-3 text-green-500" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                  {order.customer_email}
                </Button>
              </div>

              <p className="text-xs text-muted-foreground">
                Submitted {formatDate(order.reaction_submitted_at)}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Video Preview Dialog */}
      <Dialog open={!!selectedReaction} onOpenChange={() => setSelectedReaction(null)}>
        <DialogContent className="max-w-3xl">
          {selectedReaction && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Video className="h-5 w-5" />
                  Reaction from {selectedReaction.customer_name}
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4">
                <video
                  src={selectedReaction.reaction_video_url}
                  controls
                  autoPlay
                  className="w-full rounded-lg"
                />

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Customer</p>
                    <p className="font-medium">{selectedReaction.customer_name}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Recipient</p>
                    <p className="font-medium">{selectedReaction.recipient_name}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Occasion</p>
                    <p className="font-medium">{selectedReaction.occasion}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Song Title</p>
                    <p className="font-medium">{selectedReaction.song_title || "—"}</p>
                  </div>
                </div>

                <div className="border-t pt-4 space-y-3">
                  <p className="text-sm font-medium">Contact for Gift Card</p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={() => handleCopyEmail(selectedReaction.customer_email)}
                    >
                      {copiedEmail === selectedReaction.customer_email ? (
                        <Check className="h-4 w-4 text-green-500" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                      {selectedReaction.customer_email}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      asChild
                    >
                      <a href={`mailto:${selectedReaction.customer_email}?subject=Your $50 Gift Card for Sharing Your Reaction!`}>
                        <Mail className="h-4 w-4" />
                        Send Email
                      </a>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      asChild
                    >
                      <a href={selectedReaction.reaction_video_url} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-4 w-4" />
                        Open Video
                      </a>
                    </Button>
                  </div>
                  {selectedReaction.customer_phone && (
                    <p className="text-sm text-muted-foreground">
                      Phone: {selectedReaction.customer_phone}
                    </p>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
