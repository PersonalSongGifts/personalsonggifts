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
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data, error } = await supabase
      .from("promotions")
      .select("*")
      .eq("is_active", true)
      .lte("starts_at", new Date().toISOString())
      .gte("ends_at", new Date().toISOString())
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("Promo query error:", error);
      return new Response(
        JSON.stringify({ active: false }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
            "Cache-Control": "public, max-age=60",
          },
        }
      );
    }

    if (!data) {
      return new Response(
        JSON.stringify({ active: false }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
            "Cache-Control": "public, max-age=60",
          },
        }
      );
    }

    return new Response(
      JSON.stringify({
        active: true,
        slug: data.slug,
        name: data.name,
        standardPriceCents: data.standard_price_cents,
        priorityPriceCents: data.priority_price_cents,
        leadPriceCents: data.lead_price_cents,
        startsAt: data.starts_at,
        endsAt: data.ends_at,
        showBanner: data.show_banner,
        bannerText: data.banner_text,
        bannerEmoji: data.banner_emoji,
        bannerBgColor: data.banner_bg_color,
        bannerTextColor: data.banner_text_color,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=60",
        },
      }
    );
  } catch (err) {
    console.error("get-active-promo error:", err);
    return new Response(
      JSON.stringify({ active: false }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=60",
        },
      }
    );
  }
});
