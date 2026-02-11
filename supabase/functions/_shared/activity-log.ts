import { SupabaseClient } from "npm:@supabase/supabase-js@2.93.1";

export async function logActivity(
  supabase: SupabaseClient,
  entityType: "order" | "lead",
  entityId: string,
  eventType: string,
  actor: "system" | "admin" = "system",
  details?: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  try {
    const { error } = await supabase
      .from("order_activity_log")
      .insert({
        entity_type: entityType,
        entity_id: entityId,
        event_type: eventType,
        actor,
        details: details || null,
        metadata: metadata || null,
      });

    if (error) {
      console.error(`[ACTIVITY-LOG] Failed to log ${eventType} for ${entityType} ${entityId}:`, error);
    }
  } catch (e) {
    // Never let logging failures break the main flow
    console.error(`[ACTIVITY-LOG] Exception logging ${eventType}:`, e);
  }
}
