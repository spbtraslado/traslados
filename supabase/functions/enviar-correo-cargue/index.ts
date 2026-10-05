// Supabase Edge Function: enviar-correo-cargue
// Recibe desde la app: { to, subject, text, html, logo_base64 }
// Envía el correo con Resend. Si llega logo_base64, lo adjunta INCRUSTADO
// (inline) con el identificador "logo-spb", que el HTML usa como cid:logo-spb.
//
// Variables secretas (Edge Functions -> Secrets):
//   RESEND_API_KEY  (obligatoria)  llave de Resend
//   CORREO_FROM     (opcional)     remitente, p. ej. "SPB Traslados <avisos@tudominio.com>"
//                                  Si no existe, usa onboarding@resend.dev (solo pruebas)

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }
  if (req.method !== "POST") {
    return json({ error: "Método no permitido" }, 405);
  }

  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) {
    return json({ error: "Falta el secreto RESEND_API_KEY" }, 500);
  }
  const from = Deno.env.get("CORREO_FROM") ||
    "SPB Traslados <onboarding@resend.dev>";

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "El cuerpo no es JSON válido" }, 400);
  }

  const to = String(payload.to || "").trim();
  const subject = String(payload.subject || "").trim();
  const text = String(payload.text || "");
  const html = String(payload.html || "");
  const logoBase64 = String(payload.logo_base64 || "").trim();

  if (!to || !subject || (!text && !html)) {
    return json({ error: "Faltan campos: to, subject y text/html" }, 400);
  }

  // Varios destinatarios separados por coma o punto y coma
  const destinatarios = to.split(/[;,]/).map((s) => s.trim()).filter(Boolean);

  const mensaje: Record<string, unknown> = {
    from,
    to: destinatarios,
    subject,
    text,
  };
  if (html) mensaje.html = html;

  if (logoBase64) {
    mensaje.attachments = [
      {
        filename: "logo-spb.png",
        content: logoBase64,
        content_type: "image/png",
        content_id: "logo-spb",
      },
    ];
  }

  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(mensaje),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return json({ error: "Resend rechazó el envío", detalle: data }, 502);
    }
    return json({ ok: true, id: (data as { id?: string }).id || null });
  } catch (e) {
    return json({ error: "No se pudo contactar a Resend", detalle: String(e) }, 500);
  }
});
