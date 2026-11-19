// Servidor do webhook: recebe mensagens do WhatsApp, chama o Jarvis e responde.

import fs from "node:fs";
import http from "node:http";
import { pathToFileURL } from "node:url";
import { config, missingConfig } from "./config.js";
import { loadConversation, saveConversation, alreadySeen } from "./store.js";
import { isValidSignature, numeroBR, parseIncoming, parseEchoes, webhookFields, enviadaPelaApi, sendText, sendTemplate, markReadAndTyping, downloadMedia } from "./whatsapp.js";
import { respond, buildUserContent } from "./jarvis.js";
import { faltaConfigConectar, chaveValida, paginaConectar, finalizarConexao } from "./conectar.js";

const PAGINA_PRIVACIDADE = fs.readFileSync(new URL("./privacidade.html", import.meta.url), "utf8");

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
  emSerie(waId, () => handleBatch(waId, p), `Erro ao atender ${waId}:`);
}

/** Executa `fn` depois de tudo o que já está na fila deste contato (evita gravações cruzadas). */
function emSerie(waId, fn, erroMsg = `Erro no contato ${waId}:`) {
  const prev = running.get(waId) ?? Promise.resolve();
  const next = prev
    .then(fn)
    .catch((err) => console.error(erroMsg, err))
    .finally(() => {
      if (running.get(waId) === next) running.delete(waId);
    });
  running.set(waId, next);
  return next;
}

// ---------------------------------------------------------------------------
// Coexistência: quando a equipe responde um cliente pelo app WhatsApp Business do
// celular, chega um "eco" (smb_message_echoes). O Jarvis entende que um humano
// assumiu e fica em silêncio com aquele cliente por HUMANO_PAUSA_HORAS.
// ---------------------------------------------------------------------------
const pausaHumano = new Map(); // waId -> até quando (ms), vale já, antes de gravar em disco

/** O mesmo celular brasileiro pode chegar com ou sem o nono dígito. */
export function variantesBR(waId) {
  const n = String(waId || "").replace(/\D/g, "");
  if (/^55\d{2}9\d{8}$/.test(n)) return [n, n.slice(0, 4) + n.slice(5)];
  if (/^55\d{2}[6-9]\d{7}$/.test(n)) return [n, numeroBR(n)];
  return n ? [n] : [];
}

function pausadoPorHumanoAte(waId) {
  return Math.max(0, ...variantesBR(waId).map((v) => pausaHumano.get(v) ?? 0));
}

function registrarHumano(echo) {
  if (!echo.to) {
    console.log("[eco] mensagem enviada pelo celular sem número do cliente (só BSUID); ignorada");
    return;
  }
  const ate = Date.now() + config.humanoPausaHoras * 3600_000;
  const variantes = variantesBR(echo.to);
  for (const v of variantes) pausaHumano.set(v, ate);
  console.log(`[eco] equipe respondeu +${echo.to} pelo celular: Jarvis em silêncio até ${new Date(ate).toISOString()}`);
  for (const v of variantes) {
    emSerie(v, async () => {
      const conv = await loadConversation(v);
      if (v !== echo.to && !conv.atualizadoEm) return; // não cria arquivo para variante que nunca conversou
      conv.pausadoAte = Math.max(conv.pausadoAte ?? 0, ate);
      await saveConversation(conv);
    }, `Erro ao pausar ${v}:`);
  }
}

function limparPausaHumano(waId, conv) {
  for (const v of variantesBR(waId)) pausaHumano.delete(v);
  delete conv.pausadoAte;
}

async function notifyOwner(phoneNumberId, text) {
  if (!config.ownerWhatsapp) {
    console.log("[aviso para o dono — OWNER_WHATSAPP não configurado]\n" + text);
    return;
  }
  try {
    await sendText(phoneNumberId, config.ownerWhatsapp, text);
  } catch (err) {
    // Fora da janela de 24h com o dono, a Meta só aceita template aprovado.
    if (config.ownerTemplate.name) {
      try {
        await sendTemplate(phoneNumberId, config.ownerWhatsapp, config.ownerTemplate.name,
          config.ownerTemplate.lang, [templateParam(text)]);
        return;
      } catch (err2) {
        console.warn("Template de aviso também falhou:", err2.message);
      }
    }
    console.warn("Não consegui avisar o dono pelo WhatsApp:", err.message, "\n" + text);
  }
}

