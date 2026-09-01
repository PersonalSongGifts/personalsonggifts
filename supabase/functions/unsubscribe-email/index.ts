import { createClient } from "npm:@supabase/supabase-js@2.93.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function resolveEmail(req: Request): Promise<string | null> {
  // 1) Query param
  try {
    const url = new URL(req.url);
    const qp = url.searchParams.get("email");
    if (qp) return qp;
  } catch (_) { /* ignore */ }

  if (req.method !== "POST") return null;

  const contentType = (req.headers.get("content-type") || "").toLowerCase();

  // 2) JSON body
  if (contentType.includes("application/json")) {
    try {
      const body = await req.json();
      if (body && typeof body.email === "string") return body.email;
    } catch (_) { /* ignore */ }
    return null;
  }

  // 3) Form-encoded body (RFC 8058 one-click)
  try {
    const raw = await req.text();
    if (raw) {
      const params = new URLSearchParams(raw);
      const formEmail = params.get("email");
      if (formEmail) return formEmail;
    }
  } catch (_) { /* ignore */ }

  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "GET" && req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const isGet = req.method === "GET";

  const htmlPage = (message: string, status: number) =>
    new Response(
      `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Unsubscribe</title></head><body style="margin:0;padding:48px 20px;background:#ffffff;font-family:Arial,Helvetica,sans-serif;text-align:center;"><p style="color:#333333;font-size:18px;line-height:1.6;max-width:520px;margin:0 auto;">${message}</p></body></html>`,
      { status, headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" } }
    );

  try {
    const email = await resolveEmail(req);

    if (!email || typeof email !== "string" || !email.includes("@")) {
      if (isGet) return htmlPage("We couldn't find an email address to unsubscribe.", 400);
      return new Response(
        JSON.stringify({ error: "Valid email required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Upsert into suppression table (idempotent via primary key)
    const { error } = await supabase
      .from("email_suppressions")
      .upsert({ email: email.toLowerCase().trim() }, { onConflict: "email" });

    if (error) {
      console.error("Suppression insert error:", error);
      throw error;
    }

    console.log(`Email suppressed: ${email} (method=${req.method})`);

    if (isGet) {
      return htmlPage("You've been unsubscribed. You won't receive further emails from Personal Song Gifts.", 200);
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Unsubscribe error:", error);
    if (isGet) return htmlPage("Something went wrong. Please email support@personalsonggifts.com.", 500);
    return new Response(
      JSON.stringify({ error: "Server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
