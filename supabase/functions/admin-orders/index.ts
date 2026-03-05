// Build: 2026-02-27T18:00 force-redeploy-v2
import { createClient } from "npm:@supabase/supabase-js@2.93.1";
import { computeInputsHash } from "../_shared/hash-utils.ts";
import { logActivity } from "../_shared/activity-log.ts";

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
      
      const orderColumns = "id, created_at, status, pricing_tier, price, price_cents, customer_name, customer_email, customer_email_cc, customer_email_override, customer_phone, recipient_name, recipient_name_pronunciation, recipient_type, occasion, genre, singer_preference, special_qualities, favorite_memory, special_message, song_url, song_title, cover_image_url, notes, device_type, expected_delivery, delivered_at, sent_at, sent_to_emails, reaction_video_url, reaction_submitted_at, utm_source, utm_medium, utm_campaign, utm_content, utm_term, automation_status, automation_started_at, automation_retry_count, automation_last_error, automation_task_id, automation_style_id, earliest_generate_at, target_send_at, generated_at, next_attempt_at, inputs_hash, delivery_status, delivery_last_error, delivery_retry_count, source, lyrics_language_code, phone_e164, sms_opt_in, sms_sent_at, sms_scheduled_for, sms_status, sms_last_error, timezone, lyrics_unlocked_at, lyrics_price_cents, scheduled_delivery_at, song_played_at, song_play_count, song_downloaded_at, song_download_count, unplayed_resend_sent_at, resend_scheduled_at, revision_token, revision_count, max_revisions, revision_requested_at, pending_revision, revision_status, revision_reason, sender_context, prev_song_url, billing_country_code, billing_country_name, dismissed_at, automation_manual_override_at";
      let query = supabase
        .from("orders")
        .select(orderColumns)
        .order("created_at", { ascending: false });

      if (status && status !== "all") {
        query = query.eq("status", status);
      }

      const { data: orders, error } = await query.limit(1000);

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
        const page = typeof body.page === "number" ? body.page : 0;
        const pageSize = typeof body.pageSize === "number" ? body.pageSize : 200;
        const rangeStart = page * pageSize;
        const rangeEnd = rangeStart + pageSize - 1;

        // Fetch paginated orders (lean columns — excludes heavy text blobs)
        const orderColumns = "id, created_at, status, pricing_tier, price, price_cents, customer_name, customer_email, customer_email_cc, customer_email_override, customer_phone, recipient_name, recipient_name_pronunciation, recipient_type, occasion, genre, singer_preference, special_qualities, favorite_memory, special_message, song_url, song_title, cover_image_url, notes, device_type, expected_delivery, delivered_at, sent_at, sent_to_emails, reaction_video_url, reaction_submitted_at, utm_source, utm_medium, utm_campaign, utm_content, utm_term, automation_status, automation_started_at, automation_retry_count, automation_last_error, automation_task_id, automation_style_id, earliest_generate_at, target_send_at, generated_at, next_attempt_at, inputs_hash, delivery_status, delivery_last_error, delivery_retry_count, source, lyrics_language_code, phone_e164, sms_opt_in, sms_sent_at, sms_scheduled_for, sms_status, sms_last_error, timezone, lyrics_unlocked_at, lyrics_price_cents, scheduled_delivery_at, song_played_at, song_play_count, song_downloaded_at, song_download_count, unplayed_resend_sent_at, resend_scheduled_at, revision_token, revision_count, max_revisions, revision_requested_at, pending_revision, revision_status, revision_reason, sender_context, prev_song_url, billing_country_code, billing_country_name, dismissed_at, automation_manual_override_at";
        let orderQuery = supabase
          .from("orders")
          .select(orderColumns)
          .order("created_at", { ascending: false })
          .range(rangeStart, rangeEnd);
        if (status && status !== "all") {
          orderQuery = orderQuery.eq("status", status);
        }
        const { data: orders, error: orderErr } = await orderQuery;
        if (orderErr) throw orderErr;

        // Fetch paginated leads
        const { data: leads, error: leadErr } = await supabase
          .from("leads")
          .select("id, email, phone, customer_name, recipient_name, recipient_type, recipient_name_pronunciation, occasion, genre, singer_preference, special_qualities, favorite_memory, special_message, status, captured_at, converted_at, order_id, quality_score, preview_song_url, full_song_url, song_title, cover_image_url, preview_token, preview_sent_at, preview_opened_at, preview_played_at, preview_play_count, preview_scheduled_at, follow_up_sent_at, dismissed_at, utm_source, utm_medium, utm_campaign, automation_status, automation_started_at, automation_retry_count, automation_last_error, automation_task_id, automation_style_id, earliest_generate_at, target_send_at, generated_at, sent_at, lead_email_override, lead_email_cc, preview_sent_to_emails, sms_opt_in, sms_sent_at, sms_scheduled_for, phone_e164, sms_status, lyrics_language_code, inputs_hash, prev_song_url")
          .order("captured_at", { ascending: false })
          .range(rangeStart, rangeEnd);
        if (leadErr) {
          console.error("Failed to fetch leads page:", leadErr);
        }

        // Get total counts (head-only queries, no data loaded)
        let orderCountQuery = supabase
          .from("orders")
          .select("id", { count: "exact", head: true });
        if (status && status !== "all") {
          orderCountQuery = orderCountQuery.eq("status", status);
        }
        const { count: totalOrders } = await orderCountQuery;

        const { count: totalLeads } = await supabase
          .from("leads")
          .select("id", { count: "exact", head: true });

        console.log(`[ADMIN] Returning page ${page}: ${(orders || []).length} orders, ${(leads || []).length} leads (total: ${totalOrders} orders, ${totalLeads} leads)`);

        return new Response(
          JSON.stringify({
            orders: orders || [],
            leads: leads || [],
            totalOrders: totalOrders || 0,
            totalLeads: totalLeads || 0,
            page,
            pageSize,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // CS Assistant: lookup customer by email, name, order ID, preview token, or song URL fragment
      if (body?.action === "cs_lookup") {
        let search = (typeof body.search === "string" ? body.search.trim() : "") || (typeof body.email === "string" ? body.email.trim() : "");
        if (!search) {
          return new Response(
            JSON.stringify({ error: "search term required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Extract token/path fragment from URLs like personalsonggifts.com/preview/TOKEN or /song/SHORTID
        const urlMatch = search.match(/\/(?:preview|song)\/([A-Za-z0-9_-]+)/);
        if (urlMatch) {
          search = urlMatch[1];
        }

        // Check if search looks like a preview token (non-UUID, alphanumeric, 10+ chars)
        const isTokenLike = /^[A-Za-z0-9_-]{10,}$/.test(search) && !/^[0-9a-f]{8}$/i.test(search);
        // Check if search looks like a short order ID (8 hex chars)
        const isShortId = /^[0-9a-fA-F]{6,8}$/.test(search);

        let orders: any[] = [];
        let leads: any[] = [];

        // Lean column sets (same as list action — excludes heavy blobs like automation_raw_callback, automation_lyrics, lyrics_raw_attempt_*)
        const csOrderColumns = "id, created_at, status, pricing_tier, price, price_cents, customer_name, customer_email, customer_email_cc, customer_email_override, customer_phone, recipient_name, recipient_name_pronunciation, recipient_type, occasion, genre, singer_preference, special_qualities, favorite_memory, special_message, song_url, song_title, cover_image_url, notes, device_type, expected_delivery, delivered_at, sent_at, sent_to_emails, reaction_video_url, reaction_submitted_at, utm_source, utm_medium, utm_campaign, utm_content, utm_term, automation_status, automation_started_at, automation_retry_count, automation_last_error, automation_task_id, automation_style_id, earliest_generate_at, target_send_at, generated_at, next_attempt_at, inputs_hash, delivery_status, delivery_last_error, delivery_retry_count, source, lyrics_language_code, phone_e164, sms_opt_in, sms_sent_at, sms_scheduled_for, sms_status, sms_last_error, timezone, lyrics_unlocked_at, lyrics_price_cents, scheduled_delivery_at, song_played_at, song_play_count, song_downloaded_at, song_download_count, unplayed_resend_sent_at, resend_scheduled_at, revision_token, revision_count, max_revisions, revision_requested_at, pending_revision, revision_status, revision_reason, sender_context, prev_song_url, billing_country_code, billing_country_name, dismissed_at, automation_manual_override_at";
        const csLeadColumns = "id, email, phone, customer_name, recipient_name, recipient_type, recipient_name_pronunciation, occasion, genre, singer_preference, special_qualities, favorite_memory, special_message, status, captured_at, converted_at, order_id, quality_score, preview_song_url, full_song_url, song_title, cover_image_url, preview_token, preview_sent_at, preview_opened_at, preview_played_at, preview_play_count, preview_scheduled_at, follow_up_sent_at, dismissed_at, utm_source, utm_medium, utm_campaign, automation_status, automation_started_at, automation_retry_count, automation_last_error, automation_task_id, automation_style_id, earliest_generate_at, target_send_at, generated_at, sent_at, lead_email_override, lead_email_cc, preview_sent_to_emails, sms_opt_in, sms_sent_at, sms_scheduled_for, phone_e164, sms_status, lyrics_language_code, inputs_hash, prev_song_url";

        if (isTokenLike) {
          // Search by preview_token on leads
          const { data: tokenLeads, error: tokenErr } = await supabase
            .from("leads")
            .select(csLeadColumns)
            .eq("preview_token", search)
            .limit(10);
          if (tokenErr) throw tokenErr;
          leads = tokenLeads || [];

          // Also check song_url on orders (song URL contains the order ID in the path)
          const { data: songOrders, error: songErr } = await supabase
            .from("orders")
            .select(csOrderColumns)
            .ilike("song_url", `%${search}%`)
            .limit(10);
          if (songErr) throw songErr;
          orders = songOrders || [];
        } else if (isShortId) {
          // Search by short order ID prefix
          const { data: idOrders, error: idErr } = await supabase
            .from("orders")
            .select(csOrderColumns)
            .ilike("id", `${search}%`)
            .order("created_at", { ascending: false })
            .limit(10);
          if (idErr) throw idErr;
          orders = idOrders || [];

          // Also do standard name/email search
          const { data: nameOrders, error: nameErr } = await supabase
            .from("orders")
            .select(csOrderColumns)
            .or(`customer_email.ilike.%${search}%,customer_name.ilike.%${search}%,recipient_name.ilike.%${search}%`)
            .order("created_at", { ascending: false })
            .limit(50);
          if (nameErr) throw nameErr;

          // Merge without duplicates
          const existingIds = new Set(orders.map((o: any) => o.id));
          for (const o of (nameOrders || [])) {
            if (!existingIds.has(o.id)) orders.push(o);
          }

          const { data: nameLeads, error: leadErr } = await supabase
            .from("leads")
            .select(csLeadColumns)
            .or(`email.ilike.%${search}%,customer_name.ilike.%${search}%,recipient_name.ilike.%${search}%`)
            .order("captured_at", { ascending: false })
            .limit(50);
          if (leadErr) throw leadErr;
          leads = nameLeads || [];
        } else {
          // Standard email/name search
          const { data: stdOrders, error: orderErr } = await supabase
            .from("orders")
            .select(csOrderColumns)
            .or(`customer_email.ilike.%${search}%,customer_name.ilike.%${search}%,recipient_name.ilike.%${search}%`)
            .order("created_at", { ascending: false })
            .limit(50);
          if (orderErr) throw orderErr;
          orders = stdOrders || [];

          const { data: stdLeads, error: leadErr } = await supabase
            .from("leads")
            .select(csLeadColumns)
            .or(`email.ilike.%${search}%,customer_name.ilike.%${search}%,recipient_name.ilike.%${search}%`)
            .order("captured_at", { ascending: false })
            .limit(50);
          if (leadErr) throw leadErr;
          leads = stdLeads || [];
        }

        return new Response(
          JSON.stringify({ orders, leads }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get activity log for an entity
      if (body?.action === "get_activity_log") {
        const entityId = typeof body.entityId === "string" ? body.entityId : null;
        if (!entityId) {
          return new Response(
            JSON.stringify({ error: "entityId required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { data: events, error: logError } = await supabase
          .from("order_activity_log")
          .select("id, event_type, actor, details, metadata, created_at")
          .eq("entity_id", entityId)
          .order("created_at", { ascending: false })
          .limit(100);

        if (logError) {
          console.error("Failed to fetch activity log:", logError);
          throw logError;
        }

        return new Response(
          JSON.stringify({ events: events || [] }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get full order detail (includes heavy columns like automation_lyrics)
      if (body?.action === "get_order_detail") {
        const orderId = typeof body.orderId === "string" ? body.orderId : null;
        if (!orderId) {
          return new Response(
            JSON.stringify({ error: "orderId required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { data: order, error: orderErr } = await supabase
          .from("orders")
          .select("*")
          .eq("id", orderId)
          .maybeSingle();

        if (orderErr) throw orderErr;
        if (!order) {
          return new Response(
            JSON.stringify({ error: "Order not found" }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({ order }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get full lead detail (includes heavy columns like automation_lyrics)
      if (body?.action === "get_lead_detail") {
        const leadId = typeof body.leadId === "string" ? body.leadId : null;
        if (!leadId) {
          return new Response(
            JSON.stringify({ error: "leadId required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { data: lead, error: leadErr } = await supabase
          .from("leads")
          .select("*")
          .eq("id", leadId)
          .maybeSingle();

        if (leadErr) throw leadErr;
        if (!lead) {
          return new Response(
            JSON.stringify({ error: "Lead not found" }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({ lead }),
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
        const orderId = typeof body.orderId === "string" ? body.orderId : null;

        if (!leadId && !orderId) {
          return new Response(
            JSON.stringify({ error: "Lead ID or Order ID required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        if (leadId && orderId) {
          return new Response(
            JSON.stringify({ error: "Provide either leadId or orderId, not both" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const table = orderId ? "orders" : "leads";
        const id = orderId || leadId;

        await supabase
          .from(table)
          .update({
            automation_status: null,
            automation_last_error: "Cancelled by admin",
            automation_manual_override_at: new Date().toISOString(),
          })
          .eq("id", id);

        console.log(`Automation cancelled for ${table.slice(0, -1)} ${id}`);

        await logActivity(supabase, orderId ? "order" : "lead", id!, "automation_cancelled", "admin", "Cancelled by admin");

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

        await logActivity(supabase, "order", orderId!, dismissed ? "order_cancelled" : "order_restored", "admin");

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
          "customer_email_override", "customer_email_cc",
          "lyrics_language_code",
          "sms_opt_in",
          "delivery_status",
          "automation_lyrics",
          "cover_image_url",
          "song_title"
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

        // If lyrics_language_code is being changed, enforce automation guard
        const isLanguageChange = safeUpdates.lyrics_language_code !== undefined;
        if (isLanguageChange) {
          const { data: currentOrder, error: fetchErr } = await supabase
            .from("orders")
            .select("automation_status, automation_manual_override_at")
            .eq("id", orderId)
            .maybeSingle();

          if (fetchErr || !currentOrder) {
            return new Response(
              JSON.stringify({ error: "Order not found" }),
              { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }

          const IN_FLIGHT_STATUSES = ["pending", "queued", "lyrics_generating", "lyrics_ready", "audio_generating"];
          if (currentOrder.automation_status && IN_FLIGHT_STATUSES.includes(currentOrder.automation_status) && !currentOrder.automation_manual_override_at) {
            return new Response(
              JSON.stringify({ error: "Reset automation before changing language." }),
              { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }

        // If automation_lyrics is being edited, set manual override to prevent AI overwrite
        const isLyricsEdit = safeUpdates.automation_lyrics !== undefined;
        if (isLyricsEdit) {
          safeUpdates.automation_manual_override_at = new Date().toISOString();
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

        if (isLyricsEdit) {
          await logActivity(supabase, "order", orderId!, "lyrics_edited", "admin", `Lyrics manually edited`);
        } else {
          const changedFields = Object.keys(safeUpdates).filter(k => k !== "automation_manual_override_at");
          await logActivity(supabase, "order", orderId!, "fields_updated", "admin", `Updated: ${changedFields.join(", ")}`);
        }

        // If lyrics_language_code changed, recompute inputs_hash and handle delivery safety
        if (isLanguageChange) {
          const hashUpdates: Record<string, unknown> = {};

          // Recompute hash using canonical 8-field order list (matches stripe-webhook)
          const newHash = await computeInputsHash([
            order.recipient_name || "",
            order.recipient_name_pronunciation || "",
            order.special_qualities || "",
            order.favorite_memory || "",
            order.genre || "",
            order.occasion || "",
            order.singer_preference || "",
            order.lyrics_language_code || "en",
          ]);
          hashUpdates.inputs_hash = newHash;

          // If song already generated, block auto-send until regen
          if (order.automation_status === "completed") {
            hashUpdates.delivery_status = "needs_review";
          }

          await supabase
            .from("orders")
            .update(hashUpdates)
            .eq("id", orderId);

          console.log(`[ADMIN] Order ${orderId} language changed, hash recomputed, delivery_status=${hashUpdates.delivery_status || "unchanged"}`);
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
          "lead_email_override", "lead_email_cc",
          "lyrics_language_code",
          "automation_lyrics",
          "cover_image_url",
          "song_title"
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

        // If lyrics_language_code is being changed, enforce automation guard
        const isLanguageChange = safeUpdates.lyrics_language_code !== undefined;
        if (isLanguageChange) {
          const { data: currentLead, error: fetchErr } = await supabase
            .from("leads")
            .select("automation_status, automation_manual_override_at")
            .eq("id", leadId)
            .maybeSingle();

          if (fetchErr || !currentLead) {
            return new Response(
              JSON.stringify({ error: "Lead not found" }),
              { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }

          const IN_FLIGHT_STATUSES = ["pending", "queued", "lyrics_generating", "lyrics_ready", "audio_generating"];
          if (currentLead.automation_status && IN_FLIGHT_STATUSES.includes(currentLead.automation_status) && !currentLead.automation_manual_override_at) {
            return new Response(
              JSON.stringify({ error: "Reset automation before changing language." }),
              { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }

        // If automation_lyrics is being edited, set manual override to prevent AI overwrite
        const isLeadLyricsEdit = safeUpdates.automation_lyrics !== undefined;
        if (isLeadLyricsEdit) {
          safeUpdates.automation_manual_override_at = new Date().toISOString();
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

        if (isLeadLyricsEdit) {
          await logActivity(supabase, "lead", leadId!, "lyrics_edited", "admin", `Lyrics manually edited`);
        } else {
          const changedFields = Object.keys(safeUpdates).filter(k => k !== "automation_manual_override_at");
          await logActivity(supabase, "lead", leadId!, "fields_updated", "admin", `Updated: ${changedFields.join(", ")}`);
        }

        // If lyrics_language_code changed, recompute inputs_hash
        if (isLanguageChange) {
          const newHash = await computeInputsHash([
            lead.recipient_name || "",
            lead.special_qualities || "",
            lead.favorite_memory || "",
            lead.genre || "",
            lead.occasion || "",
            lead.lyrics_language_code || "en",
          ]);

          await supabase
            .from("leads")
            .update({ inputs_hash: newHash })
            .eq("id", leadId);

          console.log(`[ADMIN] Lead ${leadId} language changed, hash recomputed`);
        }

        return new Response(
          JSON.stringify({ lead }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Resend SMS for an order or lead
      if (body?.action === "resend_sms") {
        const orderId = typeof body.orderId === "string" ? body.orderId : null;
        const leadId = typeof body.leadId === "string" ? body.leadId : null;

        if (!orderId && !leadId) {
          return new Response(
            JSON.stringify({ error: "Order ID or Lead ID required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Dynamic import of SMS helper
        const { sendSms } = await import("../_shared/brevo-sms.ts");

        if (orderId) {
          const { data: order, error: orderErr } = await supabase
            .from("orders")
            .select("id, phone_e164, sms_opt_in, timezone, song_url, recipient_name")
            .eq("id", orderId)
            .single();

          if (orderErr || !order) {
            return new Response(
              JSON.stringify({ error: "Order not found" }),
              { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }

          if (!order.sms_opt_in || !order.phone_e164) {
            return new Response(
              JSON.stringify({ error: "SMS not opted in or no phone number" }),
              { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }

          const shortId = order.id.slice(0, 8);
          const songLink = `https://personalsonggifts.lovable.app/song/${shortId}`;
          const smsResult = await sendSms({
            to: order.phone_e164,
            text: `Your custom song is ready!\nListen here: ${songLink}\nReply STOP to opt out.`,
            tag: "order_delivery",
            timezone: order.timezone || undefined,
            force: true, // Admin action — bypass quiet hours
          });

          const smsUpdate: Record<string, unknown> = {};
          if (smsResult.sent) {
            smsUpdate.sms_status = "sent";
            smsUpdate.sms_sent_at = new Date().toISOString();
            smsUpdate.sms_scheduled_for = null;
          } else if (smsResult.scheduled) {
            smsUpdate.sms_status = "scheduled";
            smsUpdate.sms_scheduled_for = smsResult.scheduledFor;
          } else {
            smsUpdate.sms_status = "failed";
            smsUpdate.sms_last_error = smsResult.error?.substring(0, 500);
          }
          await supabase.from("orders").update(smsUpdate).eq("id", orderId);

          return new Response(
            JSON.stringify({ success: true, sms: smsResult }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        if (leadId) {
          const { data: lead, error: leadErr } = await supabase
            .from("leads")
            .select("id, phone_e164, sms_opt_in, timezone, preview_token")
            .eq("id", leadId)
            .single();

          if (leadErr || !lead) {
            return new Response(
              JSON.stringify({ error: "Lead not found" }),
              { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }

          if (!lead.sms_opt_in || !lead.phone_e164) {
            return new Response(
              JSON.stringify({ error: "SMS not opted in or no phone number" }),
              { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }

          const previewLink = `https://personalsonggifts.lovable.app/preview/${lead.preview_token}`;
          const smsResult = await sendSms({
            to: lead.phone_e164,
            text: `We made your song preview!\nListen here: ${previewLink}\nReply STOP to opt out.`,
            tag: "lead_preview",
            timezone: lead.timezone || undefined,
            force: true, // Admin action — bypass quiet hours
          });

          const smsUpdate: Record<string, unknown> = {};
          if (smsResult.sent) {
            smsUpdate.sms_status = "sent";
            smsUpdate.sms_sent_at = new Date().toISOString();
            smsUpdate.sms_scheduled_for = null;
          } else if (smsResult.scheduled) {
            smsUpdate.sms_status = "scheduled";
            smsUpdate.sms_scheduled_for = smsResult.scheduledFor;
          } else {
            smsUpdate.sms_status = "failed";
            smsUpdate.sms_last_error = smsResult.error?.substring(0, 500);
          }
          await supabase.from("leads").update(smsUpdate).eq("id", leadId);

          return new Response(
            JSON.stringify({ success: true, sms: smsResult }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
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

        // Create new order from lead data (includes ALL fields for proper continuity)
        const orderData = {
          customer_name: lead.customer_name,
          customer_email: lead.email,
          customer_phone: lead.phone,
          recipient_name: lead.recipient_name,
          recipient_type: lead.recipient_type,
          recipient_name_pronunciation: lead.recipient_name_pronunciation,
          occasion: lead.occasion,
          genre: lead.genre,
          singer_preference: lead.singer_preference,
          special_qualities: lead.special_qualities,
          favorite_memory: lead.favorite_memory,
          special_message: lead.special_message,
          song_url: lead.full_song_url,
          song_title: lead.song_title,
          cover_image_url: lead.cover_image_url,
          automation_lyrics: lead.automation_lyrics,
          automation_status: lead.full_song_url ? "completed" : (lead.automation_lyrics ? "lyrics_ready" : null),
          lyrics_language_code: lead.lyrics_language_code || "en",
          inputs_hash: lead.inputs_hash,
          phone_e164: lead.phone_e164,
          sms_opt_in: lead.sms_opt_in || false,
          timezone: lead.timezone,
          prev_automation_lyrics: lead.prev_automation_lyrics,
          prev_song_url: lead.prev_song_url,
          prev_cover_image_url: lead.prev_cover_image_url,
          price: price,
          price_cents: price * 100,
          pricing_tier: price >= 79 ? "priority" : "standard",
          status: lead.full_song_url ? "delivered" : "paid",
          delivered_at: lead.full_song_url ? new Date().toISOString() : null,
          notes: "Manual conversion from lead (webhook failure)",
          source: "lead_conversion",
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
        }

        console.log(`Lead ${leadId} converted to order ${order.id}`);

        await logActivity(supabase, "lead", leadId, "lead_converted", "admin", `Manually converted to order ${order.id.slice(0, 8).toUpperCase()}`);
        await logActivity(supabase, "order", order.id, "order_created", "admin", `Created from manual lead conversion, $${price}`);

        // Trigger lyrics generation if missing but audio exists
        if (!lead.automation_lyrics && lead.full_song_url) {
          try {
            console.log(`[ADMIN] Lyrics missing on lead ${leadId}, triggering generation for order ${order.id}`);
            await fetch(`${supabaseUrl}/functions/v1/automation-generate-lyrics`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${supabaseServiceKey}`,
              },
              body: JSON.stringify({ orderId: order.id, type: "order", force: true }),
            });
          } catch (e) {
            console.error("[ADMIN] Failed to trigger lyrics generation:", e);
          }
        }

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
                revisionToken: order.revision_token,
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

      // ===== HELPER: BACKUP SONG FILE TO -prev SLOT =====
      async function backupSongFile(
        supabaseUrl: string,
        supabaseServiceKey: string,
        supabase: ReturnType<typeof createClient>,
        entityType: "orders" | "leads",
        entityId: string,
        entity: Record<string, unknown>
      ): Promise<{ backed_up: boolean; prev_song_url?: string | null; prev_automation_lyrics?: string | null; prev_cover_image_url?: string | null }> {
        // Determine current song URL based on entity type
        const currentSongUrl = entityType === "orders"
          ? (entity.song_url as string | null)
          : (entity.full_song_url as string | null);

        if (!currentSongUrl) {
          console.log(`[BACKUP] No current song for ${entityType} ${entityId}, skipping backup`);
          return { backed_up: false };
        }

        // Extract path from public URL: strip everything up to and including /object/public/songs/
        const bucketBase = `${supabaseUrl}/storage/v1/object/public/songs/`;
        const path = currentSongUrl.includes(bucketBase)
          ? currentSongUrl.slice(bucketBase.length).split("?")[0]  // strip query params
          : null;

        if (!path) {
          console.warn(`[BACKUP] Could not extract storage path from URL: ${currentSongUrl}`);
          return { backed_up: false };
        }

        // Derive prev path: insert -prev before the extension
        const lastDot = path.lastIndexOf(".");
        const ext = lastDot !== -1 ? path.slice(lastDot) : ".mp3";
        const basePath = lastDot !== -1 ? path.slice(0, lastDot) : path;
        const prevPath = `${basePath}-prev${ext}`;

        console.log(`[BACKUP] Copying ${path} → ${prevPath}`);

        // Download current file
        let fileBytes: ArrayBuffer;
        try {
          const downloadRes = await fetch(currentSongUrl);
          if (!downloadRes.ok) {
            throw new Error(`Download failed: ${downloadRes.status}`);
          }
          fileBytes = await downloadRes.arrayBuffer();
        } catch (e) {
          console.error(`[BACKUP] Failed to download song for backup:`, e);
          throw new Error("Could not back up current song — regeneration blocked.");
        }

        // Upload to -prev slot
        const { error: uploadError } = await supabase.storage
          .from("songs")
          .upload(prevPath, fileBytes, {
            contentType: "audio/mpeg",
            upsert: true,
          });

        if (uploadError) {
          console.error(`[BACKUP] Failed to upload backup:`, uploadError);
          throw new Error("Could not upload song backup — regeneration blocked.");
        }

        // Build public URL for the prev file
        const prevPublicUrl = `${supabaseUrl}/storage/v1/object/public/songs/${prevPath}`;

        console.log(`[BACKUP] ✅ Backup created at ${prevPath}`);

        return {
          backed_up: true,
          prev_song_url: prevPublicUrl,
          prev_automation_lyrics: (entity.automation_lyrics as string | null) || null,
          prev_cover_image_url: (entity.cover_image_url as string | null) || null,
        };
      }

      // ===== RESTORE PREVIOUS VERSION HANDLER =====
      if (body?.action === "restore_previous_version") {
        const orderId = typeof body.orderId === "string" ? body.orderId : null;
        const leadId = typeof body.leadId === "string" ? body.leadId : null;

        if ((!!orderId && !!leadId) || (!orderId && !leadId)) {
          return new Response(
            JSON.stringify({ error: "Must provide exactly one of orderId or leadId" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const entityType = orderId ? "orders" : "leads";
        const entityId = orderId || leadId;

        const { data: entity, error: fetchError } = await supabase
          .from(entityType)
          .select("*")
          .eq("id", entityId!)
          .maybeSingle();

        if (fetchError) throw fetchError;
        if (!entity) {
          return new Response(
            JSON.stringify({ error: `${entityType === "orders" ? "Order" : "Lead"} not found` }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const prevSongUrl = entity.prev_song_url as string | null;
        if (!prevSongUrl) {
          return new Response(
            JSON.stringify({ error: "No previous version available to restore." }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Extract prev file path from prev_song_url
        const bucketBase = `${supabaseUrl}/storage/v1/object/public/songs/`;
        const prevPath = prevSongUrl.includes(bucketBase)
          ? prevSongUrl.slice(bucketBase.length).split("?")[0]
          : null;

        if (!prevPath) {
          return new Response(
            JSON.stringify({ error: "Could not parse previous song path from URL." }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Derive main path (remove -prev before extension)
        const prevExt = prevPath.lastIndexOf(".");
        const ext = prevExt !== -1 ? prevPath.slice(prevExt) : ".mp3";
        const baseWithoutExt = prevExt !== -1 ? prevPath.slice(0, prevExt) : prevPath;
        // Remove trailing -prev suffix
        const mainBasePath = baseWithoutExt.endsWith("-prev")
          ? baseWithoutExt.slice(0, -5)
          : baseWithoutExt;
        const mainPath = `${mainBasePath}${ext}`;

        console.log(`[RESTORE] Restoring ${prevPath} → ${mainPath}`);

        // Download prev file
        let fileBytes: ArrayBuffer;
        try {
          const downloadRes = await fetch(prevSongUrl);
          if (!downloadRes.ok) throw new Error(`Download failed: ${downloadRes.status}`);
          fileBytes = await downloadRes.arrayBuffer();
        } catch (e) {
          console.error(`[RESTORE] Failed to download prev song:`, e);
          return new Response(
            JSON.stringify({ error: "Could not download previous song file." }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Re-upload to main slot with cache-busting suffix
        const { error: uploadError } = await supabase.storage
          .from("songs")
          .upload(mainPath, fileBytes, {
            contentType: "audio/mpeg",
            upsert: true,
          });

        if (uploadError) {
          console.error(`[RESTORE] Upload failed:`, uploadError);
          return new Response(
            JSON.stringify({ error: "Failed to restore song file to storage." }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const cacheBust = `?v=${Date.now()}`;
        const restoredUrl = `${supabaseUrl}/storage/v1/object/public/songs/${mainPath}${cacheBust}`;

        const prevLyrics = entity.prev_automation_lyrics as string | null;
        const prevCoverImageUrl = entity.prev_cover_image_url as string | null;

        // Build restore DB update
        const restoreUpdate: Record<string, unknown> = {
          prev_song_url: null,
          prev_automation_lyrics: null,
          prev_cover_image_url: null,
          cover_image_url: prevCoverImageUrl,
          automation_lyrics: prevLyrics,
        };

        if (entityType === "orders") {
          restoreUpdate.song_url = restoredUrl;
        } else {
          restoreUpdate.full_song_url = restoredUrl;
        }

        const { error: updateError } = await supabase
          .from(entityType)
          .update(restoreUpdate)
          .eq("id", entityId!);

        if (updateError) {
          console.error(`[RESTORE] DB update failed:`, updateError);
          return new Response(
            JSON.stringify({ error: "Failed to update database after restore." }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        await logActivity(
          supabase,
          orderId ? "order" : "lead",
          entityId!,
          "song_restored",
          "admin",
          `Previous version restored from ${prevPath}`
        );

        console.log(`[RESTORE] ✅ Restore complete for ${entityType} ${entityId}`);

        return new Response(
          JSON.stringify({ success: true, restoredUrl, lyricsRestored: !!prevLyrics }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // ===== REGENERATE WITH CURRENT LYRICS HANDLER =====
      if (body?.action === "regenerate_with_lyrics") {
        const orderId = typeof body.orderId === "string" ? body.orderId : null;
        const leadId = typeof body.leadId === "string" ? body.leadId : null;
        const sendOption = typeof body.sendOption === "string" ? body.sendOption : "auto";
        const scheduledAt = typeof body.scheduledAt === "string" ? body.scheduledAt : null;

        const origin = req.headers.get("origin") || req.headers.get("referer") || "";
        const env = origin.includes("id-preview--") ? "preview" : origin ? "published" : "unknown";

        console.log("[REGENERATE_WITH_LYRICS] Handler entered", JSON.stringify({ orderId, leadId, sendOption, env }));

        if ((!!orderId && !!leadId) || (!orderId && !leadId)) {
          return new Response(
            JSON.stringify({ error: "Must provide exactly one of orderId or leadId", env }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        if (sendOption === "scheduled") {
          if (!scheduledAt) {
            return new Response(
              JSON.stringify({ error: "scheduledAt is required when sendOption is 'scheduled'", env }),
              { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
          if (Number.isNaN(Date.parse(scheduledAt))) {
            return new Response(
              JSON.stringify({ error: "scheduledAt must be a valid ISO timestamp", env }),
              { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }

        const entityType = orderId ? "orders" : "leads";
        const entityId = orderId || leadId;

        const { data: entity, error: fetchError } = await supabase
          .from(entityType)
          .select("*")
          .eq("id", entityId)
          .maybeSingle();

        if (fetchError) {
          console.error("[REGENERATE_WITH_LYRICS] Fetch error:", fetchError);
          return new Response(
            JSON.stringify({ error: "Database error", env }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        if (!entity) {
          return new Response(
            JSON.stringify({ error: `${entityType === "orders" ? "Order" : "Lead"} not found`, env }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Validate that automation_lyrics exists
        if (!entity.automation_lyrics || entity.automation_lyrics.trim().length === 0) {
          return new Response(
            JSON.stringify({ error: "No lyrics found on this record. Use 'Regenerate New Song' instead.", env }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // ===== BACKUP CURRENT SONG BEFORE OVERWRITING =====
        try {
          const backup = await backupSongFile(supabaseUrl, supabaseServiceKey, supabase, entityType as "orders" | "leads", entityId!, entity as Record<string, unknown>);
          if (backup.backed_up) {
            await supabase.from(entityType).update({
              prev_song_url: backup.prev_song_url,
              prev_automation_lyrics: backup.prev_automation_lyrics,
              prev_cover_image_url: backup.prev_cover_image_url,
            }).eq("id", entityId!);
            await logActivity(supabase, orderId ? "order" : "lead", entityId!, "song_backup_created", "admin", `Backup created before regenerate_with_lyrics`);
            console.log(`[REGENERATE_WITH_LYRICS] Backup saved to prev slot`);
          }
        } catch (backupErr) {
          console.error("[REGENERATE_WITH_LYRICS] Backup failed, blocking regeneration:", backupErr);
          return new Response(
            JSON.stringify({ error: (backupErr as Error).message || "Backup failed — regeneration blocked.", env }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        console.log(`[REGENERATE_WITH_LYRICS] Clearing audio artifacts, preserving lyrics for ${entityType} ${entityId}`);

        // Clear ONLY audio artifacts - preserve lyrics, song_title, inputs_hash
        const clearUpdates: Record<string, unknown> = {
          automation_status: null,
          automation_task_id: null,
          automation_started_at: null,
          automation_retry_count: 0,
          automation_last_error: null,
          automation_raw_callback: null,
          automation_style_id: null,
          automation_audio_url_source: null,
          generated_at: null,
          next_attempt_at: null,
          // MUST clear this so automation-generate-audio doesn't block
          automation_manual_override_at: null,
        };

        // Entity-specific audio clears
        if (entityType === "orders") {
          clearUpdates.song_url = null;
          clearUpdates.cover_image_url = null;
          clearUpdates.sent_at = null;
          clearUpdates.delivery_status = "pending";
        } else {
          clearUpdates.preview_song_url = null;
          clearUpdates.full_song_url = null;
          clearUpdates.cover_image_url = null;
          clearUpdates.preview_sent_at = null;
          clearUpdates.preview_token = null;
        }

        // Compute target_send_at
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
        clearUpdates.earliest_generate_at = new Date(now + 1 * 60 * 1000).toISOString();

        const { error: updateError } = await supabase
          .from(entityType)
          .update(clearUpdates)
          .eq("id", entityId);

        if (updateError) {
          console.error("[REGENERATE_WITH_LYRICS] Update error:", updateError);
          return new Response(
            JSON.stringify({ error: "Failed to update entity", env }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Trigger automation with skipLyrics=true and forceRun=true
        try {
          const triggerBody = orderId
            ? { orderId, forceRun: true, skipLyrics: true }
            : { leadId, forceRun: true, skipLyrics: true };

          const triggerRes = await fetch(`${supabaseUrl}/functions/v1/automation-trigger`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${supabaseServiceKey}`,
            },
            body: JSON.stringify(triggerBody),
          });

          if (!triggerRes.ok) {
            const text = await triggerRes.text().catch(() => "");
            console.error("[REGENERATE_WITH_LYRICS] trigger returned non-2xx", JSON.stringify({ status: triggerRes.status, body: text?.slice(0, 2000) }));
          } else {
            console.log("[REGENERATE_WITH_LYRICS] trigger succeeded");
          }
        } catch (triggerError) {
          console.error("[REGENERATE_WITH_LYRICS] Failed to trigger:", triggerError);
        }

        await logActivity(supabase, orderId ? "order" : "lead", entityId!, "song_regenerated_with_lyrics", "admin", `Regenerated with existing lyrics, sendOption=${sendOption}`);

        console.log(`[REGENERATE_WITH_LYRICS] ✅ Success for ${entityType} ${entityId}`);

        return new Response(
          JSON.stringify({ success: true, targetSendAt, entityType, entityId, lyricsPreserved: true, env }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // ===== REGENERATE SONG HANDLER (Must run BEFORE legacy fallback) =====
      if (body?.action === "regenerate_song") {
        const orderId = typeof body.orderId === "string" ? body.orderId : null;
        const leadId = typeof body.leadId === "string" ? body.leadId : null;
        const sendOption = typeof body.sendOption === "string" ? body.sendOption : "auto";
        const scheduledAt = typeof body.scheduledAt === "string" ? body.scheduledAt : null;

        // Derive environment label from Origin/Referer for debug responses
        const origin = req.headers.get("origin") || req.headers.get("referer") || "";
        const env = origin.includes("id-preview--") ? "preview" : origin ? "published" : "unknown";

        console.log(
          "[REGENERATE] Handler entered",
          JSON.stringify({
            action: "regenerate_song",
            orderId,
            leadId,
            sendOption,
            hasScheduledAt: !!scheduledAt,
            env,
          })
        );

        // Must provide exactly one of orderId or leadId.
        if ((!!orderId && !!leadId) || (!orderId && !leadId)) {
          return new Response(
            JSON.stringify({
              error: "Must provide exactly one of orderId or leadId",
              orderId,
              leadId,
              env,
            }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Validate scheduledAt when explicitly scheduling.
        if (sendOption === "scheduled") {
          if (!scheduledAt) {
            return new Response(
              JSON.stringify({ error: "scheduledAt is required when sendOption is 'scheduled'", env }),
              { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
          const ms = Date.parse(scheduledAt);
          if (Number.isNaN(ms)) {
            return new Response(
              JSON.stringify({ error: "scheduledAt must be a valid ISO timestamp", scheduledAt, env }),
              { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }

        const entityType = orderId ? "orders" : "leads";
        const entityId = orderId || leadId;
        
        console.log(`[REGENERATE] Fetching ${entityType} WHERE id = ${entityId}`);

        // Fetch entity to verify it exists (using maybeSingle to avoid PGRST116)
        const { data: entity, error: fetchError } = await supabase
          .from(entityType)
          .select("*")
          .eq("id", entityId)
          .maybeSingle();

        if (fetchError) {
          console.error("[REGENERATE] Fetch error:", fetchError);
          return new Response(
            JSON.stringify({ 
              error: "Database error fetching entity", 
              entityType, 
              entityId, 
              env,
              code: (fetchError as { code?: string })?.code,
            }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        if (!entity) {
          console.log(`[REGENERATE] Entity not found: ${entityType} ${entityId}`);
          return new Response(
            JSON.stringify({ 
              error: `${entityType === "orders" ? "Order" : "Lead"} not found`, 
              entityType,
              entityId,
              env,
            }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        console.log(`[REGENERATE] Found entity: ${entityType} ${entityId}, status=${entity.status || entity.automation_status}`);

        // ===== BACKUP CURRENT SONG BEFORE OVERWRITING =====
        try {
          const backup = await backupSongFile(supabaseUrl, supabaseServiceKey, supabase, entityType as "orders" | "leads", entityId!, entity as Record<string, unknown>);
          if (backup.backed_up) {
            await supabase.from(entityType).update({
              prev_song_url: backup.prev_song_url,
              prev_automation_lyrics: backup.prev_automation_lyrics,
              prev_cover_image_url: backup.prev_cover_image_url,
            }).eq("id", entityId!);
            await logActivity(supabase, orderId ? "order" : "lead", entityId!, "song_backup_created", "admin", `Backup created before regenerate_song`);
            console.log(`[REGENERATE] Backup saved to prev slot`);
          }
        } catch (backupErr) {
          console.error("[REGENERATE] Backup failed, blocking regeneration:", backupErr);
          return new Response(
            JSON.stringify({
              error: (backupErr as Error).message || "Backup failed — regeneration blocked.",
              entityType, entityId, env,
            }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
          lyrics_language_qa: null,
          lyrics_raw_attempt_1: null,
          lyrics_raw_attempt_2: null,
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
          console.error("[REGENERATE] Failed to update entity:", updateError);
          return new Response(
            JSON.stringify({ 
              error: "Failed to update entity for regeneration", 
              entityType, 
              entityId, 
              env,
              code: (updateError as { code?: string })?.code,
            }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        console.log(`[REGENERATE] Entity updated, sendOption=${sendOption}, targetSendAt=${targetSendAt}`);

        // Trigger automation with forceRun=true
        try {
          const triggerBody = orderId 
            ? { orderId, forceRun: true }
            : { leadId, forceRun: true };

          const triggerRes = await fetch(`${supabaseUrl}/functions/v1/automation-trigger`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${supabaseServiceKey}`,
            },
            body: JSON.stringify(triggerBody),
          });

          if (!triggerRes.ok) {
            const text = await triggerRes.text().catch(() => "");
            console.error(
              "[REGENERATE] automation-trigger returned non-2xx",
              JSON.stringify({ status: triggerRes.status, body: text?.slice(0, 2000) })
            );
            // Don't fail the request - the cron job will pick it up via earliest_generate_at.
          } else {
            console.log("[REGENERATE] automation-trigger succeeded");
          }
        } catch (triggerError) {
          console.error("[REGENERATE] Failed to trigger automation:", triggerError);
          // Don't fail the request - the cron job will pick it up
        }

        console.log(`[REGENERATE] ✅ Success for ${entityType} ${entityId}`);

        await logActivity(supabase, orderId ? "order" : "lead", entityId!, "song_regenerated", "admin", `Regeneration triggered, sendOption=${sendOption}`);

        return new Response(
          JSON.stringify({ success: true, targetSendAt, entityType, entityId, env }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // List pending revision requests
      if (body?.action === "list_pending_revisions") {
        console.log("[ADMIN] Fetching pending revisions");
        const { data: revisions, error: revErr } = await supabase
          .from("revision_requests")
          .select("*")
          .eq("status", "pending")
          .order("submitted_at", { ascending: true })
          .limit(100);

        if (revErr) throw revErr;

        // Enrich with order context
        const enriched = [];
        for (const rev of (revisions || [])) {
          const { data: order } = await supabase
            .from("orders")
            .select("id, recipient_name, customer_name, customer_email, occasion, status, revision_token")
            .eq("id", rev.order_id)
            .maybeSingle();

          enriched.push({
            ...rev,
            order_short_id: order?.id?.substring(0, 8) || "?",
            order_recipient_name: order?.recipient_name,
            order_customer_name: order?.customer_name,
            order_customer_email: order?.customer_email,
            order_occasion: order?.occasion,
            order_status: order?.status,
            order_revision_token: order?.revision_token,
          });
        }

        // Fetch auto-approve setting
        const { data: autoApproveSetting } = await supabase
          .from("admin_settings")
          .select("value")
          .eq("key", "revision_auto_approve_enabled")
          .maybeSingle();

        return new Response(
          JSON.stringify({ revisions: enriched, auto_approve_enabled: autoApproveSetting?.value === "true" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Set revision auto-approve toggle
      if (body?.action === "set_revision_auto_approve") {
        const enabled = body.enabled === true;
        const { error: upsertErr } = await supabase
          .from("admin_settings")
          .upsert({
            key: "revision_auto_approve_enabled",
            value: enabled ? "true" : "false",
            updated_at: new Date().toISOString(),
          });

        if (upsertErr) throw upsertErr;

        console.log("[ADMIN] Auto-approve set to:", enabled);
        return new Response(
          JSON.stringify({ success: true, enabled }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Review (approve/reject) a revision request
      if (body?.action === "review_revision") {
        console.log("[ADMIN] review_revision called", { revisionId: body.revisionId, decision: body.decision });
        const revisionId = typeof body.revisionId === "string" ? body.revisionId : null;
        const decision = typeof body.decision === "string" ? body.decision : null;
        const rejectionReason = typeof body.rejectionReason === "string" ? body.rejectionReason : null;

        if (!revisionId || !["approve", "reject"].includes(decision || "")) {
          return new Response(
            JSON.stringify({ error: "revisionId and decision (approve|reject) required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { data: rev, error: revErr } = await supabase
          .from("revision_requests")
          .select("*")
          .eq("id", revisionId)
          .maybeSingle();

        if (revErr || !rev) {
          return new Response(
            JSON.stringify({ error: "Revision request not found" }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        if (rev.status !== "pending") {
          return new Response(
            JSON.stringify({ error: `Revision already ${rev.status}` }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const now = new Date().toISOString();

        if (decision === "reject") {
          console.log("[ADMIN] Rejecting revision for order:", rev.order_id);
          await supabase.from("revision_requests").update({
            status: "rejected",
            reviewed_at: now,
            reviewed_by: "admin",
            rejection_reason: rejectionReason || null,
          }).eq("id", revisionId);

          await supabase.from("orders").update({
            revision_status: "rejected",
            pending_revision: false,
          }).eq("id", rev.order_id);

          await logActivity(supabase, "order", rev.order_id, "revision_rejected", "admin", rejectionReason ? `Rejected: ${rejectionReason}` : "Revision request rejected");

          return new Response(
            JSON.stringify({ success: true, message: "Revision rejected" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // === APPROVE ===
        // Apply admin modifications if provided
        const adminModifications = body.adminModifications && typeof body.adminModifications === 'object' ? body.adminModifications : null;
        if (adminModifications) {
          console.log("[ADMIN] Applying admin modifications to revision:", Object.keys(adminModifications));
          await supabase.from("revision_requests").update({ admin_modifications: adminModifications }).eq("id", revisionId);
          // Override revision values with admin edits
          for (const [key, val] of Object.entries(adminModifications)) {
            if (typeof val === 'string') {
              (rev as any)[key] = val;
            }
          }
        }

        const fieldsChanged: string[] = Array.isArray(rev.fields_changed) ? rev.fields_changed : [];
        const orderUpdate: Record<string, any> = {
          revision_status: "approved",
          pending_revision: false,
        };

        const fieldMapping: Record<string, string> = {
          recipient_name: "recipient_name",
          customer_name: "customer_name",
          delivery_email: "customer_email",
          recipient_type: "recipient_type",
          occasion: "occasion",
          genre: "genre",
          singer_preference: "singer_preference",
          language: "lyrics_language_code",
          recipient_name_pronunciation: "recipient_name_pronunciation",
          special_qualities: "special_qualities",
          favorite_memory: "favorite_memory",
          special_message: "special_message",
          style_notes: "notes",
          tempo: "notes",
          anything_else: "notes",
          sender_context: "sender_context",
        };

        const notesFields = ["style_notes", "tempo", "anything_else"];
        for (const field of fieldsChanged) {
          if (notesFields.includes(field)) continue; // handled separately below
          const orderField = fieldMapping[field];
          if (orderField && rev[field] !== undefined && rev[field] !== null) {
            orderUpdate[orderField] = rev[field];
          }
        }

        // For notes-mapped fields, concatenate rather than overwrite
        const notesParts: string[] = [];
        for (const nf of ["style_notes", "tempo", "anything_else"]) {
          if (fieldsChanged.includes(nf) && rev[nf]) {
            notesParts.push(`${nf}: ${rev[nf]}`);
          }
        }
        if (notesParts.length > 0) {
          orderUpdate.notes = notesParts.join(" | ");
        }

        const contentFields = ["recipient_name", "recipient_name_pronunciation", "special_qualities", "favorite_memory", "special_message", "occasion", "genre", "singer_preference", "language", "style_notes", "tempo", "sender_context"];
        const needsRegeneration = fieldsChanged.some(f => contentFields.includes(f));

        if (needsRegeneration) {
          // === AUTO-REGENERATE: backup, clear, trigger ===
          // Fetch full order for backup
          const { data: fullOrder } = await supabase
            .from("orders")
            .select("song_url, automation_lyrics, cover_image_url")
            .eq("id", rev.order_id)
            .maybeSingle();

          // Backup current song
          if (fullOrder?.song_url) {
            try {
              const backup = await backupSongFile(supabaseUrl, supabaseServiceKey, supabase, "orders", rev.order_id, fullOrder as Record<string, unknown>);
              if (backup.backed_up) {
                orderUpdate.prev_song_url = backup.prev_song_url;
                orderUpdate.prev_automation_lyrics = backup.prev_automation_lyrics;
                orderUpdate.prev_cover_image_url = backup.prev_cover_image_url;
              }
            } catch (backupErr) {
              console.error("[REVISION-APPROVE] Backup failed:", backupErr);
            }
          }

          // Merge regeneration clears into orderUpdate
          orderUpdate.automation_status = null;
          orderUpdate.automation_task_id = null;
          orderUpdate.automation_lyrics = null;
          orderUpdate.automation_started_at = null;
          orderUpdate.automation_retry_count = 0;
          orderUpdate.automation_last_error = null;
          orderUpdate.automation_raw_callback = null;
          orderUpdate.automation_style_id = null;
          orderUpdate.automation_audio_url_source = null;
          orderUpdate.generated_at = null;
          orderUpdate.inputs_hash = null;
          orderUpdate.next_attempt_at = null;
          orderUpdate.automation_manual_override_at = null;
          orderUpdate.lyrics_language_qa = null;
          orderUpdate.lyrics_raw_attempt_1 = null;
          orderUpdate.lyrics_raw_attempt_2 = null;
          orderUpdate.song_url = null;
          orderUpdate.song_title = null;
          orderUpdate.cover_image_url = null;
          orderUpdate.delivery_status = "pending";
          orderUpdate.sent_at = null;
          orderUpdate.unplayed_resend_sent_at = null;

          const regenNow = Date.now();
          orderUpdate.earliest_generate_at = new Date(regenNow + 1 * 60 * 1000).toISOString();
          orderUpdate.target_send_at = new Date(regenNow + 12 * 60 * 60 * 1000).toISOString();
          // Don't change order status — keep as-is
        }

        await supabase.from("orders").update(orderUpdate).eq("id", rev.order_id);

        await supabase.from("revision_requests").update({
          status: "approved",
          reviewed_at: now,
          reviewed_by: "admin",
        }).eq("id", revisionId);

        // Fire automation trigger if regeneration needed
        if (needsRegeneration) {
          try {
            const triggerRes = await fetch(`${supabaseUrl}/functions/v1/automation-trigger`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${supabaseServiceKey}`,
              },
              body: JSON.stringify({ orderId: rev.order_id, forceRun: true }),
            });
            if (!triggerRes.ok) {
              console.error("[REVISION-APPROVE] automation-trigger non-2xx:", triggerRes.status);
            } else {
              console.log("[REVISION-APPROVE] automation-trigger succeeded");
            }
          } catch (triggerErr) {
            console.error("[REVISION-APPROVE] Failed to trigger automation:", triggerErr);
          }
        }

        console.log("[ADMIN] Approved revision for order:", rev.order_id, "fields:", fieldsChanged, "needsRegen:", needsRegeneration);
        await logActivity(supabase, "order", rev.order_id, needsRegeneration ? "revision_approved_regenerating" : "revision_approved", "admin", `Approved: ${fieldsChanged.length} field(s) updated${needsRegeneration ? " — auto-regenerating" : ""}`, { fields_changed: fieldsChanged });

        const message = needsRegeneration
          ? "Revision approved. Song regeneration started automatically."
          : "Revision approved. Non-content fields updated.";

        return new Response(
          JSON.stringify({ success: true, message, needs_regeneration: needsRegeneration }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // ===== LEGACY UPDATE FALLBACK (only when no action is provided) =====
      // Extract action to gate this block
      const action = typeof body?.action === "string" ? body.action : null;
      
      // If action is set but not handled above, return unknown action error
      if (action) {
        return new Response(
          JSON.stringify({ error: "Unknown action", action }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Legacy update-order fallback (no action field = direct order updates)
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

      // Guard: if no meaningful updates, return error instead of empty update
      const hasUpdates = Object.keys(updateData).length > 0 || deliver || scheduleDelivery;
      if (!hasUpdates) {
        return new Response(
          JSON.stringify({ error: "No update fields provided", orderId }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Use maybeSingle to avoid PGRST116
      const { data: order, error: updateError } = await supabase
        .from("orders")
        .update(updateData)
        .eq("id", orderId)
        .select()
        .maybeSingle();

      if (updateError) {
        throw updateError;
      }

      if (!order) {
        return new Response(
          JSON.stringify({ error: "Order not found", orderId }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
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
                revisionToken: order.revision_token,
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

    // NOTE: regenerate_song handler is now located earlier in the POST block (before legacy fallback)

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
        lyrics_language_qa: null,
        lyrics_raw_attempt_1: null,
        lyrics_raw_attempt_2: null,
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

        await logActivity(supabase, orderId ? "order" : "lead", entityId!, "automation_reset", "admin", clearAssets ? "Full reset with asset clearing" : "Soft reset, assets preserved");

        return new Response(
          JSON.stringify({ success: true, mode: clearAssets ? "full_reset" : "preserve_song" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    // Get alerts summary for dashboard banner
    if (body?.action === "get_alerts_summary") {
      const now = new Date().toISOString();
      const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
      const allActiveStatuses = ["queued", "pending", "lyrics_generating", "audio_generating"];

      // Stuck orders (ANY active status > 15 min)
      const { count: stuckOrders } = await supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .in("automation_status", allActiveStatuses)
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

      // Stuck leads (ANY active status > 15 min)
      const { count: stuckLeads } = await supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .in("automation_status", allActiveStatuses)
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

    // Unstick all stuck items
    if (body?.action === "unstick_all") {
      const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
      const allActiveStatuses = ["queued", "pending", "lyrics_generating", "audio_generating"];
      const MAX_AUTO_RETRIES = 3;
      let fixed = 0;
      let permanentlyFailed = 0;

      // Fix stuck orders
      const { data: stuckOrders } = await supabase
        .from("orders")
        .select("id, automation_status, automation_retry_count")
        .in("automation_status", allActiveStatuses)
        .lt("automation_started_at", fifteenMinAgo)
        .is("automation_manual_override_at", null)
        .is("dismissed_at", null)
        .neq("status", "cancelled");

      for (const order of stuckOrders || []) {
        const retryCount = (order.automation_retry_count || 0) + 1;
        if (retryCount > MAX_AUTO_RETRIES) {
          await supabase.from("orders").update({
            automation_status: "permanently_failed",
            automation_last_error: `Unstick: exceeded max retries after stuck in ${order.automation_status}`,
          }).eq("id", order.id);
          permanentlyFailed++;
        } else {
          await supabase.from("orders").update({
            automation_status: null,
            automation_started_at: null,
            automation_task_id: null,
            automation_last_error: `Admin unstick from ${order.automation_status}`,
            automation_retry_count: retryCount,
          }).eq("id", order.id);
          fixed++;
        }
      }

      // Fix stuck leads
      const { data: stuckLeads } = await supabase
        .from("leads")
        .select("id, automation_status, automation_retry_count")
        .in("automation_status", allActiveStatuses)
        .lt("automation_started_at", fifteenMinAgo)
        .is("automation_manual_override_at", null)
        .is("dismissed_at", null);

      for (const lead of stuckLeads || []) {
        const retryCount = (lead.automation_retry_count || 0) + 1;
        if (retryCount > MAX_AUTO_RETRIES) {
          await supabase.from("leads").update({
            automation_status: "permanently_failed",
            automation_last_error: `Unstick: exceeded max retries after stuck in ${lead.automation_status}`,
          }).eq("id", lead.id);
          permanentlyFailed++;
        } else {
          await supabase.from("leads").update({
            automation_status: null,
            automation_started_at: null,
            automation_task_id: null,
            automation_last_error: `Admin unstick from ${lead.automation_status}`,
            automation_retry_count: retryCount,
          }).eq("id", lead.id);
          fixed++;
        }
      }

      console.log(`[ADMIN] Unstick all: fixed=${fixed}, permanentlyFailed=${permanentlyFailed}`);

      return new Response(
        JSON.stringify({ success: true, fixed, permanentlyFailed }),
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
