// Simula a Meta enviando uma mensagem para o seu webhook (com assinatura válida).
// Uso: npm run simular -- "Oi, quanto custa?"  [--url http://localhost:3000/webhook] [--de 5511999999999]
// Com WHATSAPP_DRY_RUN=true no servidor, a resposta aparece no terminal do servidor.

import crypto from "node:crypto";

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 ? args.splice(i, 2)[1] : def;
};
const url = opt("--url", `http://localhost:${process.env.PORT || 3000}/webhook`);
const de = opt("--de", "5511999999999");
const texto = args.join(" ") || "Oi! Vocês atendem hoje?";

const payload = {
  object: "whatsapp_business_account",
  entry: [{
    id: "WABA_ID",
    changes: [{
      field: "messages",
      value: {
        messaging_product: "whatsapp",
        metadata: { display_phone_number: "15550000000", phone_number_id: process.env.WHATSAPP_PHONE_NUMBER_ID || "PHONE_NUMBER_ID" },
        contacts: [{ profile: { name: "Cliente Simulado" }, wa_id: de }],
        messages: [{
          from: de,
          id: `wamid.SIM${Date.now()}`,
          timestamp: String(Math.floor(Date.now() / 1000)),
          type: "text",
          text: { body: texto },
        }],
      },
    }],
  }],
};

const body = JSON.stringify(payload);
const headers = { "Content-Type": "application/json" };
if (process.env.WHATSAPP_APP_SECRET) {
  headers["X-Hub-Signature-256"] =
    "sha256=" + crypto.createHmac("sha256", process.env.WHATSAPP_APP_SECRET).update(body).digest("hex");
}

const res = await fetch(url, { method: "POST", headers, body });
console.log(`POST ${url} → ${res.status}`);
