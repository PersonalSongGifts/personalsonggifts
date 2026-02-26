const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-password, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { adminPassword, customerMessage, orders, leads } = await req.json();

    // Validate admin password
    const expectedPassword = Deno.env.get("ADMIN_PASSWORD")?.trim();
    if (!expectedPassword || adminPassword?.trim() !== expectedPassword) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!customerMessage || typeof customerMessage !== "string" || customerMessage.trim().length === 0) {
      return new Response(JSON.stringify({ error: "customerMessage required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build order context
    const orderContext = (orders || []).map((o: any, i: number) => {
      const shortId = o.id?.substring(0, 8) || "unknown";
      return `ORDER #${i + 1} (${shortId}):
  - Created: ${o.created_at || "unknown"}
  - Status: ${o.status || "unknown"}
  - Automation Status: ${o.automation_status || "none"}
  - Occasion: ${o.occasion || "unknown"}, Recipient: ${o.recipient_name || "unknown"}, Genre: ${o.genre || "unknown"}
  - Pricing Tier: ${o.pricing_tier || "unknown"}, Price: $${o.price || 0}
  - Song URL: ${o.song_url || "NOT YET AVAILABLE"}
  - Song Title: ${o.song_title || "not set"}
  - Sent At: ${o.sent_at || "NOT SENT YET"}
  - Target Send At: ${o.target_send_at || "not scheduled"}
  - Delivery Status: ${o.delivery_status || "none"}
  - Delivered At: ${o.delivered_at || "not delivered"}
  - Song Played: ${o.song_played_at ? `Yes (${o.song_play_count || 1}x)` : "Not yet"}
  - Song Downloaded: ${o.song_downloaded_at ? `Yes (${o.song_download_count || 1}x)` : "Not yet"}
  - Customer Name: ${o.customer_name || "unknown"}
  - Customer Email: ${o.customer_email || "unknown"}
  - Notes: ${o.notes || "none"}`;
    }).join("\n\n");

    const leadContext = (leads || []).map((l: any, i: number) => {
      const shortId = l.id?.substring(0, 8) || "unknown";
      return `LEAD #${i + 1} (${shortId}):
  - Captured: ${l.captured_at || "unknown"}
  - Status: ${l.status || "unknown"}
  - Occasion: ${l.occasion || "unknown"}, Recipient: ${l.recipient_name || "unknown"}, Genre: ${l.genre || "unknown"}
  - Preview Song URL: ${l.preview_song_url || "none"}
  - Converted: ${l.converted_at ? "Yes" : "No"}`;
    }).join("\n\n");

    const totalOrders = (orders || []).length;
    const isRepeat = totalOrders > 1;

    const systemPrompt = `You are a customer service assistant for PersonalSongGifts.com, a small business that creates custom, personalized songs as gifts.

${isRepeat ? `⭐ IMPORTANT: This is a REPEAT CUSTOMER with ${totalOrders} orders. Treat them with extra care and appreciation.` : ""}

## Customer Data

${orderContext || "No orders found for this customer."}

${leadContext || "No leads found for this customer."}

## Your Task

You will receive a customer email message. You must:

1. FIRST, check if this is a special case:
   - If the message is just "unsubscribe" or similar → respond ONLY with: "🔍 Assessment: Unsubscribe request\\n⚠️ Flags: None\\n📋 Plan: No response needed\\n\\n---\\n\\n✉️ Draft Response:\\nNo response needed — this is an unsubscribe request. Archive it."
   - If it's a Stripe automated notification (payout, payment received, etc.) → respond ONLY with: "🔍 Assessment: Automated Stripe notification\\n⚠️ Flags: None\\n📋 Plan: No response needed\\n\\n---\\n\\n✉️ Draft Response:\\nNo response needed — this is an automated Stripe notification."
   - If it mentions dispute, chargeback, or Stripe dispute → respond with: "🔍 Assessment: Payment dispute\\n⚠️ Flags: ⚠️ ESCALATE\\n📋 Plan: Do not respond\\n\\n---\\n\\n✉️ Draft Response:\\n⚠️ ESCALATE: This is a payment dispute. Do not respond — flag for owner review."
   - If it contains threats of legal action, BBB complaints, or attorney mentions → respond with: "🔍 Assessment: Legal threat\\n⚠️ Flags: ⚠️ ESCALATE\\n📋 Plan: Owner review required\\n\\n---\\n\\n✉️ Draft Response:\\n⚠️ ESCALATE: This requires owner review before any response."
   - If the customer is abusive or using profanity → prefix with "⚠️ NOTE: Customer tone is hostile. Suggested response is measured. Review before sending." then draft a calm, professional response.
   - If the request seems unreasonable or potentially a scam (claiming non-receipt of a confirmed-delivered song, demanding refund after downloading, pattern of vague repeated complaints) → prefix with "⚠️ FLAG: This request may be unreasonable. Here's why: [reason]. Recommended approach: [approach]." then draft a measured response.

2. For ALL normal cases, output in this EXACT format:

🔍 Assessment: [What kind of email this is — e.g., delivery inquiry, revision request, thank you, pre-purchase question]
⚠️ Flags: [Any concerns — hostile tone, possible scam, escalation needed, or "None"]
📋 Plan: [What the response will do — e.g., "Provide direct song link + suggest checking spam folder"]

---

✉️ Draft Response:
[The actual email draft here]

## Brand Voice Rules (CRITICAL)
- Warm, personal, empathetic, small-business feel
- NEVER mention AI, automation, Suno, Gemini, Kie.ai, or any technical/automated process
- Always frame as "our team" or "our songwriters" — as if real people crafted the song
- Sign off warmly as "The PersonalSongGifts Team"
- Be genuine and caring, not corporate

## Scenario-Specific Instructions
- "Where is my song?" → Check sent_at in order data. If sent, provide the song URL directly and suggest checking spam/promotions folder. If not sent, explain the timeline.
- "Change request" → Check automation_status. If song not yet generated, we can update. If already generated, offer a revision.
- "Not happy with song" → Offer a free revision, ask what specifically they'd like changed. NEVER jump to refund.
- "Refund request" → Acknowledge frustration, offer revision first. If they insist, note this may need owner review.
- "Thank you" / positive feedback → Short warm acknowledgment. Express genuine happiness.
- "Status inquiry" → Provide clear timeline based on order data (created_at, expected_delivery, sent_at).
- "Pre-purchase question" → Standard pricing is $49, Rush is $79 (24hr delivery). Standard delivery is 3-5 business days. Songs are ~2-3 minutes, professionally produced, fully personalized.

## Important
- Keep responses concise but warm
- If a song URL exists in the order data, include it in the response when relevant
- Reference specific order details (recipient name, occasion) to show you know their order`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: customerMessage },
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds in Settings → Workspace → Usage." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("cs-draft-reply error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
