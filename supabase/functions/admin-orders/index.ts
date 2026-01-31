import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-password, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const adminPassword = Deno.env.get("ADMIN_PASSWORD");
    if (!adminPassword) {
      throw new Error("ADMIN_PASSWORD not configured");
    }

    // Normalize to avoid invisible whitespace/newline issues from secret editors
    const normalizedAdminPassword = adminPassword.trim();

    const url = new URL(req.url);

    // Safely parse JSON body for POST requests (also allows passing adminPassword in body)
    let body: Record<string, unknown> | null = null;
    if (req.method === "POST") {
      try {
        const parsed = await req.json();
        if (parsed && typeof parsed === "object") body = parsed as Record<string, unknown>;
      } catch {
        body = null;
      }
    }

    // Verify admin password (header for backward compatibility, body for special-char safety)
    const providedPasswordRaw =
      req.headers.get("x-admin-password") ??
      (typeof body?.adminPassword === "string" ? (body.adminPassword as string) : null);

    const providedPassword = providedPasswordRaw?.trim() ?? null;

    if (!providedPassword || providedPassword !== normalizedAdminPassword) {
      console.log(
        "Admin auth failed",
        JSON.stringify({
          hasHeader: !!req.headers.get("x-admin-password"),
          hasBody: typeof body?.adminPassword === "string",
          providedLen: providedPasswordRaw ? String(providedPasswordRaw).length : null,
          providedTrimLen: providedPassword ? providedPassword.length : null,
          expectedLen: adminPassword.length,
          expectedTrimLen: normalizedAdminPassword.length,
        })
      );
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Admin auth ok");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // GET: List all orders
    if (req.method === "GET") {
      const status = url.searchParams.get("status");
      
      let query = supabase
        .from("orders")
        .select("*")
        .order("created_at", { ascending: false });

      if (status && status !== "all") {
        query = query.eq("status", status);
      }

      const { data: orders, error } = await query;

      if (error) {
        throw error;
      }

      return new Response(
        JSON.stringify({ orders }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // POST: List orders (action=list) OR update order (status, song_url, deliver)
    if (req.method === "POST") {
      if (body?.action === "list") {
        const status = typeof body.status === "string" ? body.status : "all";

        let query = supabase
          .from("orders")
          .select("*")
          .order("created_at", { ascending: false });

        if (status && status !== "all") {
          query = query.eq("status", status);
        }

        const { data: orders, error } = await query;
        if (error) throw error;

        // Also fetch full leads data
        const { data: leads, error: leadsError } = await supabase
          .from("leads")
          .select("*")
          .order("captured_at", { ascending: false });

        if (leadsError) {
          console.error("Failed to fetch leads:", leadsError);
        }

        return new Response(
          JSON.stringify({ orders, leads: leads || [] }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Update lead preview schedule (used by Leads UI). This must be server-side because leads are not client-updatable.
      if (body?.action === "update_lead_preview_schedule") {
        const leadId = typeof body.leadId === "string" ? body.leadId : null;
        const previewScheduledAtRaw =
          body.previewScheduledAt === null
            ? null
            : typeof body.previewScheduledAt === "string"
              ? body.previewScheduledAt
              : null;

        if (!leadId) {
          return new Response(
            JSON.stringify({ error: "Lead ID required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Validate scheduled time (if provided)
        if (previewScheduledAtRaw) {
          const dt = new Date(previewScheduledAtRaw);
          if (Number.isNaN(dt.getTime())) {
            return new Response(
              JSON.stringify({ error: "Invalid previewScheduledAt" }),
              { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
          if (dt <= new Date()) {
            return new Response(
              JSON.stringify({ error: "Scheduled time must be in the future" }),
              { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }

        // Ensure lead exists and is eligible
        const { data: lead, error: leadError } = await supabase
          .from("leads")
          .select("id, status, preview_sent_at, preview_song_url, preview_token")
          .eq("id", leadId)
          .single();

        if (leadError || !lead) {
          return new Response(
            JSON.stringify({ error: "Lead not found" }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        if (lead.status === "converted") {
          return new Response(
            JSON.stringify({ error: "Lead already converted" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        if (lead.preview_sent_at) {
          return new Response(
            JSON.stringify({ error: "Preview already sent" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        if (!lead.preview_song_url || !lead.preview_token) {
          return new Response(
            JSON.stringify({ error: "Preview not ready - upload song first" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { data: updatedLead, error: updateError } = await supabase
          .from("leads")
          .update({
            preview_scheduled_at: previewScheduledAtRaw,
            // ensure status stays consistent
            status: lead.status === "lead" ? "song_ready" : lead.status,
          })
          .eq("id", leadId)
          .select("*")
          .single();

        if (updateError) {
          console.error("Failed to update lead schedule:", updateError);
          throw updateError;
        }

        return new Response(
          JSON.stringify({ lead: updatedLead }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { orderId, status, songUrl, song_title, deliver, scheduleDelivery, scheduledDeliveryAt } = (body ?? {}) as Record<string, unknown>;

      if (!orderId) {
        return new Response(
          JSON.stringify({ error: "Order ID required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Update order
      const updateData: Record<string, unknown> = {};
      if (status) updateData.status = status;
      if (songUrl) updateData.song_url = songUrl;
      if (song_title) updateData.song_title = song_title;

      // Handle scheduled delivery
      if (scheduleDelivery && scheduledDeliveryAt) {
        const scheduledTime = new Date(scheduledDeliveryAt as string);
        
        // Validate scheduled time is in the future
        if (scheduledTime <= new Date()) {
          return new Response(
            JSON.stringify({ error: "Scheduled time must be in the future" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        
        updateData.scheduled_delivery_at = scheduledDeliveryAt;
        updateData.status = "ready"; // Mark as ready for scheduled delivery
      }

      if (deliver) {
        updateData.status = "delivered";
        updateData.delivered_at = new Date().toISOString();
        // Clear any scheduled delivery since we're delivering now
        updateData.scheduled_delivery_at = null;
      }

      const { data: order, error: updateError } = await supabase
        .from("orders")
        .update(updateData)
        .eq("id", orderId)
        .select()
        .single();

      if (updateError) {
        throw updateError;
      }

      // If scheduling delivery, return success without sending email
      if (scheduleDelivery) {
        const scheduledPST = new Date(scheduledDeliveryAt as string).toLocaleString("en-US", {
          timeZone: "America/Los_Angeles",
          weekday: "short",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        }) + " PST";

        return new Response(
          JSON.stringify({ 
            order, 
            message: `Delivery scheduled for ${scheduledPST}` 
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // If delivering now, send the delivery email
      if (deliver && order.song_url) {
        try {
          const emailResponse = await fetch(
            `${supabaseUrl}/functions/v1/send-song-delivery`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${supabaseServiceKey}`,
              },
              body: JSON.stringify({
                orderId: order.id,
                customerEmail: order.customer_email,
                customerName: order.customer_name,
                recipientName: order.recipient_name,
                occasion: order.occasion,
                songUrl: order.song_url,
              }),
            }
          );

          if (!emailResponse.ok) {
            console.error("Failed to send delivery email");
          }
        } catch (emailError) {
          console.error("Email error:", emailError);
        }
      }

      return new Response(
        JSON.stringify({ order }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Admin orders error:", error);
    const message = error instanceof Error ? error.message : "Server error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
