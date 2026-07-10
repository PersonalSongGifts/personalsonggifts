import { createClient } from "npm:@supabase/supabase-js@2.93.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BROWSER_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

function extractImageUrl(record: unknown): string | null {
  const r = record as Record<string, unknown> | null;
  if (!r) return null;
  const candidates: unknown[] = [
    r.resultUrls, r.resultUrl, r.imageUrl, r.imageUrls, r.output, r.outputUrl,
    (r.response as Record<string, unknown> | undefined)?.resultUrls,
    (r.response as Record<string, unknown> | undefined)?.imageUrl,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.startsWith("http")) return c;
    if (Array.isArray(c)) {
      const first = c.find((x) => typeof x === "string" && (x as string).startsWith("http"));
      if (first) return first as string;
    }
  }
  // deep search JSON stringify fallback
  try {
    const s = JSON.stringify(r);
    const m = s.match(/https?:\/\/[^"\s]+\.(?:png|jpg|jpeg|webp)/i);
    if (m) return m[0];
  } catch { /* ignore */ }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const KIE_API_KEY = Deno.env.get("KIE_API_KEY");
    if (!KIE_API_KEY) throw new Error("KIE_API_KEY not configured");
    const body = await req.json();
    const { orderId } = body;
    const variant: "main" | "bonus" = body.variant === "bonus" ? "bonus" : "main";
    if (!orderId) {
      return new Response(JSON.stringify({ error: "orderId required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    // Resolve short 8-char IDs (delivery emails link to /song/{shortId}) → full uuid.
    let resolvedOrderId: string = orderId;
    if (typeof orderId === "string" && orderId.length === 8) {
      const { data: shortMatches, error: shortErr } = await supabase
        .rpc("find_orders_by_short_id", {
          short_id: orderId,
          status_filter: null,
          require_song_url: false,
          max_results: 2,
        });
      if (shortErr) {
        console.error("[check-album-cover] short id resolve error", shortErr);
      }
      if (!shortMatches || shortMatches.length === 0) {
        return new Response(JSON.stringify({ error: "Order not found", status: "failed" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (shortMatches.length === 1) {
        resolvedOrderId = shortMatches[0].id as string;
      } else {
        return new Response(JSON.stringify({ error: "Ambiguous ID", status: "failed" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }
    const cols = variant === "bonus"
      ? { taskId: "album_cover_bonus_task_id", status: "album_cover_bonus_status", url: "album_cover_bonus_url" }
      : { taskId: "album_cover_task_id", status: "album_cover_status", url: "album_cover_url" };
    const { data: order } = await supabase
      .from("orders")
      .select(`id, ${cols.taskId}, ${cols.status}, ${cols.url}`)
      .eq("id", resolvedOrderId)
      .maybeSingle();
    if (!order) {
      return new Response(JSON.stringify({ error: "Order not found", status: "failed" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const curStatus = (order as Record<string, unknown>)[cols.status] as string | null;
    const curUrl = (order as Record<string, unknown>)[cols.url] as string | null;
    const curTaskId = (order as Record<string, unknown>)[cols.taskId] as string | null;
    if (curStatus === "ready" && curUrl) {
      return new Response(JSON.stringify({ status: "ready", url: curUrl }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const taskId = curTaskId;
    if (!taskId) {
      return new Response(JSON.stringify({ status: curStatus || "none" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const infoRes = await fetch(`https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`, {
      headers: { "Authorization": `Bearer ${KIE_API_KEY}` },
    });
    const infoJson = await infoRes.json().catch(() => ({}));
    if (!infoRes.ok) {
      console.error("[check-album-cover] info error", infoRes.status, infoJson);
      return new Response(JSON.stringify({ status: "generating" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = (infoJson?.data ?? infoJson) as Record<string, unknown>;
    const statusStr = String(
      data?.status ?? data?.state ?? data?.successFlag ?? ""
    ).toLowerCase();
    const isSuccess = statusStr === "success" || statusStr === "succeeded" || statusStr === "completed" || statusStr === "1";
    const isFailed = statusStr === "fail" || statusStr === "failed" || statusStr === "error" || statusStr === "2" || statusStr === "3";

    if (isSuccess) {
      let imgUrl: string | null = null;
      try {
        const parsed = JSON.parse(String((data as Record<string, unknown>).resultJson ?? "{}"));
        imgUrl = (parsed?.resultUrls?.[0] as string) ?? null;
      } catch { /* ignore */ }
      if (!imgUrl) imgUrl = extractImageUrl(data);
      if (!imgUrl) {
        console.error("[check-album-cover] success but no image url", data);
        return new Response(JSON.stringify({ status: "generating" }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Download from Kie with a browser UA (default fetch UA gets 403)
      const dlRes = await fetch(imgUrl, { headers: { "User-Agent": BROWSER_UA, "Accept": "image/*" } });
      if (!dlRes.ok) {
        console.error("[check-album-cover] download failed", dlRes.status);
        return new Response(JSON.stringify({ status: "generating" }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const bytes = new Uint8Array(await dlRes.arrayBuffer());
      const ct = dlRes.headers.get("content-type") || "image/png";
      const ext = ct.includes("webp") ? "webp" : ct.includes("jpeg") || ct.includes("jpg") ? "jpg" : "png";
      const shortId = String(order.id).slice(0, 8).toUpperCase();
      const path = variant === "bonus"
        ? `cover-photos/${shortId}-ai-bonus-${Date.now()}.${ext}`
        : `cover-photos/${shortId}-ai-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("songs").upload(path, bytes, {
        contentType: ct, upsert: true,
      });
      if (upErr) throw new Error(`Store failed: ${upErr.message}`);
      const { data: pub } = supabase.storage.from("songs").getPublicUrl(path);
      const storedUrl = `${pub.publicUrl}?v=${Date.now()}`;
      await supabase.from("orders").update({
        [cols.url]: storedUrl,
        [cols.status]: "ready",
      }).eq("id", order.id);
      return new Response(JSON.stringify({ status: "ready", url: storedUrl }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (isFailed) {
      await supabase.from("orders").update({ [cols.status]: "failed" }).eq("id", order.id);
      return new Response(JSON.stringify({ status: "failed", detail: data }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ status: "generating" }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error";
    console.error("[check-album-cover] error", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});