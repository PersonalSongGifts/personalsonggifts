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

    // Log request intent (avoid logging adminPassword or full body)
    if (req.method === "POST") {
      const action = typeof body?.action === "string" ? (body.action as string) : null;
      const orderId = typeof body?.orderId === "string" ? (body.orderId as string) : null;
      const leadId = typeof body?.leadId === "string" ? (body.leadId as string) : null;
      console.log(
        "[ADMIN] POST",
        JSON.stringify({ action, orderId, leadId })
      );
    }

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

      // Get automation status for dashboard
      if (body?.action === "get_automation_status") {
        // Get automation_enabled setting
        const { data: enabledSetting } = await supabase
          .from("admin_settings")
          .select("value")
          .eq("key", "automation_enabled")
          .maybeSingle();

        // Get quality threshold setting
        const { data: thresholdSetting } = await supabase
          .from("admin_settings")
          .select("value")
          .eq("key", "automation_quality_threshold")
          .maybeSingle();

        // Get automation target setting
        const { data: targetSetting } = await supabase
          .from("admin_settings")
          .select("value")
          .eq("key", "automation_target")
          .maybeSingle();

        const enabled = enabledSetting?.value !== "false";
        const qualityThreshold = parseInt(thresholdSetting?.value || "65", 10);
        const automationTarget = targetSetting?.value || "leads";

        // Get active jobs (leads with automation_status set)
        const { data: activeLeads } = await supabase
          .from("leads")
          .select("*")
          .not("automation_status", "is", null)
          .not("automation_status", "eq", "")
          .order("automation_started_at", { ascending: false })
          .limit(50);

        // Get stats
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const { data: allAutomationLeads } = await supabase
          .from("leads")
          .select("automation_status, automation_started_at")
          .not("automation_status", "is", null);

        // Use actual pipeline status names: lyrics_generating, audio_generating (not generating_lyrics, generating_audio)
        const stats = {
          pending: allAutomationLeads?.filter(l => l.automation_status === "pending").length || 0,
          generatingLyrics: allAutomationLeads?.filter(l => l.automation_status === "lyrics_generating").length || 0,
          generatingAudio: allAutomationLeads?.filter(l => l.automation_status === "audio_generating" || l.automation_status === "lyrics_ready").length || 0,
          completedToday: allAutomationLeads?.filter(l => 
            l.automation_status === "completed" && 
            l.automation_started_at && 
            new Date(l.automation_started_at) >= today
          ).length || 0,
          failedToday: allAutomationLeads?.filter(l => 
            l.automation_status === "failed" && 
            l.automation_started_at && 
            new Date(l.automation_started_at) >= today
          ).length || 0,
        };

        // Map active jobs - use actual pipeline statuses
        const activeJobs = (activeLeads || [])
          .filter(l => ["pending", "lyrics_generating", "lyrics_ready", "audio_generating", "completed", "failed"].includes(l.automation_status || ""))
          .map(l => ({
            id: l.id,
            recipientName: l.recipient_name,
            customerName: l.customer_name,
            status: l.automation_status,
            startedAt: l.automation_started_at,
            error: l.automation_last_error,
            lyrics: l.automation_lyrics,
            genre: l.genre,
            occasion: l.occasion,
          }));

        // Get eligible leads (quality >= threshold, no song, not already in automation)
        const { data: eligibleLeads } = await supabase
          .from("leads")
          .select("id, recipient_name, customer_name, quality_score, genre, occasion, email")
          .gte("quality_score", qualityThreshold)
          .is("full_song_url", null)
          .is("automation_status", null)
          .is("dismissed_at", null)
          .neq("status", "converted")
          .order("quality_score", { ascending: false })
          .limit(50);

        return new Response(
          JSON.stringify({
            enabled,
            automationTarget,
            qualityThreshold,
            stats,
            activeJobs,
            eligibleLeads: (eligibleLeads || []).map(l => ({
              id: l.id,
              recipientName: l.recipient_name,
              customerName: l.customer_name,
              qualityScore: l.quality_score,
              genre: l.genre,
              occasion: l.occasion,
              email: l.email,
            })),
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Set automation enabled/disabled
      if (body?.action === "set_automation_enabled") {
        const enabled = body.enabled === true;

        await supabase
          .from("admin_settings")
          .upsert({
            key: "automation_enabled",
            value: enabled ? "true" : "false",
            updated_at: new Date().toISOString(),
          }, { onConflict: "key" });

        console.log(`Automation ${enabled ? "enabled" : "disabled"}`);

        return new Response(
          JSON.stringify({ success: true, enabled }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Set quality threshold
      if (body?.action === "set_quality_threshold") {
        const threshold = typeof body.threshold === "number" ? body.threshold : 65;

        await supabase
          .from("admin_settings")
          .upsert({
            key: "automation_quality_threshold",
            value: String(threshold),
            updated_at: new Date().toISOString(),
          }, { onConflict: "key" });

        console.log(`Quality threshold set to ${threshold}`);

        return new Response(
          JSON.stringify({ success: true, threshold }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Set automation target (leads, orders, or both)
      if (body?.action === "set_automation_target") {
        const target = typeof body.target === "string" ? body.target : "leads";
        const validTargets = ["leads", "orders", "both"];
        
        if (!validTargets.includes(target)) {
          return new Response(
            JSON.stringify({ error: "Invalid target. Must be 'leads', 'orders', or 'both'" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        await supabase
          .from("admin_settings")
          .upsert({
            key: "automation_target",
            value: target,
            updated_at: new Date().toISOString(),
          }, { onConflict: "key" });

        console.log(`Automation target set to ${target}`);

        return new Response(
          JSON.stringify({ success: true, target }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Batch trigger automation for multiple leads
      if (body?.action === "batch_trigger_automation") {
        const leadIds = Array.isArray(body.leadIds) ? body.leadIds : [];

        if (leadIds.length === 0) {
          return new Response(
            JSON.stringify({ error: "No lead IDs provided" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        let triggered = 0;
        let skipped = 0;
        const errors: { leadId: string; error: string }[] = [];

        for (const leadId of leadIds) {
          try {
            // Check if lead is eligible
            const { data: lead, error: leadError } = await supabase
              .from("leads")
              .select("id, automation_status, full_song_url, status")
              .eq("id", leadId)
              .single();

            if (leadError || !lead) {
              errors.push({ leadId, error: "Lead not found" });
              continue;
            }

            if (lead.status === "converted" || lead.full_song_url || lead.automation_status) {
              skipped++;
              continue;
            }

            // Trigger automation
            const response = await fetch(`${supabaseUrl}/functions/v1/automation-trigger`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${supabaseServiceKey}`,
              },
              body: JSON.stringify({ leadId, forceRun: true }),
            });

            if (response.ok) {
              triggered++;
            } else {
              const errText = await response.text();
              errors.push({ leadId, error: errText });
            }
          } catch (err) {
            errors.push({ leadId, error: err instanceof Error ? err.message : "Unknown error" });
          }
        }

        console.log(`Batch automation: triggered=${triggered}, skipped=${skipped}, errors=${errors.length}`);

        return new Response(
          JSON.stringify({ triggered, skipped, errors }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Retry automation for a failed lead
      if (body?.action === "retry_automation") {
        const leadId = typeof body.leadId === "string" ? body.leadId : null;

        if (!leadId) {
          return new Response(
            JSON.stringify({ error: "Lead ID required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Reset automation status and trigger
        await supabase
          .from("leads")
          .update({
            automation_status: null,
            automation_last_error: null,
            automation_started_at: null,
            automation_task_id: null,
          })
          .eq("id", leadId);

        // Trigger automation
        const response = await fetch(`${supabaseUrl}/functions/v1/automation-trigger`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({ leadId, forceRun: true }),
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(errText);
        }

        console.log(`Automation retry triggered for lead ${leadId}`);

        return new Response(
          JSON.stringify({ success: true }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Cancel automation for a lead
      if (body?.action === "cancel_automation") {
        const leadId = typeof body.leadId === "string" ? body.leadId : null;

        if (!leadId) {
          return new Response(
            JSON.stringify({ error: "Lead ID required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        await supabase
          .from("leads")
          .update({
            automation_status: null,
            automation_last_error: "Cancelled by admin",
            automation_manual_override_at: new Date().toISOString(),
          })
          .eq("id", leadId);

        console.log(`Automation cancelled for lead ${leadId}`);

        return new Response(
          JSON.stringify({ success: true }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Manually recover audio for a stuck lead - re-invokes the callback handler
      if (body?.action === "recover_audio") {
        const leadId = typeof body.leadId === "string" ? body.leadId : null;

        if (!leadId) {
          return new Response(
            JSON.stringify({ error: "Lead ID required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Fetch lead to get taskId
        const { data: lead, error: leadError } = await supabase
          .from("leads")
          .select("id, automation_task_id, automation_status")
          .eq("id", leadId)
          .single();

        if (leadError || !lead) {
          return new Response(
            JSON.stringify({ error: "Lead not found" }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        if (!lead.automation_task_id) {
          return new Response(
            JSON.stringify({ error: "No automation task ID found for this lead" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        if (lead.automation_status !== "audio_generating") {
          return new Response(
            JSON.stringify({ error: `Lead is not in audio_generating state (current: ${lead.automation_status})` }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        console.log(`[RECOVER] Manual recovery triggered for lead ${leadId}, taskId=${lead.automation_task_id}`);

        // Re-invoke the callback handler (same as scheduled recovery)
        const recoveryResp = await fetch(
          `${supabaseUrl}/functions/v1/automation-suno-callback`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${supabaseServiceKey}`,
            },
            body: JSON.stringify({
              taskId: lead.automation_task_id,
              data: { task_id: lead.automation_task_id },
            }),
          }
        );

        const recoveryBody = await recoveryResp.text();
        console.log(`[RECOVER] automation-suno-callback response: ${recoveryResp.status} ${recoveryBody.substring(0, 300)}`);

        return new Response(
          JSON.stringify({ success: true, status: recoveryResp.status, response: recoveryBody.substring(0, 200) }),
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

      // Update lead dismissal status
      if (body?.action === "update_lead_dismissal") {
        const leadId = typeof body.leadId === "string" ? body.leadId : null;
        const dismissed = body.dismissed === true;

        if (!leadId) {
          return new Response(
            JSON.stringify({ error: "Lead ID required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { data: updatedLead, error: updateError } = await supabase
          .from("leads")
          .update({
            dismissed_at: dismissed ? new Date().toISOString() : null,
          })
          .eq("id", leadId)
          .select("*")
          .single();

        if (updateError) {
          console.error("Failed to update lead dismissal:", updateError);
          throw updateError;
        }

        return new Response(
          JSON.stringify({ lead: updatedLead }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Update order dismissal/cancellation status
      if (body?.action === "update_order_dismissal") {
        const orderId = typeof body.orderId === "string" ? body.orderId : null;
        const dismissed = body.dismissed === true;

        if (!orderId) {
          return new Response(
            JSON.stringify({ error: "Order ID required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // When dismissing: set dismissed_at, change status to cancelled, block automation
        // When restoring: clear dismissed_at, restore status to paid
        const updates: Record<string, unknown> = {
          dismissed_at: dismissed ? new Date().toISOString() : null,
          status: dismissed ? "cancelled" : "paid",
        };

        if (dismissed) {
          // Block any in-progress automation from completing
          updates.automation_manual_override_at = new Date().toISOString();
          updates.automation_status = null;
          updates.automation_last_error = "Cancelled by admin";
        }

        const { data: updatedOrder, error: updateError } = await supabase
          .from("orders")
          .update(updates)
          .eq("id", orderId)
          .select("*")
          .single();

        if (updateError) {
          console.error("Failed to update order dismissal:", updateError);
          throw updateError;
        }

        console.log(`Order ${orderId} ${dismissed ? "cancelled" : "restored"}`);

        return new Response(
          JSON.stringify({ order: updatedOrder }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Update order fields (editable fields)
      if (body?.action === "update_order_fields") {
        const orderId = typeof body.orderId === "string" ? body.orderId : null;
        const updates = body.updates as Record<string, unknown> || {};

        if (!orderId) {
          return new Response(
            JSON.stringify({ error: "Order ID required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Whitelist allowed fields
        const allowedFields = [
          "customer_name", "customer_email", "customer_phone",
          "recipient_name", "recipient_name_pronunciation",
          "occasion", "genre", "singer_preference",
          "special_qualities", "favorite_memory",
          "special_message", "notes",
          "customer_email_override", "customer_email_cc"
        ];

        const safeUpdates: Record<string, unknown> = {};
        for (const field of allowedFields) {
          if (updates[field] !== undefined) {
            safeUpdates[field] = updates[field];
          }
        }

        if (Object.keys(safeUpdates).length === 0) {
          return new Response(
            JSON.stringify({ error: "No valid fields to update" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Basic email validation if email is being updated
        if (safeUpdates.customer_email && typeof safeUpdates.customer_email === "string") {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(safeUpdates.customer_email)) {
            return new Response(
              JSON.stringify({ error: "Invalid email format" }),
              { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }

        const { data: order, error: updateError } = await supabase
          .from("orders")
          .update(safeUpdates)
          .eq("id", orderId)
          .select("*")
          .single();

        if (updateError) {
          console.error("Failed to update order fields:", updateError);
          throw updateError;
        }

        return new Response(
          JSON.stringify({ order }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Update lead fields (editable fields)
      if (body?.action === "update_lead_fields") {
        const leadId = typeof body.leadId === "string" ? body.leadId : null;
        const updates = body.updates as Record<string, unknown> || {};

        if (!leadId) {
          return new Response(
            JSON.stringify({ error: "Lead ID required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Whitelist allowed fields
        const allowedFields = [
          "customer_name", "email", "phone",
          "recipient_name", "recipient_name_pronunciation",
          "occasion", "genre", "singer_preference",
          "special_qualities", "favorite_memory",
          "special_message",
          "lead_email_override", "lead_email_cc"
        ];

        const safeUpdates: Record<string, unknown> = {};
        for (const field of allowedFields) {
          if (updates[field] !== undefined) {
            safeUpdates[field] = updates[field];
          }
        }

        if (Object.keys(safeUpdates).length === 0) {
          return new Response(
            JSON.stringify({ error: "No valid fields to update" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Basic email validation if email is being updated
        if (safeUpdates.email && typeof safeUpdates.email === "string") {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(safeUpdates.email)) {
            return new Response(
              JSON.stringify({ error: "Invalid email format" }),
              { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }

        const { data: lead, error: updateError } = await supabase
          .from("leads")
          .update(safeUpdates)
          .eq("id", leadId)
          .select("*")
          .single();

        if (updateError) {
          console.error("Failed to update lead fields:", updateError);
          throw updateError;
        }

        return new Response(
          JSON.stringify({ lead }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Convert lead to order (for failed webhook cases)
      if (body?.action === "convert_lead_to_order") {
        const leadId = typeof body.leadId === "string" ? body.leadId : null;
        const price = typeof body.price === "number" ? body.price : 49; // Default to $49

        if (!leadId) {
          return new Response(
            JSON.stringify({ error: "Lead ID required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Get the lead
        const { data: lead, error: leadError } = await supabase
          .from("leads")
          .select("*")
          .eq("id", leadId)
          .single();

        if (leadError || !lead) {
          return new Response(
            JSON.stringify({ error: "Lead not found" }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Check if already converted
        if (lead.status === "converted") {
          return new Response(
            JSON.stringify({ error: "Lead already converted", orderId: lead.order_id }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Create new order from lead data
        const orderData = {
          customer_name: lead.customer_name,
          customer_email: lead.email,
          customer_phone: lead.phone,
          recipient_name: lead.recipient_name,
          recipient_type: lead.recipient_type,
          occasion: lead.occasion,
          genre: lead.genre,
          singer_preference: lead.singer_preference,
          special_qualities: lead.special_qualities,
          favorite_memory: lead.favorite_memory,
          special_message: lead.special_message,
          song_url: lead.full_song_url,
          song_title: lead.song_title,
          cover_image_url: lead.cover_image_url,
          price: price,
          pricing_tier: price >= 79 ? "priority" : "standard",
          status: lead.full_song_url ? "completed" : "paid",
          notes: "Manual conversion from lead (webhook failure)",
          device_type: "Manual Conversion",
          utm_source: lead.utm_source,
          utm_medium: lead.utm_medium,
          utm_campaign: lead.utm_campaign,
          utm_content: lead.utm_content,
          utm_term: lead.utm_term,
        };

        const { data: order, error: orderError } = await supabase
          .from("orders")
          .insert(orderData)
          .select("*")
          .single();

        if (orderError) {
          console.error("Failed to create order from lead:", orderError);
          throw orderError;
        }

        // Mark lead as converted
        const { error: updateLeadError } = await supabase
          .from("leads")
          .update({
            status: "converted",
            converted_at: new Date().toISOString(),
            order_id: order.id,
          })
          .eq("id", leadId);

        if (updateLeadError) {
          console.error("Failed to mark lead as converted:", updateLeadError);
          // Still return success since order was created
        }

        console.log(`Lead ${leadId} converted to order ${order.id}`);

        return new Response(
          JSON.stringify({ success: true, order }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Resend delivery email for an already-delivered order
      if (body?.action === "resend_delivery_email") {
        const orderId = typeof body.orderId === "string" ? body.orderId : null;

        if (!orderId) {
          return new Response(
            JSON.stringify({ error: "Order ID required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Get order details
        const { data: order, error: orderError } = await supabase
          .from("orders")
          .select("*")
          .eq("id", orderId)
          .single();

        if (orderError || !order) {
          return new Response(
            JSON.stringify({ error: "Order not found" }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        if (!order.song_url) {
          return new Response(
            JSON.stringify({ error: "No song uploaded for this order" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Compute effective email recipients
        const effectiveEmail = (order.customer_email_override?.trim() || order.customer_email).toLowerCase();
        const ccEmail = order.customer_email_cc?.trim()?.toLowerCase();
        const recipients = [effectiveEmail];
        if (ccEmail && ccEmail !== effectiveEmail) {
          recipients.push(ccEmail);
        }

        // Send the delivery email
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
                customerEmail: effectiveEmail,
                customerName: order.customer_name,
                recipientName: order.recipient_name,
                occasion: order.occasion,
                songUrl: order.song_url,
                ccEmail: ccEmail !== effectiveEmail ? ccEmail : null,
              }),
            }
          );

          if (!emailResponse.ok) {
            const errText = await emailResponse.text();
            console.error("Failed to resend delivery email:", errText);
            throw new Error("Failed to send email");
          }

          // Update sent_to_emails for idempotency tracking
          const existingSentTo = (order.sent_to_emails as string[] | null) || [];
          const newSentTo = [...new Set([...existingSentTo, ...recipients])];
          await supabase
            .from("orders")
            .update({ sent_to_emails: newSentTo })
            .eq("id", orderId);

          return new Response(
            JSON.stringify({ success: true, message: `Delivery email resent to ${recipients.join(", ")}` }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        } catch (emailError) {
          console.error("Email error:", emailError);
          return new Response(
            JSON.stringify({ error: "Failed to send delivery email" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      // Schedule resend delivery for an already-delivered order
      if (body?.action === "schedule_resend_delivery") {
        const orderId = typeof body.orderId === "string" ? body.orderId : null;
        const resendScheduledAtRaw =
          body.resendScheduledAt === null
            ? null
            : typeof body.resendScheduledAt === "string"
              ? body.resendScheduledAt
              : null;

        if (!orderId) {
          return new Response(
            JSON.stringify({ error: "Order ID required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Get order details
        const { data: order, error: orderError } = await supabase
          .from("orders")
          .select("id, status, song_url")
          .eq("id", orderId)
          .single();

        if (orderError || !order) {
          return new Response(
            JSON.stringify({ error: "Order not found" }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        if (order.status !== "delivered") {
          return new Response(
            JSON.stringify({ error: "Order must be delivered to schedule a resend" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        if (!order.song_url) {
          return new Response(
            JSON.stringify({ error: "No song uploaded for this order" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Validate scheduled time if provided
        if (resendScheduledAtRaw) {
          const dt = new Date(resendScheduledAtRaw);
          if (Number.isNaN(dt.getTime())) {
            return new Response(
              JSON.stringify({ error: "Invalid resendScheduledAt" }),
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

        // Update the order with scheduled resend time
        const { data: updatedOrder, error: updateError } = await supabase
          .from("orders")
          .update({
            resend_scheduled_at: resendScheduledAtRaw,
          })
          .eq("id", orderId)
          .select("*")
          .single();

        if (updateError) {
          console.error("Failed to schedule resend:", updateError);
          throw updateError;
        }

        const message = resendScheduledAtRaw
          ? `Resend scheduled for ${new Date(resendScheduledAtRaw).toLocaleString("en-US", {
              timeZone: "America/Los_Angeles",
              weekday: "short",
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
              hour12: true,
            })} PST`
          : "Scheduled resend cancelled";

        return new Response(
          JSON.stringify({ order: updatedOrder, message }),
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

    // Regenerate song for orders or leads (pronunciation fixes)
    if (body?.action === "regenerate_song") {
      const orderId = typeof body.orderId === "string" ? body.orderId : null;
      const leadId = typeof body.leadId === "string" ? body.leadId : null;
      const sendOption = typeof body.sendOption === "string" ? body.sendOption : "auto";
      const scheduledAt = typeof body.scheduledAt === "string" ? body.scheduledAt : null;

      console.log(`[REGENERATE] Received request - orderId: ${orderId}, leadId: ${leadId}, sendOption: ${sendOption}`);

      if (!orderId && !leadId) {
        return new Response(
          JSON.stringify({ error: "Order ID or Lead ID required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const entityType = orderId ? "orders" : "leads";
      const entityId = orderId || leadId;
      
      console.log(`[REGENERATE] Looking up ${entityType} with id: ${entityId}`);

      // Fetch entity to verify it exists
      const { data: entity, error: fetchError } = await supabase
        .from(entityType)
        .select("*")
        .eq("id", entityId)
        .maybeSingle();

      if (fetchError) {
        // PGRST116 is the common "0 rows" response from single-object coercion.
        // Treat it as not-found instead of a 500.
        if ((fetchError as { code?: string })?.code === "PGRST116") {
          return new Response(
            JSON.stringify({ error: "Order/Lead not found", entityType, entityId }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        console.error("Fetch entity error:", fetchError);
        throw fetchError;
      }

      if (!entity) {
        return new Response(
          JSON.stringify({ error: `${entityType === "orders" ? "Order" : "Lead"} not found`, entityId }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Clear generation artifacts but preserve identity and inputs
      const clearUpdates: Record<string, unknown> = {
        automation_status: null,
        automation_task_id: null,
        automation_lyrics: null,
        automation_started_at: null,
        automation_retry_count: 0,
        automation_last_error: null,
        automation_raw_callback: null,
        automation_style_id: null,
        automation_audio_url_source: null,
        generated_at: null,
        inputs_hash: null,
        next_attempt_at: null,
        automation_manual_override_at: null,
      };

      // Entity-specific clears
      if (entityType === "orders") {
        clearUpdates.song_url = null;
        clearUpdates.song_title = null;
        clearUpdates.cover_image_url = null;
        clearUpdates.sent_at = null;
        clearUpdates.delivery_status = "pending";
      } else {
        clearUpdates.preview_song_url = null;
        clearUpdates.full_song_url = null;
        clearUpdates.song_title = null;
        clearUpdates.cover_image_url = null;
        clearUpdates.preview_sent_at = null;
        clearUpdates.preview_token = null;
      }

      // Compute target_send_at based on sendOption
      const now = Date.now();
      let targetSendAt: string;

      switch (sendOption) {
        case "immediate":
          targetSendAt = new Date(now + 5 * 60 * 1000).toISOString();
          break;
        case "scheduled":
          targetSendAt = scheduledAt || new Date(now + 12 * 60 * 60 * 1000).toISOString();
          break;
        case "auto":
        default:
          targetSendAt = new Date(now + 12 * 60 * 60 * 1000).toISOString();
      }

      clearUpdates.target_send_at = targetSendAt;
      clearUpdates.earliest_generate_at = new Date(now + 1 * 60 * 1000).toISOString(); // 1 min from now

      // Update entity
      const { error: updateError } = await supabase
        .from(entityType)
        .update(clearUpdates)
        .eq("id", entityId);

      if (updateError) {
        console.error("Failed to clear entity for regeneration:", updateError);
        throw updateError;
      }

      console.log(`[ADMIN] Regenerate song initiated for ${entityType} ${entityId}, sendOption=${sendOption}, targetSendAt=${targetSendAt}`);

      // Trigger automation with forceRun=true
      try {
        const triggerBody = orderId 
          ? { orderId, forceRun: true }
          : { leadId, forceRun: true };

        await fetch(`${supabaseUrl}/functions/v1/automation-trigger`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify(triggerBody),
        });
      } catch (triggerError) {
        console.error("Failed to trigger automation:", triggerError);
        // Don't fail the request - the cron job will pick it up
      }

      return new Response(
        JSON.stringify({ success: true, targetSendAt }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Reset automation (allows re-generation)
    if (body?.action === "reset_automation") {
      const orderId = typeof body.orderId === "string" ? body.orderId : null;
      const leadId = typeof body.leadId === "string" ? body.leadId : null;
      const clearAssets = body.clearAssets === true; // For "Reset + Regenerate"

      if (!orderId && !leadId) {
        return new Response(
          JSON.stringify({ error: "Order ID or Lead ID required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const entityType = orderId ? "orders" : "leads";
      const entityId = orderId || leadId;

      // Base reset fields (always cleared)
      const updates: Record<string, unknown> = {
        automation_status: null,
        automation_task_id: null,
        automation_lyrics: null,
        automation_started_at: null,
        automation_retry_count: 0,
        automation_last_error: null,
        automation_raw_callback: null,
        automation_style_id: null,
        automation_audio_url_source: null,
        generated_at: null,
        inputs_hash: null,
        next_attempt_at: null,
        automation_manual_override_at: null, // Re-enable automation
      };

      // If clearAssets=true, also wipe the song
      if (clearAssets) {
        if (entityType === "orders") {
          updates.song_url = null;
          updates.song_title = null;
          updates.cover_image_url = null;
          updates.sent_at = null;
          updates.delivery_status = "pending";
          updates.status = "paid"; // Reset to paid status
        } else {
          updates.preview_song_url = null;
          updates.full_song_url = null;
          updates.song_title = null;
          updates.cover_image_url = null;
          updates.preview_sent_at = null;
          updates.preview_token = null;
          updates.status = "lead"; // Reset to initial status
        }
      }

      const { error: updateError } = await supabase
        .from(entityType)
        .update(updates)
        .eq("id", entityId);

      if (updateError) {
        console.error("Failed to reset automation:", updateError);
        throw updateError;
      }

      console.log(`[ADMIN] Automation reset for ${entityType} ${entityId}, clearAssets=${clearAssets}`);

      return new Response(
        JSON.stringify({ success: true, mode: clearAssets ? "full_reset" : "preserve_song" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get alerts summary for dashboard banner
    if (body?.action === "get_alerts_summary") {
      const now = new Date().toISOString();
      const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();

      // Stuck orders (audio_generating > 15 min)
      const { count: stuckOrders } = await supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("automation_status", "audio_generating")
        .lt("automation_started_at", fifteenMinAgo)
        .is("dismissed_at", null);

      // Failed orders
      const { count: failedOrders } = await supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .in("automation_status", ["failed", "permanently_failed"])
        .is("dismissed_at", null);

      // Overdue orders (completed but not sent, target_send_at passed)
      const { count: overdueOrders } = await supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("automation_status", "completed")
        .lte("target_send_at", now)
        .is("sent_at", null)
        .is("dismissed_at", null);

      // Needs review orders (inputs changed or delivery issues)
      const { count: needsReviewOrders } = await supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("delivery_status", "needs_review")
        .is("dismissed_at", null);

      // Delivery failed orders
      const { count: deliveryFailedOrders } = await supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("delivery_status", "failed")
        .is("dismissed_at", null);

      // Stuck leads
      const { count: stuckLeads } = await supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("automation_status", "audio_generating")
        .lt("automation_started_at", fifteenMinAgo)
        .is("dismissed_at", null);

      // Failed leads
      const { count: failedLeads } = await supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .in("automation_status", ["failed", "permanently_failed"])
        .is("dismissed_at", null);

      // Overdue lead previews (song_ready but not sent, target_send_at passed)
      const { count: overdueLeads } = await supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("status", "song_ready")
        .lte("target_send_at", now)
        .is("preview_sent_at", null)
        .is("dismissed_at", null);

      const alerts = {
        stuckOrders: stuckOrders || 0,
        failedOrders: failedOrders || 0,
        overdueOrders: overdueOrders || 0,
        needsReviewOrders: needsReviewOrders || 0,
        deliveryFailedOrders: deliveryFailedOrders || 0,
        stuckLeads: stuckLeads || 0,
        failedLeads: failedLeads || 0,
        overdueLeads: overdueLeads || 0,
      };

      const total = Object.values(alerts).reduce((sum, count) => sum + count, 0);

      return new Response(
        JSON.stringify({ alerts, total }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Admin orders error:", error);

    // Improve error payload for debugging (without leaking secrets)
    const errObj = (error && typeof error === "object") ? (error as Record<string, unknown>) : null;
    const message = error instanceof Error
      ? error.message
      : (typeof errObj?.message === "string" ? (errObj.message as string) : "Server error");

    const code = typeof errObj?.code === "string" ? (errObj.code as string) : undefined;
    const details = typeof errObj?.details === "string" ? (errObj.details as string) : undefined;
    return new Response(
      JSON.stringify({ error: message, ...(code ? { code } : {}), ...(details ? { details } : {}) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
