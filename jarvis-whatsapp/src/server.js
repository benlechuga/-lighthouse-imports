// Servidor do webhook: recebe mensagens do WhatsApp, chama o Jarvis e responde.

import http from "node:http";
import { pathToFileURL } from "node:url";
import { config, missingConfig } from "./config.js";
import { loadConversation, saveConversation, alreadySeen } from "./store.js";
import { isValidSignature, parseIncoming, sendText, markReadAndTyping, downloadMedia } from "./whatsapp.js";
import { respond, buildUserContent } from "./jarvis.js";

const AVISOS_POR_TIPO = {
  audio: "[SISTEMA] O cliente enviou um áudio. Você ainda não consegue ouvir áudios; peça com gentileza que escreva.",
  video: "[SISTEMA] O cliente enviou um vídeo, que você não consegue assistir.",
  document: "[SISTEMA] O cliente enviou um documento, que você não consegue abrir. Se for importante, transfira para um humano.",
  sticker: "[SISTEMA] O cliente enviou uma figurinha.",
  location: "[SISTEMA] O cliente enviou uma localização.",
  contacts: "[SISTEMA] O cliente enviou um contato.",
  reaction: null, // reações (👍) não precisam de resposta
};

// ---------------------------------------------------------------------------
// Fila por contato: junta mensagens picadas ("oi" / "tudo bem?" / "quanto custa?")
// e garante que um mesmo cliente nunca seja processado em paralelo.
// ---------------------------------------------------------------------------
const pending = new Map(); // waId -> { items, timer, phoneNumberId, lastMessageId }
const running = new Map(); // waId -> Promise

function enqueue(msg) {
  const p = pending.get(msg.from) ?? { items: [], timer: null };
  p.items.push(msg);
  p.phoneNumberId = msg.phoneNumberId;
  p.lastMessageId = msg.id;
  clearTimeout(p.timer);
  p.timer = setTimeout(() => flush(msg.from), config.debounceMs);
  pending.set(msg.from, p);
}

function flush(waId) {
  const p = pending.get(waId);
  if (!p) return;
  pending.delete(waId);
  const prev = running.get(waId) ?? Promise.resolve();
  const next = prev
    .then(() => handleBatch(waId, p))
    .catch((err) => console.error(`Erro ao atender ${waId}:`, err))
    .finally(() => {
      if (running.get(waId) === next) running.delete(waId);
    });
  running.set(waId, next);
}

async function notifyOwner(phoneNumberId, text) {
  if (!config.ownerWhatsapp) {
    console.log("[aviso para o dono — OWNER_WHATSAPP não configurado]\n" + text);
    return;
  }
  try {
    await sendText(phoneNumberId, config.ownerWhatsapp, text);
  } catch (err) {
    // Fora da janela de 24h com o dono, a Meta exige template. Veja o passo a passo.
    console.warn("Não consegui avisar o dono pelo WhatsApp:", err.message, "\n" + text);
  }
}

/** Comandos do dono: #pausar 5511..., #retomar 5511..., #status */
async function handleOwnerCommand(msg) {
  const [cmd, alvo] = msg.text.trim().split(/\s+/);
  const waId = (alvo || "").replace(/\D/g, "");
  const reply = (t) => sendText(msg.phoneNumberId, msg.from, t);

  if (cmd === "#status") {
    return reply(`✅ Jarvis online. Modelo: ${config.claude.model}.`);
  }
  if ((cmd === "#pausar" || cmd === "#retomar") && waId) {
    const conv = await loadConversation(waId);
    conv.pausado = cmd === "#pausar";
    if (!conv.pausado) conv.voltouDoHumano = true;
    await saveConversation(conv);
    return reply(conv.pausado ? `⏸️ Jarvis pausado para +${waId}.` : `▶️ Jarvis voltou a atender +${waId}.`);
  }
  return reply("Comandos: #status · #pausar <número> · #retomar <número>");
}

