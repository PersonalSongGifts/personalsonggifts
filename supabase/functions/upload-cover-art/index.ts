import { createClient } from "npm:@supabase/supabase-js@2.93.1";
import { logActivity } from "../_shared/activity-log.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-password, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const adminPassword = Deno.env.get("ADMIN_PASSWORD");
    if (!adminPassword) throw new Error("ADMIN_PASSWORD not configured");

    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const formData = await req.formData();

    // Validate admin password
    const providedPassword = (formData.get("adminPassword") as string || "").trim();
    if (!providedPassword || providedPassword !== adminPassword.trim()) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const file = formData.get("file");
    const orderId = formData.get("orderId") as string | null;
    const leadId = formData.get("leadId") as string | null;
    const action = formData.get("action") as string | null; // "upload" or "remove"

    const targetId = orderId || leadId;
    const entityType = orderId ? "order" : "lead";

    if (!targetId) {
      return new Response(
        JSON.stringify({ error: "orderId or leadId required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const shortId = targetId.slice(0, 8).toUpperCase();
    const table = entityType === "order" ? "orders" : "leads";

    // Handle remove action
    if (action === "remove") {
      const { error: updateError } = await supabase
        .from(table)
        .update({ cover_image_url: null })
        .eq("id", targetId);

      if (updateError) throw new Error(`Failed to update: ${updateError.message}`);

      await logActivity(supabase, entityType, targetId, "cover_art_removed", "admin", "Cover art removed");

      return new Response(
        JSON.stringify({ success: true, cover_image_url: null }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Handle upload
    if (!file || !(file instanceof File)) {
      return new Response(
        JSON.stringify({ error: "No file provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate file type
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      return new Response(
        JSON.stringify({ error: "Invalid file type. Allowed: JPEG, PNG, WebP" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      return new Response(
        JSON.stringify({ error: "File too large. Maximum 5MB." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const storagePath = entityType === "lead"
      ? `leads/${shortId}-cover.${ext}`
      : `${shortId}-cover.${ext}`;

    const arrayBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    const { error: uploadError } = await supabase.storage
      .from("songs")
      .upload(storagePath, uint8Array, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

    const { data: urlData } = supabase.storage
      .from("songs")
      .getPublicUrl(storagePath);

    const coverImageUrl = `${urlData.publicUrl}?v=${Date.now()}`;

    const { error: updateError } = await supabase
      .from(table)
      .update({ cover_image_url: coverImageUrl })
      .eq("id", targetId);

    if (updateError) throw new Error(`Failed to update: ${updateError.message}`);

    await logActivity(supabase, entityType, targetId, "cover_art_uploaded", "admin", `Cover art uploaded: ${file.name} (${Math.round(file.size / 1024)}KB)`);

    console.log(`Cover art uploaded for ${entityType} ${shortId}: ${coverImageUrl}`);

    return new Response(
      JSON.stringify({ success: true, cover_image_url: coverImageUrl }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Upload cover art error:", error);
    const message = error instanceof Error ? error.message : "Server error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
