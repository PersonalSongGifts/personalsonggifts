import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight, History, Loader2 } from "lucide-react";
import { formatAdminDate } from "@/lib/utils";

interface ActivityEvent {
  id: string;
  event_type: string;
  actor: string;
  details: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

const eventColors: Record<string, string> = {
  order_created: "bg-blue-100 text-blue-800",
  lyrics_generated: "bg-purple-100 text-purple-800",
  audio_generated: "bg-indigo-100 text-indigo-800",
  song_uploaded: "bg-green-100 text-green-800",
  song_regenerated: "bg-orange-100 text-orange-800",
  delivery_sent: "bg-emerald-100 text-emerald-800",
  delivery_scheduled: "bg-cyan-100 text-cyan-800",
  resend_scheduled: "bg-teal-100 text-teal-800",
  resend_sent: "bg-green-100 text-green-800",
  automation_cancelled: "bg-red-100 text-red-800",
  automation_reset: "bg-amber-100 text-amber-800",
  lyrics_edited: "bg-violet-100 text-violet-800",
  fields_updated: "bg-slate-100 text-slate-800",
  lead_converted: "bg-emerald-100 text-emerald-800",
  order_cancelled: "bg-red-100 text-red-800",
  order_restored: "bg-green-100 text-green-800",
};

interface ActivityLogProps {
  entityId: string;
  entityType: "order" | "lead";
  adminPassword: string;
}

export function ActivityLog({ entityId, entityType, adminPassword }: ActivityLogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const fetchLog = async () => {
    if (loaded) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-orders", {
        method: "POST",
        body: {
          action: "get_activity_log",
          entityId,
          adminPassword,
        },
      });
      if (error) throw error;
      setEvents(data?.events || []);
      setLoaded(true);
    } catch (e) {
      console.error("Failed to fetch activity log:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = (open: boolean) => {
    setIsOpen(open);
    if (open && !loaded) {
      fetchLog();
    }
  };

  return (
    <Collapsible open={isOpen} onOpenChange={handleToggle}>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" className="w-full justify-between px-0 hover:bg-transparent">
          <span className="flex items-center gap-2 text-sm font-medium">
            <History className="h-4 w-4" />
            Activity Log
          </span>
          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        {loading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            <span className="text-sm text-muted-foreground">Loading...</span>
          </div>
        ) : events.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">No activity recorded yet.</p>
        ) : (
          <div className="relative ml-3 border-l-2 border-muted pl-4 space-y-3 py-2 max-h-64 overflow-y-auto">
            {events.map((event) => (
              <div key={event.id} className="relative">
                <div className="absolute -left-[1.35rem] top-1 w-2.5 h-2.5 rounded-full bg-muted-foreground/40" />
                <div className="flex items-start gap-2 flex-wrap">
                  <Badge className={`text-[10px] px-1.5 py-0 ${eventColors[event.event_type] || "bg-gray-100 text-gray-800"}`}>
                    {event.event_type.replace(/_/g, " ")}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground">
                    {event.actor}
                  </span>
                </div>
                {event.details && (
                  <p className="text-xs text-muted-foreground mt-0.5">{event.details}</p>
                )}
                <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                  {formatAdminDate(event.created_at)}
                </p>
              </div>
            ))}
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
