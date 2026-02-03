import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-password",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Admin auth check
    const adminPassword = Deno.env.get("ADMIN_PASSWORD");
    const providedPassword = req.headers.get("x-admin-password");

    if (!adminPassword || providedPassword !== adminPassword) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    if (req.method === "GET") {
      // Get all settings
      const { data: settings, error } = await supabase
        .from("admin_settings")
        .select("*");

      if (error) {
        throw error;
      }

      // Convert to key-value object
      const settingsMap: Record<string, string> = {};
      settings?.forEach(s => {
        settingsMap[s.key] = s.value;
      });

      return new Response(
        JSON.stringify(settingsMap),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (req.method === "POST") {
      const { key, value } = await req.json();

      if (!key || value === undefined) {
        return new Response(
          JSON.stringify({ error: "key and value required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Upsert setting
      const { error } = await supabase
        .from("admin_settings")
        .upsert({ 
          key, 
          value: String(value),
          updated_at: new Date().toISOString(),
        });

      if (error) {
        throw error;
      }

      return new Response(
        JSON.stringify({ success: true, key, value }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Settings error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