/** Parâmetros de template não aceitam quebra de linha nem formatação: vira uma linha só. */
export function templateParam(text, max = 900) {
  const linha = text.replace(/[*_~]/g, "").replace(/\s*\n+\s*/g, " · ").replace(/\s{2,}/g, " ").trim();
  return linha.length > max ? linha.slice(0, max - 1) + "…" : linha;
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
    if (!conv.pausado) {
      conv.voltouDoHumano = true;
      limparPausaHumano(waId, conv);
    }
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

  const humanoAte = Math.max(conv.pausadoAte ?? 0, pausadoPorHumanoAte(waId));
  if (humanoAte > Date.now()) {
    console.log(`(${waId}: a equipe respondeu pelo celular — Jarvis em silêncio até ${new Date(humanoAte).toISOString()})`);
    await saveConversation(conv);
    return;
  }
  if (humanoAte) {
    // A pausa por resposta humana acabou: o Jarvis volta, sabendo que houve atendimento humano.
    limparPausaHumano(waId, conv);
    conv.voltouDoHumano = true;
  }

  console.log(`← ${items.length} mensagem(ns) de ${waId} (${items.map((i) => i.type).join(", ")})`);
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
  // Se a equipe respondeu pelo celular enquanto o Claude pensava, não atropela.
  const humanoAgora = pausadoPorHumanoAte(waId);
  if (resposta && humanoAgora > Date.now()) {
    conv.pausadoAte = humanoAgora;
    await saveConversation(conv);
    console.log(`(${waId}: a equipe respondeu pelo celular durante a resposta — resposta do Jarvis descartada)`);
    return;
  }
  await saveConversation(conv);
  if (resposta) {
    await sendText(phoneNumberId, waId, resposta);
    console.log(`→ resposta enviada para ${waId} (${resposta.length} caracteres)`);
  }
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

    // Política de privacidade pública (exigida pela Meta para publicar o app)
    if (req.method === "GET" && (url.pathname === "/privacidade" || url.pathname === "/privacy")) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(PAGINA_PRIVACIDADE);
    }

    // Cadastro Incorporado com coexistência (ligar um número do app do celular à API)
    if (url.pathname === "/conectar" || url.pathname === "/conectar/finalizar") {
      if (!chaveValida(url.searchParams.get("k"))) {
        res.writeHead(404);
        return res.end();
      }
      const falta = faltaConfigConectar();
      if (falta.length) {
        res.writeHead(503, { "Content-Type": "text/plain; charset=utf-8" });
        return res.end(`Cadastro indisponível: faltam as variáveis ${falta.join(", ")}.`);
      }
      if (req.method === "GET" && url.pathname === "/conectar") {
        res.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
          "Referrer-Policy": "no-referrer",
        });
        return res.end(paginaConectar(url.searchParams.get("k")));
      }
      if (req.method === "POST" && url.pathname === "/conectar/finalizar") {
        let body;
        try {
          body = JSON.parse((await readBody(req)).toString("utf8") || "{}");
        } catch {
          res.writeHead(400, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ ok: false, passos: [{ passo: "Ler o pedido", ok: false, detalhe: "JSON inválido" }] }));
        }
        const resultado = await finalizarConexao(body);
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
        return res.end(JSON.stringify(resultado));
      }
      res.writeHead(405);
      return res.end();
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
      for (const { field, wabaId, value } of webhookFields(payload)) {
        if (field === "history") {
          const erro = value?.history?.find?.((h) => h.errors)?.errors?.[0] ?? value?.errors?.[0];
          console.log(`[webhook] history da conta ${wabaId}${erro ? ` (erro ${erro.code}: ${erro.title || erro.message || ""})` : ""}`);
        } else if (field === "smb_app_state_sync") {
          console.log(`[webhook] smb_app_state_sync da conta ${wabaId} (${value?.state_sync?.length ?? 0} contato(s))`);
        } else if (field === "account_update") {
          console.log(`[webhook] account_update da conta ${wabaId}: ${value?.event ?? "?"}`);
        }
      }
      for (const echo of parseEchoes(payload)) {
        if (alreadySeen(echo.id) || enviadaPelaApi(echo.id)) continue;
        registrarHumano(echo);
      }
      for (const msg of parseIncoming(payload)) {
        if (alreadySeen(msg.id)) continue;
        if (config.ownerWhatsapp && numeroBR(msg.from) === numeroBR(config.ownerWhatsapp) && msg.text.startsWith("#")) {
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
