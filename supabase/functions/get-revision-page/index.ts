import { createClient } from "npm:@supabase/supabase-js@2.93.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");

    if (!token) {
      return new Response(
        JSON.stringify({ error: "Token is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check if feature is enabled
    const { data: enabledSetting } = await supabase
      .from("admin_settings")
      .select("value")
      .eq("key", "self_service_revisions_enabled")
      .maybeSingle();

    if (!enabledSetting || enabledSetting.value !== "true") {
      return new Response(
        JSON.stringify({ status: "disabled", message: "Self-service revisions are not currently available." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Look up order by revision_token
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("id, created_at, price_cents, status, sent_at, revision_token, revision_count, max_revisions, revision_requested_at, revision_status, recipient_name, customer_name, customer_email, recipient_type, occasion, genre, singer_preference, lyrics_language_code, recipient_name_pronunciation, special_qualities, favorite_memory, special_message, pricing_tier, sender_context")
      .eq("revision_token", token)
      .maybeSingle();

    if (orderError) {
      console.error("DB error:", orderError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch order" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // If we found an order with a confirmed payment, handle the order flow
    if (order && order.price_cents !== null && order.price_cents !== undefined) {
      return handleOrderRequest(supabase, order);
    }

    // Otherwise try to find a lead with this revision_token
    const { data: lead } = await supabase
      .from("leads")
      .select("id, captured_at, status, revision_token, revision_count, max_revisions, revision_requested_at, revision_status, preview_song_url, preview_sent_at, recipient_name, customer_name, email, recipient_type, occasion, genre, singer_preference, lyrics_language_code, recipient_name_pronunciation, special_qualities, favorite_memory, special_message")
      .eq("revision_token", token)
      .maybeSingle();

    if (lead) {
      return handleLeadRequest(supabase, lead);
    }

    return new Response(
      JSON.stringify({ status: "not_found", message: "This page could not be found." }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("get-revision-page error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function handleOrderRequest(supabase: ReturnType<typeof createClient>, order: any): Promise<Response> {
    // Check token expiry
    const { data: expirySetting } = await supabase
      .from("admin_settings")
      .select("value")
      .eq("key", "revision_link_expiry_days")
      .maybeSingle();

    const expiryDays = expirySetting ? parseInt((expirySetting as any).value, 10) : 90;
    const createdAt = new Date(order.created_at);
    const expiryDate = new Date(createdAt.getTime() + expiryDays * 24 * 60 * 60 * 1000);

    if (new Date() > expiryDate) {
      const completedDate = order.sent_at
        ? new Date(order.sent_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
        : new Date(order.created_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
      return new Response(
        JSON.stringify({
          status: "expired",
          message: `This order was completed on ${completedDate}. If you need further help, please contact support@personalsonggifts.com.`,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Status failed/needs_review
    if (order.status === "failed" || order.status === "needs_review") {
      return new Response(
        JSON.stringify({
          status: "under_review",
          message: "Your order is being reviewed by our team. Please contact support@personalsonggifts.com for assistance.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Pending revision — return order data + existing pending revision for editing
    if (order.revision_status === "pending") {
      const { data: pendingRevision } = await supabase
        .from("revision_requests")
        .select("*")
        .eq("order_id", order.id)
        .eq("status", "pending")
        .order("submitted_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const requestedDate = order.revision_requested_at
        ? new Date(order.revision_requested_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
        : "recently";

      const isPreDelivery = !order.sent_at;
      const formType = isPreDelivery ? "pre_delivery_update" : "post_delivery_redo";

      return new Response(
        JSON.stringify({
          status: "pending_revision",
          message: `You already submitted a revision request on ${requestedDate}. Our team is reviewing it. If you need to update your request, you can make changes below.`,
          form_type: formType,
          revisions_remaining: Math.max(0, (order.max_revisions || 1) - (order.revision_count || 0)),
          existing_revision: pendingRevision,
          order: buildOrderData(order),
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Processing
    if (order.revision_status === "processing") {
      const { data: delaySetting } = await supabase
        .from("admin_settings")
        .select("value")
        .eq("key", order.pricing_tier === "priority" ? "revision_delivery_delay_hours_rush" : "revision_delivery_delay_hours")
        .maybeSingle();

      const hours = delaySetting ? parseInt((delaySetting as any).value, 10) : 12;

      return new Response(
        JSON.stringify({
          status: "processing",
          message: `Your revised song is currently being created! You'll receive it within ${hours} hours.`,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Used all revisions (post-delivery only)
    if (order.sent_at && (order.revision_count || 0) >= (order.max_revisions || 1)) {
      return new Response(
        JSON.stringify({
          status: "no_revisions_left",
          message: "You've used your free revision. If you need further changes, please contact us at support@personalsonggifts.com and we'll be happy to help.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Post-delivery redo
    if (order.sent_at) {
      return new Response(
        JSON.stringify({
          status: "form",
          form_type: "post_delivery_redo",
          revisions_remaining: Math.max(0, (order.max_revisions || 1) - (order.revision_count || 0)),
          order: buildOrderData(order),
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Pre-delivery update
    return new Response(
      JSON.stringify({
        status: "form",
        form_type: "pre_delivery_update",
        revisions_remaining: Math.max(0, (order.max_revisions || 1) - (order.revision_count || 0)),
        order: buildOrderData(order),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
}

async function handleLeadRequest(supabase: ReturnType<typeof createClient>, lead: any): Promise<Response> {
  // Expiry: 90 days from capture (same default as orders)
  const { data: expirySetting } = await supabase
    .from("admin_settings")
    .select("value")
    .eq("key", "revision_link_expiry_days")
    .maybeSingle();
  const expiryDays = expirySetting ? parseInt((expirySetting as any).value, 10) : 90;
  const expiryDate = new Date(new Date(lead.captured_at).getTime() + expiryDays * 24 * 60 * 60 * 1000);
  if (new Date() > expiryDate) {
    return new Response(
      JSON.stringify({ status: "expired", message: "This preview link has expired. Please contact support@personalsonggifts.com." }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  if (lead.status === "converted") {
    return new Response(
      JSON.stringify({ status: "not_found", message: "This page could not be found." }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Currently regenerating
  if (lead.revision_status === "processing") {
    return new Response(
      JSON.stringify({
        status: "processing",
        message: "Your updated 45-second preview is currently being created! You'll receive a new email within ~12 hours.",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Used all revisions
  if ((lead.revision_count || 0) >= (lead.max_revisions || 1)) {
    return new Response(
      JSON.stringify({
        status: "no_revisions_left",
        message: "You've used your free revision. If you need further changes, please contact us at support@personalsonggifts.com.",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  return new Response(
    JSON.stringify({
      status: "form",
      form_type: "lead_revision",
      revisions_remaining: Math.max(0, (lead.max_revisions || 1) - (lead.revision_count || 0)),
      order: buildLeadData(lead),
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

function buildOrderData(order: any) {
  return {
    id: order.id,
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
    pricing_tier: order.pricing_tier,
    sender_context: order.sender_context || "",
  };
}

function buildLeadData(lead: any) {
  return {
    id: lead.id,
    recipient_name: lead.recipient_name,
    customer_name: lead.customer_name,
    delivery_email: lead.email,
    recipient_type: lead.recipient_type,
    occasion: lead.occasion,
    genre: lead.genre,
    singer_preference: lead.singer_preference,
    language: lead.lyrics_language_code,
    recipient_name_pronunciation: lead.recipient_name_pronunciation || "",
    special_qualities: lead.special_qualities,
    favorite_memory: lead.favorite_memory,
    special_message: lead.special_message || "",
    pricing_tier: "lead",
    sender_context: "",
  };
}
