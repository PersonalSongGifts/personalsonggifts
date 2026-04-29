import { createClient } from "npm:@supabase/supabase-js@2.93.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const previewToken = url.searchParams.get("token");

    if (!previewToken || previewToken.length < 16) {
      return new Response(JSON.stringify({ error: "Invalid preview token" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: lead, error } = await supabase
      .from("leads")
      .select("id, recipient_name, recipient_type, occasion, genre, preview_song_url, cover_image_url, song_title, status, preview_opened_at, order_id")
      .eq("preview_token", previewToken)
      .single();

    if (error || !lead) {
      console.error("Lead not found:", error);
      return new Response(JSON.stringify({ error: "Preview not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (lead.status === "converted") {
      return new Response(JSON.stringify({
        error: "This song has already been purchased",
        converted: true,
        orderId: lead.order_id,
      }), { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (!lead.preview_song_url) {
      return new Response(JSON.stringify({ error: "Preview not ready yet" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (!lead.preview_opened_at) {
      await supabase.from("leads").update({ preview_opened_at: new Date().toISOString() }).eq("id", lead.id);
      console.log(`Lead ${lead.id} preview opened for first time`);
    }

    // Generic targeted-promo discovery:
    //  1) Find ALL `*_sent` activity log entries for this lead.
    //  2) Cross-reference with active targeted promotions.
    //  3) Pick the most recent active one (by starts_at desc).
    let targetedPromoSlug: string | null = null;
    let targetedPromoEligible = false;
    let targetedPromoExpired = false;
    let targetedPromoPriceCents: number | null = null;
    let targetedPromoEndsAt: string | null = null;

    {
      // Get all targeted promos (small table, fine to fetch all)
      const { data: targetedPromos } = await supabase
        .from("promotions")
        .select("slug, is_active, starts_at, ends_at, lead_price_cents, targeted")
        .eq("targeted", true);

      const targetedSlugs = (targetedPromos || []).map(p => (p as { slug: string }).slug);
      if (targetedSlugs.length > 0) {
        const sentEvents = targetedSlugs.map(s => `${s}_sent`);
        const { data: logs } = await supabase
          .from("order_activity_log")
          .select("event_type, created_at")
          .eq("entity_type", "lead")
          .eq("entity_id", lead.id)
          .in("event_type", sentEvents)
          .order("created_at", { ascending: false });

        const sentSlugs = new Set<string>();
        for (const l of (logs || [])) {
          const ev = (l as { event_type: string }).event_type;
          const slug = ev.endsWith("_sent") ? ev.slice(0, -"_sent".length) : null;
          if (slug) sentSlugs.add(slug);
        }

        if (sentSlugs.size > 0) {
          const now = new Date();
          // Pick the most-recently-started ACTIVE promo this lead has received.
          // If multiple active, prefer the one with the latest starts_at.
          const candidates = (targetedPromos || [])
            .filter(p => sentSlugs.has((p as { slug: string }).slug))
            .map(p => p as { slug: string; is_active: boolean; starts_at: string; ends_at: string; lead_price_cents: number });

          // Sort by starts_at desc
          candidates.sort((a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime());

          // Find first active+unexpired
          const live = candidates.find(p => {
            const starts = new Date(p.starts_at);
            const ends = new Date(p.ends_at);
            return p.is_active && now >= starts && now <= ends;
          });

          if (live) {
            targetedPromoSlug = live.slug;
            targetedPromoEligible = true;
            targetedPromoPriceCents = live.lead_price_cents;
            targetedPromoEndsAt = live.ends_at;
          } else {
            // Most-recent received-but-expired (so frontend can show "sale ended" msg)
            const expired = candidates.find(p => new Date(p.ends_at) < now);
            if (expired) {
              targetedPromoSlug = expired.slug;
              targetedPromoExpired = true;
              targetedPromoPriceCents = expired.lead_price_cents;
              targetedPromoEndsAt = expired.ends_at;
            }
          }
        }
      }
    }

    // Backwards-compat aliases for any cached/old frontend bundle that still reads `flash20*`.
    // These fields will be populated only if the resolved promo is flash20 itself.
    const isFlash20 = targetedPromoSlug === "flash20";
    const flash20Eligible = isFlash20 && targetedPromoEligible;
    const flash20Expired = isFlash20 && targetedPromoExpired;
    const flash20PriceCents = isFlash20 ? targetedPromoPriceCents : null;
    const flash20EndsAt = isFlash20 ? targetedPromoEndsAt : null;

    // Sitewide (non-targeted) active promo — applies to ALL leads as the default lead price
    // when no targeted promo is in effect. Prevents preview from showing the bare $49.99
    // fallback during sitewide sales (e.g., Mother's Day at $29.99).
    let sitewidePromoSlug: string | null = null;
    let sitewidePromoLeadPriceCents: number | null = null;
    let sitewidePromoEndsAt: string | null = null;
    {
      const nowIso = new Date().toISOString();
      const { data: sitewide } = await supabase
        .from("promotions")
        .select("slug, lead_price_cents, ends_at")
        .eq("is_active", true)
        .eq("targeted", false)
        .lte("starts_at", nowIso)
        .gte("ends_at", nowIso)
        .order("starts_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (sitewide) {
        sitewidePromoSlug = (sitewide as { slug: string }).slug;
        sitewidePromoLeadPriceCents = (sitewide as { lead_price_cents: number }).lead_price_cents;
        sitewidePromoEndsAt = (sitewide as { ends_at: string }).ends_at;
      }
    }

    return new Response(JSON.stringify({
      recipientName: lead.recipient_name,
      recipientType: lead.recipient_type,
      occasion: lead.occasion,
      genre: lead.genre,
      previewUrl: lead.preview_song_url,
      coverImageUrl: lead.cover_image_url,
      songTitle: lead.song_title,

      // New generic fields (preferred)
      targetedPromoSlug,
      targetedPromoEligible,
      targetedPromoExpired,
      targetedPromoPriceCents,
      targetedPromoEndsAt,

      // Sitewide promo (applies as default lead price floor when no targeted promo is in effect)
      sitewidePromoSlug,
      sitewidePromoLeadPriceCents,
      sitewidePromoEndsAt,

      // Back-compat
      flash20Eligible,
      flash20Expired,
      flash20PriceCents,
      flash20EndsAt,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("Get lead preview error:", error);
    return new Response(JSON.stringify({ error: "Server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
