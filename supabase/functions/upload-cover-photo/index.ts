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
    const name = (file.name || "").toLowerCase();
    const isHeic = file.type === "image/heic" || file.type === "image/heif" || name.endsWith(".heic") || name.endsWith(".heif");
    if (isHeic) {
      return new Response(JSON.stringify({ error: "That looks like an iPhone HEIC photo. On your phone, take a screenshot of the photo and upload that, or choose a JPG/PNG — those work perfectly." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // Resolve an effective type: trust the MIME if valid, else fall back to the filename extension
    // (some mobile uploads arrive with an empty or application/octet-stream MIME).
    let effectiveType = allowed.includes(file.type) ? file.type : "";
    if (!effectiveType) {
      if (name.endsWith(".jpg") || name.endsWith(".jpeg")) effectiveType = "image/jpeg";
      else if (name.endsWith(".png")) effectiveType = "image/png";
      else if (name.endsWith(".webp")) effectiveType = "image/webp";
    }
    if (!effectiveType) {
      return new Response(JSON.stringify({ error: "Please upload a JPG, PNG, or WebP photo." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (file.size > 12 * 1024 * 1024) {
      return new Response(JSON.stringify({ error: "File too large. Max 12MB." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const ext = effectiveType === "image/png" ? "png" : effectiveType === "image/webp" ? "webp" : "jpg";
    const shortId = orderId.slice(0, 8).toUpperCase();
    const path = `cover-photos/${shortId}-${Date.now()}.${ext}`;
    const buf = new Uint8Array(await file.arrayBuffer());
    const { error: upErr } = await supabase.storage.from("songs").upload(path, buf, {
      contentType: effectiveType,
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