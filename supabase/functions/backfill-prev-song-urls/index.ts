// One-shot backfill: for orders that were revised but lost their prev_song_url
// snapshot (because customer-side auto-approve never wrote it), check if a
// "<basename>-prev.mp3" file already exists in the songs bucket. If so, point
// prev_song_url at it so the admin "Restore Previous Version" button works.
//
// Safe: never touches song_url, never deletes/copies audio. Read + UPDATE only.
// Call with POST { dryRun: true } first to preview, then { dryRun: false }.

import { createClient } from "npm:@supabase/supabase-js@2.93.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-password",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const adminPassword = Deno.env.get("ADMIN_PASSWORD");
  if (req.headers.get("x-admin-password") !== adminPassword) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const body = await req.json().catch(() => ({}));
  const dryRun = body?.dryRun !== false; // default true

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const bucketBase = `${supabaseUrl}/storage/v1/object/public/songs/`;

  const { data: candidates, error } = await supabase
    .from("orders")
    .select("id, song_url")
    .gte("revision_count", 1)
    .is("prev_song_url", null)
    .not("song_url", "is", null);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const results: Array<{ id: string; status: string; prevUrl?: string }> = [];
  let backfilled = 0;

  for (const o of candidates ?? []) {
    const songUrl = o.song_url as string;
    if (!songUrl.includes(bucketBase)) {
      results.push({ id: o.id, status: "skip:non-bucket-url" });
      continue;
    }
    const path = songUrl.slice(songUrl.indexOf(bucketBase) + bucketBase.length).split("?")[0];
    const lastDot = path.lastIndexOf(".");
    const ext = lastDot !== -1 ? path.slice(lastDot) : ".mp3";
    const basePath = lastDot !== -1 ? path.slice(0, lastDot) : path;
    const prevPath = `${basePath}-prev${ext}`;

    // Check existence with a HEAD request to the public URL
    const prevUrl = `${supabaseUrl}/storage/v1/object/public/songs/${prevPath}`;
    let exists = false;
    try {
      const head = await fetch(prevUrl, { method: "HEAD" });
      exists = head.ok;
    } catch (_) {
      exists = false;
    }
    if (!exists) {
      results.push({ id: o.id, status: "skip:no-prev-file" });
      continue;
    }

    if (dryRun) {
      results.push({ id: o.id, status: "would-backfill", prevUrl });
    } else {
      const { error: upErr } = await supabase
        .from("orders")
        .update({ prev_song_url: prevUrl })
        .eq("id", o.id);
      if (upErr) {
        results.push({ id: o.id, status: `error:${upErr.message}` });
      } else {
        results.push({ id: o.id, status: "backfilled", prevUrl });
        backfilled++;
      }
    }
  }

  return new Response(JSON.stringify({
    dryRun, total: candidates?.length ?? 0, backfilled, results,
  }, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});