// Tudo que fala com a WhatsApp Cloud API (oficial da Meta).

import crypto from "node:crypto";
import { config } from "./config.js";

const graph = (p) => `https://graph.facebook.com/${config.whatsapp.graphVersion}/${p}`;

/** Confere a assinatura X-Hub-Signature-256 para garantir que o webhook veio da Meta. */
export function isValidSignature(rawBody, signatureHeader, appSecret = config.whatsapp.appSecret) {
  if (!appSecret || !signatureHeader?.startsWith("sha256=")) return false;
  const expected = crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const received = signatureHeader.slice("sha256=".length);
  if (received.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(received, "hex"), Buffer.from(expected, "hex"));
}

/**
 * Extrai as mensagens recebidas de um payload de webhook.
 * Ignora "statuses" (entregue/lido), que também chegam pelo mesmo webhook.
 */
export function parseIncoming(payload) {
  const out = [];
  for (const entry of payload?.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value ?? {};
      const phoneNumberId = value.metadata?.phone_number_id;
      const names = Object.fromEntries(
        (value.contacts ?? []).map((c) => [c.wa_id, c.profile?.name ?? ""]),
      );
      for (const m of value.messages ?? []) {
        out.push({
          id: m.id,
          from: m.from,
          nome: names[m.from] ?? "",
          phoneNumberId,
          timestamp: Number(m.timestamp) * 1000,
          type: m.type,
          text: m.text?.body ?? m.button?.text ?? m.interactive?.button_reply?.title ??
            m.interactive?.list_reply?.title ?? "",
          caption: m.image?.caption ?? m.document?.caption ?? "",
          mediaId: m.image?.id ?? null,
          mimeType: m.image?.mime_type ?? null,
        });
      }
    }
  }
  return out;
}

async function graphPost(phoneNumberId, body) {
  if (config.whatsapp.dryRun) {
    console.log(`[dry-run] → WhatsApp`, JSON.stringify(body));
    return { dryRun: true };
  }
  const res = await fetch(graph(`${phoneNumberId}/messages`), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.whatsapp.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new Error(`WhatsApp API ${res.status}: ${data?.error?.message ?? "erro desconhecido"}`);
    e.details = data?.error;
    throw e;
  }
  return data;
}

/** Divide textos longos (limite do WhatsApp: 4096 caracteres) em partes. */
export function splitMessage(text, limit = 3900) {
  const parts = [];
  let rest = text.trim();
  while (rest.length > limit) {
    let cut = rest.lastIndexOf("\n", limit);
    if (cut < limit * 0.5) cut = rest.lastIndexOf(" ", limit);
    if (cut <= 0) cut = limit;
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}

export async function sendText(phoneNumberId, to, text) {
  for (const part of splitMessage(text)) {
    await graphPost(phoneNumberId, {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: { body: part, preview_url: false },
    });
  }
}

/** Envia um template aprovado (única forma de falar com alguém fora da janela de 24h). */
export async function sendTemplate(phoneNumberId, to, name, lang, params = []) {
  await graphPost(phoneNumberId, {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name,
      language: { code: lang },
      components: params.length
        ? [{ type: "body", parameters: params.map((text) => ({ type: "text", text })) }]
        : [],
    },
  });
}

/** Marca como lida (dois tiques azuis) e mostra "digitando..." enquanto o Jarvis pensa. */
export async function markReadAndTyping(phoneNumberId, messageId) {
  try {
    await graphPost(phoneNumberId, {
      messaging_product: "whatsapp",
      status: "read",
      message_id: messageId,
      typing_indicator: { type: "text" },
    });
  } catch (err) {
    console.warn("Não consegui marcar como lida:", err.message);
  }
}

/** Baixa uma imagem enviada pelo cliente para o Claude poder "ver". */
export async function downloadMedia(mediaId) {
  const auth = { Authorization: `Bearer ${config.whatsapp.token}` };
  const meta = await fetch(graph(mediaId), { headers: auth }).then((r) => r.json());
  if (!meta?.url) throw new Error("URL da mídia não encontrada");
  const res = await fetch(meta.url, { headers: auth });
  if (!res.ok) throw new Error(`Falha ao baixar mídia: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return { base64: buf.toString("base64"), mimeType: meta.mime_type, bytes: buf.length };
}
