// ============================================================
//  Minds' Craft — Supabase Edge Function: send-email
//  Proxies email delivery to Resend API (server-side, no CORS issue).
//
//  DEPLOY:
//    supabase functions deploy send-email --no-verify-jwt
//
//  SET SECRET (one time):
//    supabase secrets set RESEND_API_KEY=re_xxxxxxxxxxxx
//
//  Or set it in Supabase Dashboard:
//    Project → Edge Functions → Secrets → Add RESEND_API_KEY
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  try {
    const { to, subject, text, html, from } = await req.json();

    // Validate required fields
    if (!to || !subject || (!text && !html)) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: to, subject, and text or html" }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      return new Response(
        JSON.stringify({ error: "RESEND_API_KEY secret not set in Edge Function" }),
        { status: 500, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    // Call Resend API server-side (no CORS restrictions here)
    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({
        from:    from || "Minds' Craft <onboarding@resend.dev>",
        to:      Array.isArray(to) ? to : [to],
        subject: subject,
        text:    text  || undefined,
        html:    html  || undefined,
      }),
    });

    const resendData = await resendRes.json().catch(() => ({}));

    if (!resendRes.ok) {
      const errMsg = resendData?.message || resendData?.name || `Resend HTTP ${resendRes.status}`;
      console.error("[send-email] Resend error:", resendRes.status, resendData);
      return new Response(
        JSON.stringify({ error: errMsg }),
        { status: resendRes.status, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    console.log("[send-email] Sent OK, Resend ID:", resendData?.id);
    return new Response(
      JSON.stringify({ ok: true, id: resendData?.id }),
      { status: 200, headers: { ...CORS, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("[send-email] Unexpected error:", err);
    return new Response(
      JSON.stringify({ error: err.message || String(err) }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } }
    );
  }
});
