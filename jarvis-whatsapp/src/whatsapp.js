// Tudo que fala com a WhatsApp Cloud API (oficial da Meta).

import crypto from "node:crypto";
import { config } from "./config.js";

export const graph = (p) => `${config.whatsapp.graphBase}/${config.whatsapp.graphVersion}/${p}`;

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

/**
 * Mensagens que a EMPRESA mandou pelo app WhatsApp Business do celular (coexistência):
 * chegam no campo "smb_message_echoes". Não são do cliente e nunca geram resposta.
 */
export function parseEchoes(payload) {
  const out = [];
  for (const entry of payload?.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value ?? {};
      for (const m of value.message_echoes ?? []) {
        out.push({
          id: m.id,
          to: String(m.to ?? "").replace(/\D/g, ""),
          phoneNumberId: value.metadata?.phone_number_id,
          timestamp: Number(m.timestamp) * 1000,
          type: m.type,
        });
      }
    }
  }
  return out;
}

/** Lista os campos (field) de um webhook, ex.: ["messages"], ["history"], ["account_update"]. */
export function webhookFields(payload) {
  const fields = [];
  for (const entry of payload?.entry ?? []) {
    for (const change of entry.changes ?? []) if (change.field) fields.push({ field: change.field, wabaId: entry.id, value: change.value });
  }
  return fields;
}

// IDs das mensagens que o próprio Jarvis enviou pela API. Se a Meta um dia mandar
// eco delas, não confundimos com um humano respondendo pelo celular.
const enviadasPelaApi = new Map();
export function enviadaPelaApi(id) {
  return enviadasPelaApi.has(id);
}
function registrarEnvio(data) {
  const id = data?.messages?.[0]?.id;
  if (!id) return;
  const agora = Date.now();
  for (const [k, t] of enviadasPelaApi) if (agora - t > 24 * 3600_000) enviadasPelaApi.delete(k);
  enviadasPelaApi.set(id, agora);
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
  registrarEnvio(data);
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

/**
 * Celular brasileiro com 12 dígitos (55 + DDD + 8) ganha o nono dígito.
 * O webhook entrega números antigos sem o 9 (ex.: 554796056084), mas a lista de
 * destinatários de teste da Meta e o OWNER_WHATSAPP costumam ter o 9: sem isso o
 * envio falha com o erro 131030.
 */
export function numeroBR(waId) {
  const n = String(waId || "").replace(/\D/g, "");
  return /^55\d{2}[6-9]\d{7}$/.test(n) ? n.slice(0, 4) + "9" + n.slice(4) : n;
}

export async function sendText(phoneNumberId, to, text) {
  for (const part of splitMessage(text)) {
    await graphPost(phoneNumberId, {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: numeroBR(to),
      type: "text",
      text: { body: part, preview_url: false },
    });
  }
}

/** Envia um template aprovado (única forma de falar com alguém fora da janela de 24h). */
export async function sendTemplate(phoneNumberId, to, name, lang, params = []) {
  await graphPost(phoneNumberId, {
    messaging_product: "whatsapp",
    to: numeroBR(to),
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
