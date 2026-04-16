import { createClient } from "npm:@supabase/supabase-js@2.93.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const EDITABLE_FIELDS = [
  "recipient_name", "customer_name", "delivery_email", "recipient_type",
  "occasion", "genre", "singer_preference", "language",
  "recipient_name_pronunciation", "special_qualities", "favorite_memory",
  "special_message", "style_notes", "tempo", "anything_else", "sender_context",
] as const;

// Map revision field names to order column names
const FIELD_TO_ORDER_COL: Record<string, string> = {
  delivery_email: "customer_email",
  language: "lyrics_language_code",
};

function stripUrls(text: string): string {
  return text.replace(/https?:\/\/[^\s]+/gi, "[link removed]");
}

function validateLength(value: string | undefined, max: number): boolean {
  if (!value) return true;
  return value.length <= max;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const body = await req.json();
    const { revision_token, ...fields } = body;

    if (!revision_token) {
      return new Response(
        JSON.stringify({ error: "Token is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check feature enabled
    const { data: enabledSetting } = await supabase
      .from("admin_settings")
      .select("value")
      .eq("key", "self_service_revisions_enabled")
      .maybeSingle();

    if (!enabledSetting || enabledSetting.value !== "true") {
      return new Response(
        JSON.stringify({ error: "Revisions are not currently available" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Look up order
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("id, created_at, price_cents, status, sent_at, revision_token, revision_count, max_revisions, revision_requested_at, revision_status, recipient_name, customer_name, customer_email, recipient_type, occasion, genre, singer_preference, lyrics_language_code, recipient_name_pronunciation, special_qualities, favorite_memory, special_message, pricing_tier")
      .eq("revision_token", revision_token)
      .maybeSingle();

    // If no paid order found, try a lead lookup
    if (!order || order.price_cents === null || order.price_cents === undefined) {
      const { data: lead } = await supabase
        .from("leads")
        .select("*")
        .eq("revision_token", revision_token)
        .maybeSingle();

      if (lead) {
        return await handleLeadRevision(supabase, supabaseUrl, supabaseServiceKey, lead, fields);
      }

      return new Response(
        JSON.stringify({ error: "Order not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (orderError) {
      return new Response(
        JSON.stringify({ error: "Order not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate payment
    if (order.price_cents === null || order.price_cents === undefined) {
      return new Response(
        JSON.stringify({ error: "Order not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check expiry
    const { data: expirySetting } = await supabase
      .from("admin_settings")
      .select("value")
      .eq("key", "revision_link_expiry_days")
      .maybeSingle();
    const expiryDays = expirySetting ? parseInt(expirySetting.value, 10) : 90;
    const expiryDate = new Date(new Date(order.created_at).getTime() + expiryDays * 24 * 60 * 60 * 1000);
    if (new Date() > expiryDate) {
      return new Response(
        JSON.stringify({ error: "This revision link has expired" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check status
    if (order.status === "failed" || order.status === "needs_review") {
      return new Response(
        JSON.stringify({ error: "This order is under review" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check processing
    if (order.revision_status === "processing") {
      return new Response(
        JSON.stringify({ error: "A revision is currently being processed" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check revisions left (post-delivery only)
    const isPreDelivery = !order.sent_at;
    if (!isPreDelivery && (order.revision_count || 0) >= (order.max_revisions || 1)) {
      return new Response(
        JSON.stringify({ error: "No revisions remaining" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Cooldown: 1 hour for NEW submissions (not edits to pending)
    const isEditingPending = order.revision_status === "pending";
    if (!isEditingPending && order.revision_requested_at) {
      const lastRequest = new Date(order.revision_requested_at);
      const cooldownEnd = new Date(lastRequest.getTime() + 60 * 60 * 1000);
      if (new Date() < cooldownEnd) {
        return new Response(
          JSON.stringify({ error: "Please wait before submitting another revision request" }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Validate field lengths
    const longFields = ["style_notes", "anything_else"];
    const shortFields = ["recipient_name", "customer_name", "delivery_email", "recipient_type", "occasion", "genre", "singer_preference", "language", "recipient_name_pronunciation", "special_qualities", "favorite_memory", "special_message", "tempo", "sender_context"];

    for (const f of longFields) {
      if (!validateLength(fields[f], 500)) {
        return new Response(
          JSON.stringify({ error: `${f} must be 500 characters or less` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }
    for (const f of shortFields) {
      if (!validateLength(fields[f], 250)) {
        return new Response(
          JSON.stringify({ error: `${f} must be 250 characters or less` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Strip URLs from text fields
    const textFields = ["special_qualities", "favorite_memory", "special_message", "style_notes", "anything_else", "recipient_name_pronunciation"];
    for (const f of textFields) {
      if (fields[f]) {
        fields[f] = stripUrls(fields[f]);
      }
    }

    // Check for emptied fields that previously had content
    const warnings: string[] = [];
    const orderFieldMap: Record<string, string> = {
      recipient_name: order.recipient_name,
      customer_name: order.customer_name,
      delivery_email: order.customer_email,
      recipient_type: order.recipient_type,
      occasion: order.occasion,
      genre: order.genre,
      singer_preference: order.singer_preference,
      language: order.lyrics_language_code,
      recipient_name_pronunciation: order.recipient_name_pronunciation || "",
      special_qualities: order.special_qualities,
      favorite_memory: order.favorite_memory,
      special_message: order.special_message || "",
    };

    for (const [field, currentValue] of Object.entries(orderFieldMap)) {
      if (currentValue && currentValue.trim() !== "" && fields[field] !== undefined && (!fields[field] || fields[field].trim() === "")) {
        warnings.push(field);
      }
    }

    if (warnings.length > 0) {
      return new Response(
        JSON.stringify({
          error: "empty_fields",
          fields: warnings,
          message: "Some fields that previously had content are now empty. This may affect your song quality.",
        }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Compute diff
    const fieldsChanged: string[] = [];
    const changeSummaryParts: string[] = [];
    const originalValues: Record<string, any> = {};

    for (const field of EDITABLE_FIELDS) {
      const orderCol = FIELD_TO_ORDER_COL[field] || field;
      const currentVal = (order as any)[orderCol] ?? "";
      const submittedVal = fields[field] ?? "";
      originalValues[field] = currentVal;

      if (String(currentVal).trim() !== String(submittedVal).trim() && submittedVal !== "") {
        fieldsChanged.push(field);
        // Don't include full text in summary for long fields
        if (["special_qualities", "favorite_memory", "special_message", "style_notes", "anything_else"].includes(field)) {
          changeSummaryParts.push(`${field.replace(/_/g, " ")} updated`);
        } else {
          changeSummaryParts.push(`${field.replace(/_/g, " ")}: "${currentVal}" → "${submittedVal}"`);
        }
      }
    }

    // Also count style_notes, tempo, anything_else as changed if they have content (new fields)
    for (const f of ["style_notes", "tempo", "anything_else"]) {
      if (fields[f] && fields[f].trim() !== "" && !fieldsChanged.includes(f)) {
        fieldsChanged.push(f);
        if (f === "tempo") {
          changeSummaryParts.push(`tempo: ${fields[f]}`);
        } else {
          changeSummaryParts.push(`${f.replace(/_/g, " ")} provided`);
        }
      }
    }

    const changesSummary = changeSummaryParts.length > 0
      ? changeSummaryParts.join("; ")
      : "No changes detected";

    // Build revision record
    const revisionData: Record<string, any> = {
      order_id: order.id,
      status: "pending",
      is_pre_delivery: isPreDelivery,
      changes_summary: changesSummary,
      original_values: originalValues,
      fields_changed: fieldsChanged,
    };

    for (const field of EDITABLE_FIELDS) {
      if (fields[field] !== undefined) {
        revisionData[field] = fields[field];
      }
    }

    // Insert or update revision request
    if (isEditingPending) {
      // Find existing pending revision
      const { data: existing } = await supabase
        .from("revision_requests")
        .select("id")
        .eq("order_id", order.id)
        .eq("status", "pending")
        .order("submitted_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existing) {
        revisionData.submitted_at = new Date().toISOString();
        const { error: updateError } = await supabase
          .from("revision_requests")
          .update(revisionData)
          .eq("id", existing.id);

        if (updateError) {
          console.error("Update revision error:", updateError);
          return new Response(
            JSON.stringify({ error: "Failed to update revision request" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      } else {
        // Shouldn't happen but fall through to insert
        const { error: insertError } = await supabase
          .from("revision_requests")
          .insert(revisionData);

        if (insertError) {
          console.error("Insert revision error:", insertError);
          return new Response(
            JSON.stringify({ error: "Failed to create revision request" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
    } else {
      const { error: insertError } = await supabase
        .from("revision_requests")
        .insert(revisionData);

      if (insertError) {
        console.error("Insert revision error:", insertError);
        return new Response(
          JSON.stringify({ error: "Failed to create revision request" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // === AUTO-APPROVE CHECK ===
    const { data: autoApproveSetting } = await supabase
      .from("admin_settings")
      .select("value")
      .eq("key", "revision_auto_approve_enabled")
      .maybeSingle();

    const autoApproveEnabled = autoApproveSetting?.value === "true";

    const shouldAutoApprove = autoApproveEnabled && fieldsChanged.length > 0;

    if (shouldAutoApprove) {
      console.log("[SUBMIT-REVISION] Auto-approving revision for order:", order.id);

      // Approve the revision request
      const { data: insertedRevision } = await supabase
        .from("revision_requests")
        .select("id")
        .eq("order_id", order.id)
        .eq("status", "pending")
        .order("submitted_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (insertedRevision) {
        await supabase.from("revision_requests").update({
          status: "approved",
          reviewed_at: new Date().toISOString(),
          reviewed_by: "auto",
        }).eq("id", insertedRevision.id);
      }

      // Apply field updates to order
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

      const autoOrderUpdate: Record<string, any> = {
        revision_status: "approved",
        pending_revision: false,
      };

      const notesFields = ["style_notes", "tempo", "anything_else"];
      for (const field of fieldsChanged) {
        if (notesFields.includes(field)) continue;
        const orderField = fieldMapping[field];
        if (orderField && fields[field] !== undefined && fields[field] !== null) {
          autoOrderUpdate[orderField] = fields[field];
        }
      }

      // Notes fields
      const notesParts: string[] = [];
      for (const nf of notesFields) {
        if (fieldsChanged.includes(nf) && fields[nf]) {
          notesParts.push(`${nf}: ${fields[nf]}`);
        }
      }
      if (notesParts.length > 0) {
        autoOrderUpdate.notes = notesParts.join(" | ");
      }

      // Check if content fields changed — needs regeneration
      const contentFields = ["recipient_name", "recipient_name_pronunciation", "special_qualities", "favorite_memory", "special_message", "occasion", "genre", "singer_preference", "language", "style_notes", "tempo", "sender_context"];
      const needsRegen = fieldsChanged.some(f => contentFields.includes(f));

      if (needsRegen) {
        // Clear automation for regeneration
        autoOrderUpdate.automation_status = null;
        autoOrderUpdate.automation_task_id = null;
        autoOrderUpdate.automation_lyrics = null;
        autoOrderUpdate.automation_started_at = null;
        autoOrderUpdate.automation_retry_count = 0;
        autoOrderUpdate.automation_last_error = null;
        autoOrderUpdate.automation_raw_callback = null;
        autoOrderUpdate.automation_style_id = null;
        autoOrderUpdate.automation_audio_url_source = null;
        autoOrderUpdate.generated_at = null;
        autoOrderUpdate.inputs_hash = null;
        autoOrderUpdate.next_attempt_at = null;
        autoOrderUpdate.automation_manual_override_at = null;
        autoOrderUpdate.lyrics_language_qa = null;
        autoOrderUpdate.lyrics_raw_attempt_1 = null;
        autoOrderUpdate.lyrics_raw_attempt_2 = null;
        autoOrderUpdate.song_url = null;
        autoOrderUpdate.song_title = null;
        autoOrderUpdate.cover_image_url = null;
        autoOrderUpdate.delivery_status = "pending";
        autoOrderUpdate.sent_at = null;
        autoOrderUpdate.unplayed_resend_sent_at = null;

        const regenNow = Date.now();
        autoOrderUpdate.earliest_generate_at = new Date(regenNow + 1 * 60 * 1000).toISOString();
        autoOrderUpdate.target_send_at = new Date(regenNow + 12 * 60 * 60 * 1000).toISOString();
      }

      await supabase.from("orders").update(autoOrderUpdate).eq("id", order.id);

      // Fire automation trigger if regeneration needed
      if (needsRegen) {
        try {
          await fetch(`${supabaseUrl}/functions/v1/automation-trigger`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${supabaseServiceKey}`,
            },
            body: JSON.stringify({ orderId: order.id, forceRun: true }),
          });
        } catch (triggerErr) {
          console.error("[SUBMIT-REVISION] Auto-approve trigger error:", triggerErr);
        }
      }

      // Log activity
      try {
        await supabase.from("order_activity_log").insert({
          entity_type: "order",
          entity_id: order.id,
          event_type: "revision_auto_approved",
          actor: "system",
          details: `Auto-approved: ${fieldsChanged.length} field(s)${needsRegen ? " — regenerating" : ""}`,
          metadata: { fields_changed: fieldsChanged },
        });
      } catch (_) {}
    }

    // Update order
    const orderUpdate: Record<string, any> = {
      revision_status: shouldAutoApprove ? "approved" : "pending",
      revision_requested_at: new Date().toISOString(),
      revision_reason: changesSummary,
      unplayed_resend_sent_at: null,
    };

    if (!isEditingPending) {
      orderUpdate.revision_count = (order.revision_count || 0) + 1;
    }

    const { error: orderUpdateError } = await supabase
      .from("orders")
      .update(orderUpdate)
      .eq("id", order.id);

    if (orderUpdateError) {
      console.error("Order update error:", orderUpdateError);
    }

    // Send confirmation email to customer (plain text for deliverability)
    const brevoApiKey = Deno.env.get("BREVO_API_KEY");
    if (brevoApiKey) {
      const shortId = order.id.substring(0, 8).toUpperCase();
      const emailSubject = isPreDelivery
        ? `Re: Your Personal Song Gifts Order ${shortId} — Details Updated`
        : `Re: Your Personal Song Gifts Order ${shortId} — Revision Requested`;

      const emailBody = isPreDelivery
        ? `Hi ${order.customer_name},\n\nThanks for updating your song details! We've received your changes and our team will incorporate them.\n\nDepending on where we are in the creation process, this may add up to 12-24 hours to your delivery time. We'll make sure everything is perfect.\n\nIf you have any questions, just reply to this email.\n\nBest,\nPersonal Song Gifts Team`
        : `Hi ${order.customer_name},\n\nThanks for your feedback! We've received your revision request and our team is working on a new version of your song.\n\nYou'll receive your updated song within 12-24 hours.\n\nIf you have any questions, just reply to this email.\n\nBest,\nPersonal Song Gifts Team`;

      try {
        await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: {
            "api-key": brevoApiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            sender: { name: "Personal Song Gifts", email: "support@personalsonggifts.com" },
            to: [{ email: order.customer_email, name: order.customer_name }],
            subject: emailSubject,
            textContent: emailBody,
            headers: { "Precedence": "transactional" },
          }),
        });
      } catch (emailErr) {
        console.error("Customer confirmation email error:", emailErr);
      }

      // Send alert email to support
      try {
        const alertBody = `New revision request for Order ${shortId}\n\nCustomer: ${order.customer_name} (${order.customer_email})\nRecipient: ${order.recipient_name}\nOccasion: ${order.occasion}\nTier: ${order.pricing_tier === "priority" ? "$79 Rush" : "$49 Standard"}\nType: ${isPreDelivery ? "Pre-delivery update" : "Post-delivery redo"}\n\nChanges:\n${changesSummary}\n\nFields changed: ${fieldsChanged.join(", ") || "None"}\n\nReview in admin panel.`;

        await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: {
            "api-key": brevoApiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            sender: { name: "Personal Song Gifts", email: "support@personalsonggifts.com" },
            to: [{ email: "support@personalsonggifts.com", name: "PSG Support" }],
            subject: `⚡ Revision Request — ${order.customer_name} — Order ${shortId}`,
            textContent: alertBody,
            headers: { "Precedence": "transactional" },
          }),
        });
      } catch (alertErr) {
        console.error("Alert email error:", alertErr);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        form_type: isPreDelivery ? "pre_delivery_update" : "post_delivery_redo",
        revisions_remaining: Math.max(0, (order.max_revisions || 1) - ((order.revision_count || 0) + (isEditingPending ? 0 : 1))),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("submit-revision error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ============ LEAD REVISION HANDLER ============
async function handleLeadRevision(
  supabase: any,
  supabaseUrl: string,
  supabaseServiceKey: string,
  lead: any,
  fields: Record<string, any>,
): Promise<Response> {
  // Already processing
  if (lead.revision_status === "processing") {
    return new Response(
      JSON.stringify({ error: "A revision is currently being processed" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Out of revisions
  if ((lead.revision_count || 0) >= (lead.max_revisions || 1)) {
    return new Response(
      JSON.stringify({ error: "No revisions remaining" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Cooldown
  if (lead.revision_requested_at) {
    const cooldownEnd = new Date(new Date(lead.revision_requested_at).getTime() + 60 * 60 * 1000);
    if (new Date() < cooldownEnd) {
      return new Response(
        JSON.stringify({ error: "Please wait before submitting another revision request" }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  }

  // Strip URLs from text fields
  const textFields = ["special_qualities", "favorite_memory", "special_message", "style_notes", "anything_else", "recipient_name_pronunciation"];
  for (const f of textFields) {
    if (fields[f]) fields[f] = stripUrls(fields[f]);
  }

  // Compute changes
  const leadFieldMap: Record<string, string> = {
    recipient_name: "recipient_name",
    customer_name: "customer_name",
    delivery_email: "email",
    recipient_type: "recipient_type",
    occasion: "occasion",
    genre: "genre",
    singer_preference: "singer_preference",
    language: "lyrics_language_code",
    recipient_name_pronunciation: "recipient_name_pronunciation",
    special_qualities: "special_qualities",
    favorite_memory: "favorite_memory",
    special_message: "special_message",
  };

  const fieldsChanged: string[] = [];
  const originalValues: Record<string, any> = {};
  const summaryParts: string[] = [];

  for (const [field, leadCol] of Object.entries(leadFieldMap)) {
    const currentVal = (lead as any)[leadCol] ?? "";
    const submittedVal = fields[field] ?? "";
    originalValues[field] = currentVal;
    if (String(currentVal).trim() !== String(submittedVal).trim() && submittedVal !== "") {
      fieldsChanged.push(field);
      summaryParts.push(`${field.replace(/_/g, " ")} updated`);
    }
  }
  for (const f of ["style_notes", "tempo", "anything_else"]) {
    if (fields[f] && fields[f].trim() !== "") {
      fieldsChanged.push(f);
      summaryParts.push(`${f.replace(/_/g, " ")} provided`);
    }
  }

  const changesSummary = summaryParts.length > 0 ? summaryParts.join("; ") : "No changes detected";

  // Insert revision_request with lead_id
  const revisionData: Record<string, any> = {
    lead_id: lead.id,
    status: "approved",
    is_pre_delivery: true,
    changes_summary: changesSummary,
    original_values: originalValues,
    fields_changed: fieldsChanged,
    reviewed_at: new Date().toISOString(),
    reviewed_by: "auto",
  };
  for (const f of EDITABLE_FIELDS) {
    if (fields[f] !== undefined) revisionData[f] = fields[f];
  }
  await supabase.from("revision_requests").insert(revisionData);

  // Apply field updates to lead + backup current preview + clear automation
  const leadUpdate: Record<string, any> = {
    revision_status: "processing",
    revision_requested_at: new Date().toISOString(),
    revision_reason: changesSummary,
    revision_count: (lead.revision_count || 0) + 1,
    pending_revision: false,

    // Snapshot current preview to prev_* slots (single-slot backup)
    prev_song_url: lead.preview_song_url || null,
    prev_automation_lyrics: lead.automation_lyrics || null,
    prev_cover_image_url: lead.cover_image_url || null,

    // Clear automation so it regenerates
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

    // Clear preview so it can be re-sent after regen
    preview_song_url: null,
    cover_image_url: null,
    song_title: null,
    preview_sent_at: null,
    follow_up_sent_at: null,
    status: "lead",

    // 12h timer from submission
    earliest_generate_at: new Date(Date.now() + 1 * 60 * 1000).toISOString(),
    target_send_at: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
  };

  // Apply user-edited fields
  for (const f of fieldsChanged) {
    const leadCol = leadFieldMap[f];
    if (leadCol && fields[f] !== undefined && fields[f] !== null) {
      leadUpdate[leadCol] = fields[f];
    }
  }

  await supabase.from("leads").update(leadUpdate).eq("id", lead.id);

  // Trigger automation
  try {
    await fetch(`${supabaseUrl}/functions/v1/automation-trigger`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify({ leadId: lead.id, forceRun: true }),
    });
  } catch (e) {
    console.error("[LEAD-REVISION] trigger error:", e);
  }

  // Activity log
  try {
    await supabase.from("order_activity_log").insert({
      entity_type: "lead",
      entity_id: lead.id,
      event_type: "revision_auto_approved",
      actor: "system",
      details: `Lead revision auto-approved: ${fieldsChanged.length} field(s) — regenerating preview`,
      metadata: { fields_changed: fieldsChanged },
    });
  } catch (_) {}

  return new Response(
    JSON.stringify({
      success: true,
      form_type: "lead_revision",
      revisions_remaining: Math.max(0, (lead.max_revisions || 1) - ((lead.revision_count || 0) + 1)),
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