async function handleBatch(waId, { items, phoneNumberId, lastMessageId }) {
  const conv = await loadConversation(waId);
  conv.nome = items.find((i) => i.nome)?.nome || conv.nome;

  if (conv.pausado) {
    console.log(`(${waId} está com atendimento humano — Jarvis não responde)`);
    await saveConversation(conv);
    return;
  }

  await markReadAndTyping(phoneNumberId, lastMessageId);

  const conteudo = [];
  for (const m of items) {
    const base = { ts: m.timestamp || Date.now(), nome: m.nome };
    if (m.type === "text" || m.type === "button" || m.type === "interactive") {
      conteudo.push({ ...base, text: m.text });
    } else if (m.type === "image" && m.mediaId) {
      try {
        const img = await downloadMedia(m.mediaId);
        const ok = ["image/jpeg", "image/png", "image/gif", "image/webp"].includes(img.mimeType);
        conteudo.push(ok
          ? { ...base, image: img, text: m.caption || "[SISTEMA] O cliente enviou esta imagem." }
          : { ...base, aviso: "[SISTEMA] O cliente enviou uma imagem em formato não suportado." });
      } catch (err) {
        console.warn("Falha ao baixar imagem:", err.message);
        conteudo.push({ ...base, aviso: "[SISTEMA] O cliente enviou uma imagem que não pôde ser carregada." });
      }
    } else if (AVISOS_POR_TIPO[m.type] !== null) {
      conteudo.push({ ...base, aviso: AVISOS_POR_TIPO[m.type] ?? `[SISTEMA] Mensagem do tipo "${m.type}".` });
    }
  }
  if (conteudo.length === 0) return;

  let resposta;
  try {
    resposta = await respond(conv, buildUserContent(conv, conteudo), {
      notifyOwner: (t) => notifyOwner(phoneNumberId, t),
    });
  } catch (err) {
    console.error("Erro no Claude:", err);
    resposta = "Desculpe, tive uma instabilidade aqui. Pode repetir sua última mensagem em instantes? 🙏";
  }
  await saveConversation(conv);
  if (resposta) await sendText(phoneNumberId, waId, resposta);
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > 5_000_000) {
        reject(new Error("payload grande demais"));
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export function createServer() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");

    if (req.method === "GET" && url.pathname === "/") {
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end("Jarvis WhatsApp online");
    }

    // Verificação do webhook (feita pela Meta uma vez, ao cadastrar a URL)
    if (req.method === "GET" && url.pathname === "/webhook") {
      const ok =
        url.searchParams.get("hub.mode") === "subscribe" &&
        url.searchParams.get("hub.verify_token") === config.whatsapp.verifyToken;
      res.writeHead(ok ? 200 : 403, { "Content-Type": "text/plain" });
      return res.end(ok ? url.searchParams.get("hub.challenge") ?? "" : "forbidden");
    }

    if (req.method === "POST" && url.pathname === "/webhook") {
      let raw;
      try {
        raw = await readBody(req);
      } catch {
        res.writeHead(413);
        return res.end();
      }
      if (!config.whatsapp.dryRun && !isValidSignature(raw, req.headers["x-hub-signature-256"])) {
        res.writeHead(401);
        return res.end("assinatura inválida");
      }
      // Responde 200 na hora; a Meta reenvia se demorarmos.
      res.writeHead(200);
      res.end();

      let payload;
      try {
        payload = JSON.parse(raw.toString("utf8"));
      } catch {
        return;
      }
      for (const msg of parseIncoming(payload)) {
        if (alreadySeen(msg.id)) continue;
        if (config.ownerWhatsapp && msg.from === config.ownerWhatsapp && msg.text.startsWith("#")) {
          handleOwnerCommand(msg).catch((e) => console.error("Comando do dono falhou:", e));
          continue;
        }
        enqueue(msg);
      }
      return;
    }

    res.writeHead(404);
    res.end();
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const faltando = missingConfig();
  if (faltando.length) console.warn(`⚠️  Faltam variáveis no .env: ${faltando.join(", ")}`);
  if (config.whatsapp.dryRun) console.warn("⚠️  WHATSAPP_DRY_RUN=true: nada será enviado ao WhatsApp.");
  createServer().listen(config.port, () => {
    console.log(`Jarvis ouvindo em http://localhost:${config.port}  (webhook: /webhook)`);
  });
}
