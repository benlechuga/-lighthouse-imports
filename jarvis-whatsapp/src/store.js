// Armazenamento simples em arquivos JSON (uma conversa por contato).
// Bom para começar e para demonstrações. Com muitos clientes simultâneos,
// troque por Postgres/Redis mantendo as mesmas funções.

import fs from "node:fs/promises";
import path from "node:path";
import { config } from "./config.js";

const convDir = () => path.join(config.dataDir, "conversas");

function fileFor(waId) {
  return path.join(convDir(), `${waId.replace(/\D/g, "")}.json`);
}

/**
 * Estrutura de uma conversa:
 * {
 *   waId, nome,
 *   messages: [...],      // histórico no formato da API do Claude (só cresce)
 *   resumo: "",           // resumo de conversas antigas, quando o histórico é compactado
 *   pausado: false,       // true = humano assumiu, o Jarvis não responde
 *   atualizadoEm: ISO
 * }
 */
export async function loadConversation(waId) {
  try {
    const raw = await fs.readFile(fileFor(waId), "utf8");
    return JSON.parse(raw);
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
    return { waId, nome: "", messages: [], resumo: "", pausado: false, atualizadoEm: null };
  }
}

export async function saveConversation(conv) {
  await fs.mkdir(convDir(), { recursive: true });
  conv.atualizadoEm = new Date().toISOString();
  const tmp = `${fileFor(conv.waId)}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(conv, null, 2));
  await fs.rename(tmp, fileFor(conv.waId));
}

export async function appendLead(lead) {
  await fs.mkdir(config.dataDir, { recursive: true });
  await fs.appendFile(path.join(config.dataDir, "leads.jsonl"), JSON.stringify(lead) + "\n");
}

// Evita processar a mesma mensagem duas vezes (a Meta reenvia webhooks).
const seen = new Map();
export function alreadySeen(messageId) {
  const now = Date.now();
  for (const [id, t] of seen) if (now - t > 24 * 3600_000) seen.delete(id);
  if (seen.has(messageId)) return true;
  seen.set(messageId, now);
  return false;
}
