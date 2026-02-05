const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Build timestamp - updated on each deploy
const BUILD_TIMESTAMP = "2026-02-05T19:45:00.000Z";
const VERSION = "v1.1.0-stable-imports";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    
    // Determine environment from URL
    const isPreview = supabaseUrl.includes("preview") || supabaseUrl.includes("-preview");
    const env = isPreview ? "preview" : "production";

    return new Response(
      JSON.stringify({
        status: "ok",
        buildTimestamp: BUILD_TIMESTAMP,
        env,
        version: VERSION,
        timestamp: new Date().toISOString(),
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  } catch (error) {
    console.error("Health check error:", error);
    return new Response(
      JSON.stringify({ 
        status: "error", 
        error: error instanceof Error ? error.message : "Unknown error" 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
});
