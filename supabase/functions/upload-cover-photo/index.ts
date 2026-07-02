import { createClient } from "npm:@supabase/supabase-js@2.93.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  try {
    const form = await req.formData();
    const file = form.get("file");
    const orderId = (form.get("orderId") as string | null) || "unknown";
    if (!file || !(file instanceof File)) {
      return new Response(JSON.stringify({ error: "No file" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.type)) {
      return new Response(JSON.stringify({ error: "Invalid file type. JPEG/PNG/WebP only." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (file.size > 8 * 1024 * 1024) {
      return new Response(JSON.stringify({ error: "File too large. Max 8MB." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const shortId = orderId.slice(0, 8).toUpperCase();
    const path = `cover-photos/${shortId}-${Date.now()}.${ext}`;
    const buf = new Uint8Array(await file.arrayBuffer());
    const { error: upErr } = await supabase.storage.from("songs").upload(path, buf, {
      contentType: file.type,
      upsert: true,
    });
    if (upErr) throw new Error(`Upload failed: ${upErr.message}`);
    const { data: urlData } = supabase.storage.from("songs").getPublicUrl(path);
    return new Response(JSON.stringify({ url: urlData.publicUrl, path }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});