// ============================================
// TECHCRAFT - Cloudflare Worker
// Salva leads no Turso + Envia email via Resend
// ============================================

export default {
  async fetch(request, env) {

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method !== "POST") {
      return new Response("Método não permitido", { status: 405 });
    }

    try {
      const body = await request.json();
      const { name, email, title, description } = body;

      if (!name || !email || !title || !description) {
        return new Response(
          JSON.stringify({ success: false, message: "Preencha todos os campos." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Cria tabela se não existir
      await tursoQuery(env, `
        CREATE TABLE IF NOT EXISTS leads (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          email TEXT NOT NULL,
          title TEXT NOT NULL,
          description TEXT NOT NULL,
          created_at TEXT DEFAULT (datetime('now'))
        )
      `);

      // Salva lead no banco
      await tursoQuery(env,
        "INSERT INTO leads (name, email, title, description) VALUES (?, ?, ?, ?)",
        [name, email, title, description]
      );

      // Envia email de notificação
      await sendEmail({ name, email, title, description });

      return new Response(
        JSON.stringify({ success: true, message: "Orçamento recebido com sucesso!" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );

    } catch (err) {
      console.error(err);
      return new Response(
        JSON.stringify({ success: false, message: "Erro interno. Tente novamente." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  }
};

// ============================================
// Turso — executa query via HTTP API
// ============================================
async function tursoQuery(env, sql, args = []) {
  const response = await fetch(`${env.TURSO_URL}/v2/pipeline`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.TURSO_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      requests: [
        {
          type: "execute",
          stmt: {
            sql,
            args: args.map(v => ({ type: "text", value: String(v) }))
          }
        },
        { type: "close" }
      ]
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Turso error: ${error}`);
  }

  return response.json();
}

// ============================================
// Resend — envia email de notificação
// ============================================
async function sendEmail({ name, email, title, description }) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": "Bearer re_GhckZgYk_FFqvLHBKXxFxPYLruXQdQ7h5", // ← cole sua nova chave aqui
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "TechCraft <onboarding@resend.dev>",
      to: ["pessoacorreiadavy@gmail.com"],
      subject: `🚀 Novo Orçamento: ${title}`,
      html: `
        <div style="font-family:sans-serif; max-width:600px; margin:0 auto;">
          <h2 style="color:#0072ff; border-bottom:2px solid #00f0ff; padding-bottom:8px;">
            🚀 Novo Lead Recebido — TechCraft
          </h2>
          <table style="width:100%; border-collapse:collapse; margin-top:16px;">
            <tr>
              <td style="padding:10px 12px; font-weight:bold; background:#f0f4ff; width:30%;">Nome</td>
              <td style="padding:10px 12px;">${name}</td>
            </tr>
            <tr>
              <td style="padding:10px 12px; font-weight:bold; background:#f0f4ff;">Email</td>
              <td style="padding:10px 12px;">${email}</td>
            </tr>
            <tr>
              <td style="padding:10px 12px; font-weight:bold; background:#f0f4ff;">Projeto</td>
              <td style="padding:10px 12px;">${title}</td>
            </tr>
            <tr>
              <td style="padding:10px 12px; font-weight:bold; background:#f0f4ff; vertical-align:top;">Descrição</td>
              <td style="padding:10px 12px;">${description}</td>
            </tr>
          </table>
          <p style="color:#888; font-size:12px; margin-top:24px;">
            Enviado automaticamente pelo formulário do site TechCraft.
          </p>
        </div>
      `
    })
  });

  if (!response.ok) {
    const error = await response.text();
    console.error("Resend error:", error);
  }
}
