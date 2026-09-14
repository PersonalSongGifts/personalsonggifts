import { createClient } from "npm:@supabase/supabase-js@2.93.1";
import { backupSongFile } from "../_shared/song-backup.ts";
import { submitRevisionRequest } from "../_shared/revision-orchestration.ts";
import { buildPrevSlotPatch, hasRevisionRemaining } from "../_shared/revision-gates.ts";
import { DEFAULT_LEAD_REVISION_EXPIRY_DAYS, leadRevisionLinkActive } from "../_shared/lead-followup.ts";

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
    if (!isPreDelivery && !hasRevisionRemaining(order.revision_count as number, order.max_revisions as number)) {
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

    // === AUTO-APPROVE SETTING (read before any write so the atomic path is chosen first) ===
    const { data: autoApproveSetting } = await supabase
      .from("admin_settings")
      .select("value")
      .eq("key", "revision_auto_approve_enabled")
      .maybeSingle();

    const autoApproveEnabled = autoApproveSetting?.value === "true";
    const shouldAutoApprove = autoApproveEnabled && fieldsChanged.length > 0 && !isEditingPending;

    // A request that changes nothing must never consume the free change or destroy
    // a working song — same rule as the lead path.
    if (fieldsChanged.length === 0) {
      return new Response(
        JSON.stringify({
          error: "no_changes",
          message: "Nothing was changed, so your free change is still available. Please edit at least one detail.",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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
      sender_context: "sender_context",
    };
    const notesFields = ["style_notes", "tempo", "anything_else"];
    const NON_REGEN_FIELDS = new Set(["customer_name", "delivery_email", "recipient_type"]);
    const needsRegen = fieldsChanged.some((f) => !NON_REGEN_FIELDS.has(f));

    if (shouldAutoApprove) {
      // ===== ATOMIC PAID PATH (same shared orchestration as leads) =====
      const orderPatch: Record<string, any> = {
        revision_reason: changesSummary,
        unplayed_resend_sent_at: null,
      };
      for (const field of fieldsChanged) {
        if (notesFields.includes(field)) continue;
        const orderField = fieldMapping[field];
        if (orderField && fields[field] !== undefined && fields[field] !== null) {
          orderPatch[orderField] = fields[field];
        }
      }
      const notesParts: string[] = [];
      for (const nf of notesFields) {
        if (fieldsChanged.includes(nf) && fields[nf]) notesParts.push(`${nf}: ${fields[nf]}`);
      }
      if (notesParts.length > 0) orderPatch.notes = notesParts.join(" | ");

      if (needsRegen) {
        // Durable backup BEFORE the pointers move. Fail closed: without a backup we
        // do not invalidate a working song.
        const { data: orderForBackup } = await supabase
          .from("orders")
          .select("song_url, automation_lyrics, cover_image_url, song_history")
          .eq("id", order.id)
          .maybeSingle();
        if (orderForBackup?.song_url) {
          try {
            const backup = await backupSongFile(
              supabaseUrl,
              supabaseServiceKey,
              supabase,
              "orders",
              order.id,
              orderForBackup as Record<string, unknown>,
            );
            if (!backup.backed_up) throw new Error("backup returned not backed up");
            orderPatch.prev_song_url = backup.prev_song_url ?? null;
            orderPatch.prev_automation_lyrics = backup.prev_automation_lyrics ?? null;
            orderPatch.prev_cover_image_url = backup.prev_cover_image_url ?? null;
            orderPatch.song_history = backup.song_history ?? [];
          } catch (backupErr) {
            console.error("[SUBMIT-REVISION] Backup failed — refusing to invalidate the current song:", backupErr);
            return new Response(
              JSON.stringify({
                error: "backup_failed",
                message: "We couldn't safely save a copy of your current song, so we didn't start the change. Your free change is still available — please try again shortly.",
              }),
              { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }

        orderPatch.automation_status = null;
        orderPatch.automation_task_id = null;
        orderPatch.automation_lyrics = null;
        orderPatch.automation_started_at = null;
        orderPatch.automation_retry_count = 0;
        orderPatch.automation_last_error = null;
        orderPatch.automation_raw_callback = null;
        orderPatch.automation_style_id = null;
        orderPatch.automation_audio_url_source = null;
        orderPatch.generated_at = null;
        orderPatch.inputs_hash = null;
        orderPatch.next_attempt_at = null;
        orderPatch.automation_manual_override_at = null;
        orderPatch.lyrics_language_qa = null;
        orderPatch.lyrics_raw_attempt_1 = null;
        orderPatch.lyrics_raw_attempt_2 = null;
        orderPatch.song_url = null;
        orderPatch.song_title = null;
        orderPatch.cover_image_url = null;
        orderPatch.delivery_status = "pending";
        orderPatch.sent_at = null;
        orderPatch.unplayed_resend_sent_at = null;

        const regenNow = Date.now();
        orderPatch.earliest_generate_at = new Date(regenNow + 1 * 60 * 1000).toISOString();
        orderPatch.target_send_at = new Date(regenNow + 15 * 60 * 1000).toISOString();
      }

      const outcome = await submitRevisionRequest(
        {
          db: supabase as never,
          insertRequest: async (row) => {
            const { data, error } = await supabase.from("revision_requests").insert(row).select("id").maybeSingle();
            if (error || !data?.id) {
              console.error("[SUBMIT-REVISION] revision_requests insert failed, aborting:", error?.message);
              return { id: null, error: error?.message ?? "insert returned no row" };
            }
            return { id: data.id as string, error: null };
          },
          rejectRequest: async (id, reason) => {
            await supabase.from("revision_requests").update({ status: "rejected", rejection_reason: reason.slice(0, 500) }).eq("id", id);
          },
          recordAttentionState: async (reason) => {
            await supabase
              .from("orders")
              .update({ automation_last_error: `[SUBMIT-REVISION] ${reason}`.slice(0, 500) })
              .eq("id", order.id);
          },
          triggerGeneration: async () => {
            if (!needsRegen) return { started: true, error: null };
            const triggerRes = await fetch(`${supabaseUrl}/functions/v1/automation-trigger`, {
              method: "POST",
              headers: { "Content-Type": "application/json", "Authorization": `Bearer ${supabaseServiceKey}` },
              body: JSON.stringify({ orderId: order.id, forceRun: true }),
            });
            if (!triggerRes.ok) {
              const detail = await triggerRes.text();
              return { started: false, error: `trigger ${triggerRes.status}: ${detail}`.slice(0, 300) };
            }
            await triggerRes.text();
            return { started: true, error: null };
          },
        },
        {
          entityType: "order",
          entityId: order.id,
          expectedRevisionCount: order.revision_count ?? null,
          fieldsChanged,
          requestRow: revisionData,
          entityUpdates: orderPatch,
        },
      );

      if (outcome.status >= 400) {
        return new Response(JSON.stringify(outcome.body), {
          status: outcome.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

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
    } else {
      // ===== MANUAL REVIEW QUEUE PATH (unchanged behaviour) =====
      if (isEditingPending) {
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
          const { error: insertError } = await supabase.from("revision_requests").insert(revisionData);
          if (insertError) {
            console.error("Insert revision error:", insertError);
            return new Response(
              JSON.stringify({ error: "Failed to create revision request" }),
              { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }
      } else {
        const { error: insertError } = await supabase.from("revision_requests").insert(revisionData);
        if (insertError) {
          console.error("Insert revision error:", insertError);
          return new Response(
            JSON.stringify({ error: "Failed to create revision request" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      const orderUpdate: Record<string, any> = {
        revision_status: "pending",
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
    }

    // Send confirmation email to customer (plain text for deliverability)
    const brevoApiKey = Deno.env.get("BREVO_API_KEY");
    if (brevoApiKey) {
      const shortId = order.id.substring(0, 8).toUpperCase();
      // Use the freshly-updated delivery email if it changed in this revision
      const newEmail = (fields.delivery_email && typeof fields.delivery_email === "string")
        ? fields.delivery_email.trim()
        : null;
      const confirmationEmail = newEmail || order.customer_email;
      const confirmationName = (fields.customer_name && typeof fields.customer_name === "string")
        ? fields.customer_name
        : order.customer_name;

      // Skip if recipient is on the suppression list
      let isSuppressed = false;
      try {
        const { data: supp } = await supabase
          .from("email_suppressions")
          .select("email")
          .eq("email", confirmationEmail.toLowerCase())
          .maybeSingle();
        isSuppressed = !!supp;
      } catch { /* non-blocking */ }

      const emailSubject = isPreDelivery
        ? `Re: Your Personal Song Gifts Order ${shortId} — Details Updated`
        : `Re: Your Personal Song Gifts Order ${shortId} — Revision Requested`;

      const emailBody = isPreDelivery
        ? `Hi ${confirmationName},\n\nThanks for updating your song details! We've received your changes and our team will incorporate them.\n\nYou should receive your song shortly — usually within an hour or so.\n\nIf you have any questions, just reply to this email.\n\nBest,\nPersonal Song Gifts Team`
        : `Hi ${confirmationName},\n\nThanks for your feedback! We've received your revision request and we're creating a new version of your song now.\n\nYou'll receive your updated song shortly — usually within an hour or so.\n\nIf you have any questions, just reply to this email.\n\nBest,\nPersonal Song Gifts Team`;

      if (isSuppressed) {
        console.log(`[SUBMIT-REVISION] Skipping confirmation — ${confirmationEmail} is suppressed`);
      } else try {
        await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: {
            "api-key": brevoApiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            sender: { name: "Personal Song Gifts", email: "support@personalsonggifts.com" },
            to: [{ email: confirmationEmail, name: confirmationName }],
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
        revisions_remaining: Math.max(0, (order.max_revisions ?? 1) - ((order.revision_count || 0) + (isEditingPending ? 0 : 1))),
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
  if (!hasRevisionRemaining(lead.revision_count as number, lead.max_revisions as number)) {
    return new Response(
      JSON.stringify({ error: "No revisions remaining" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Converted / paid leads must go through the order revision flow — never invalidate
  // assets a customer has already paid for from the free lead path.
  if (lead.order_id || String(lead.status ?? "").toLowerCase() === "converted") {
    return new Response(
      JSON.stringify({ error: "This song has been purchased — please use the link in your delivery email or contact support@personalsonggifts.com." }),
      { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Server-side expiry (the page also gates this; the handler must not trust the client).
  const { data: leadExpirySetting } = await supabase
    .from("admin_settings")
    .select("value")
    .eq("key", "lead_revision_link_expiry_days")
    .maybeSingle();
  const leadExpiryDays = leadExpirySetting ? parseInt(leadExpirySetting.value, 10) : DEFAULT_LEAD_REVISION_EXPIRY_DAYS;
  if (!leadRevisionLinkActive(lead.captured_at, leadExpiryDays)) {
    return new Response(
      JSON.stringify({ error: "This revision link has expired" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Server-side length validation (previously only the order path enforced this)
  for (const f of ["style_notes", "anything_else"]) {
    if (!validateLength(fields[f], 500)) {
      return new Response(
        JSON.stringify({ error: `${f.replace(/_/g, " ")} must be 500 characters or less` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  }
  for (const f of ["recipient_name", "customer_name", "delivery_email", "recipient_type", "occasion", "genre", "singer_preference", "language", "recipient_name_pronunciation", "special_qualities", "favorite_memory", "special_message", "tempo", "sender_context"]) {
    if (!validateLength(fields[f], 250)) {
      return new Response(
        JSON.stringify({ error: `${f.replace(/_/g, " ")} must be 250 characters or less` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
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

  // A request that changes nothing must NOT consume the single free revision and must
  // not invalidate a working song.
  if (fieldsChanged.length === 0) {
    return new Response(
      JSON.stringify({
        error: "no_changes",
        message: "Nothing was changed, so we kept your current song. Edit a detail (pronunciation, story, style or tempo) and submit again.",
      }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const changesSummary = summaryParts.join("; ");

  // Insert revision_request with lead_id
  // Inserted as "pending": ONLY the submission that wins the atomic claim below is
  // promoted to "approved", and generation reads approved rows exclusively. A loser
  // in a concurrent race therefore can never be picked up as the bound brief.
  const revisionData: Record<string, any> = {
    lead_id: lead.id,
    status: "pending",
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
  // Durable, append-only snapshot of EVERY current asset before we invalidate the
  // pointers. prev_* is a single slot and only covers the preview, so the old full
  // song / bonus / cover would otherwise be unrecoverable. Storage objects are never
  // touched here — only the pointers move, so legacy stable paths stay intact.
  const existingHistory = Array.isArray((lead as Record<string, unknown>).song_history)
    ? ((lead as Record<string, unknown>).song_history as unknown[])
    : [];
  const historyEntry = {
    archived_at: new Date().toISOString(),
    reason: "lead_revision",
    revision_count_before: lead.revision_count || 0,
    preview_song_url: lead.preview_song_url || null,
    full_song_url: lead.full_song_url || null,
    automation_lyrics: lead.automation_lyrics || null,
    cover_image_url: lead.cover_image_url || null,
    song_title: lead.song_title || null,
    preview_token: lead.preview_token || null,
    bonus_song_url: lead.bonus_song_url || null,
    bonus_preview_url: lead.bonus_preview_url || null,
    bonus_song_title: lead.bonus_song_title || null,
    bonus_cover_image_url: lead.bonus_cover_image_url || null,
    bonus_style_prompt: lead.bonus_style_prompt || null,
    // Creative inputs as they stood before this revision, so the pre-edit brief is recoverable
    inputs: {
      recipient_name: lead.recipient_name ?? null,
      recipient_name_pronunciation: lead.recipient_name_pronunciation ?? null,
      recipient_type: lead.recipient_type ?? null,
      occasion: lead.occasion ?? null,
      genre: lead.genre ?? null,
      singer_preference: lead.singer_preference ?? null,
      special_qualities: lead.special_qualities ?? null,
      favorite_memory: lead.favorite_memory ?? null,
      special_message: lead.special_message ?? null,
      lyrics_language_code: lead.lyrics_language_code ?? null,
    },
  };

  // Single-slot prev_* backup: only write it when there is something current to back up.
  // On an already-broken row (preview already cleared by an earlier failed revision) the
  // existing prev_* values are the last good copy and must survive.
  const prevSlotPatch = buildPrevSlotPatch(lead as Record<string, string | null>);

  // Apply field updates to lead + backup current preview + clear automation
  // NOTE: revision_status / revision_requested_at / revision_count /
  // pending_revision / bound_revision_request_id are set by
  // claim_revision_binding inside the SAME transaction as this patch.
  const leadUpdate: Record<string, any> = {
    revision_reason: changesSummary,

    // Immutable append-only archive (never overwritten)
    song_history: [...existingHistory, historyEntry],

    ...prevSlotPatch,




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

  // Single shared orchestration for the lead and paid paths: insert the request
  // as pending, then ONE atomic call that applies this patch, the allowance and
  // the accepted-request binding together, then trigger generation with bounded
  // automatic recovery when it does not start.
  const outcome = await submitRevisionRequest(
    {
      db: supabase as never,
      insertRequest: async (row) => {
        const { data, error } = await supabase.from("revision_requests").insert(row).select("id").maybeSingle();
        if (error || !data?.id) {
          console.error("[LEAD-REVISION] revision_requests insert failed, aborting:", error?.message);
          return { id: null, error: error?.message ?? "insert returned no row" };
        }
        return { id: data.id as string, error: null };
      },
      rejectRequest: async (id, reason) => {
        await supabase.from("revision_requests").update({ status: "rejected", rejection_reason: reason.slice(0, 500) }).eq("id", id);
      },
      recordAttentionState: async (reason) => {
        await supabase
          .from("leads")
          .update({ automation_last_error: `[LEAD-REVISION] ${reason}`.slice(0, 500) })
          .eq("id", lead.id);
      },
      triggerGeneration: async () => {
        const triggerRes = await fetch(`${supabaseUrl}/functions/v1/automation-trigger`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${supabaseServiceKey}` },
          body: JSON.stringify({ leadId: lead.id, forceRun: true }),
        });
        if (!triggerRes.ok) {
          const detail = await triggerRes.text();
          return { started: false, error: `trigger ${triggerRes.status}: ${detail}`.slice(0, 300) };
        }
        await triggerRes.text();
        return { started: true, error: null };
      },
    },
    {
      entityType: "lead",
      entityId: lead.id,
      expectedRevisionCount: lead.revision_count ?? null,
      fieldsChanged,
      requestRow: revisionData,
      entityUpdates: leadUpdate,
    },
  );

  if (outcome.status >= 400) {
    return new Response(JSON.stringify(outcome.body), {
      status: outcome.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
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
      revisions_remaining: Math.max(0, (lead.max_revisions ?? 1) - ((lead.revision_count || 0) + 1)),
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

