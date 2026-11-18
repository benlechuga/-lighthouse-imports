// Testes sem custo: a API do Claude é simulada por um servidor local falso.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const SECRET = "segredo-de-teste";
const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "jarvis-test-"));

// --- Claude falso: 1ª chamada pede a ferramenta registrar_lead, 2ª responde texto ---
const chamadasClaude = [];
const fakeClaude = http.createServer(async (req, res) => {
  let body = "";
  for await (const c of req) body += c;
  const params = JSON.parse(body);
  chamadasClaude.push(params);
  const last = params.messages.at(-1);
  const jaTemResultado = Array.isArray(last.content) && last.content.some((b) => b.type === "tool_result");
  const content = jaTemResultado
    ? [{ type: "text", text: "Perfeito! Já anotei seu interesse. 😊" }]
    : [{ type: "tool_use", id: "toolu_1", name: "registrar_lead",
         input: { nome: "Ana", interesse: "orçamento", urgencia: "alta", observacoes: "" } }];
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({
    id: "msg_test", type: "message", role: "assistant", model: params.model, content,
    stop_reason: jaTemResultado ? "end_turn" : "tool_use", stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 10 },
  }));
});

let server, baseUrl, logs = [];
const origLog = console.log;

before(async () => {
  await new Promise((r) => fakeClaude.listen(0, r));
  Object.assign(process.env, {
    ANTHROPIC_API_KEY: "sk-test",
    ANTHROPIC_BASE_URL: `http://127.0.0.1:${fakeClaude.address().port}`,
    WHATSAPP_DRY_RUN: "true",
    WHATSAPP_APP_SECRET: SECRET,
    WHATSAPP_VERIFY_TOKEN: "verifica-123",
    DEBOUNCE_MS: "50",
    DATA_DIR: dataDir,
    OWNER_WHATSAPP: "",
  });
  console.log = (...a) => { logs.push(a.join(" ")); };
  const { createServer } = await import("../src/server.js");
  server = createServer();
  await new Promise((r) => server.listen(0, r));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  console.log = origLog;
  server?.close();
  fakeClaude.close();
  await fs.rm(dataDir, { recursive: true, force: true });
});

test("assinatura do webhook", async () => {
  const { isValidSignature } = await import("../src/whatsapp.js");
  const body = Buffer.from('{"a":1}');
  const sig = "sha256=" + crypto.createHmac("sha256", SECRET).update(body).digest("hex");
  assert.equal(isValidSignature(body, sig, SECRET), true);
  assert.equal(isValidSignature(body, "sha256=" + "0".repeat(64), SECRET), false);
  assert.equal(isValidSignature(body, undefined, SECRET), false);
});

test("divide mensagens longas", async () => {
  const { splitMessage } = await import("../src/whatsapp.js");
  const partes = splitMessage("palavra ".repeat(1500));
  assert.ok(partes.length > 1);
  assert.ok(partes.every((p) => p.length <= 3900));
});

test("verificação do webhook (GET)", async () => {
  const ok = await fetch(`${baseUrl}/webhook?hub.mode=subscribe&hub.verify_token=verifica-123&hub.challenge=42`);
  assert.equal(ok.status, 200);
  assert.equal(await ok.text(), "42");
  const ruim = await fetch(`${baseUrl}/webhook?hub.mode=subscribe&hub.verify_token=errado&hub.challenge=42`);
  assert.equal(ruim.status, 403);
});

test("fluxo completo: mensagem → Claude → ferramenta → resposta", async () => {
  const payload = {
    entry: [{ changes: [{ value: {
      metadata: { phone_number_id: "PNID" },
      contacts: [{ wa_id: "5511988887777", profile: { name: "Ana" } }],
      messages: [
        { from: "5511988887777", id: "wamid.1", timestamp: "1763470000", type: "text", text: { body: "Oi" } },
        { from: "5511988887777", id: "wamid.2", timestamp: "1763470001", type: "text", text: { body: "Quero um orçamento" } },
      ],
    } }] }],
  };
  const res = await fetch(`${baseUrl}/webhook`, { method: "POST", body: JSON.stringify(payload) });
  assert.equal(res.status, 200);

  // espera o debounce + processamento
  for (let i = 0; i < 50 && !logs.some((l) => l.includes('"text":{"body"')); i++) {
    await new Promise((r) => setTimeout(r, 50));
  }

  // As duas mensagens viraram UMA chamada (debounce), e houve o laço da ferramenta.
  assert.equal(chamadasClaude.length, 2);
  const primeira = chamadasClaude[0];
  assert.equal(primeira.messages.length, 1);
  assert.equal(primeira.messages[0].content.length, 2);
  assert.equal(primeira.fallbacks, "default");
  assert.ok(primeira.tools.every((t) => t.strict === true));

  const enviado = logs.find((l) => l.includes('"text":{"body"'));
  assert.match(enviado, /Já anotei seu interesse/);
  assert.match(enviado, /"to":"5511988887777"/);

  const leads = await fs.readFile(path.join(dataDir, "leads.jsonl"), "utf8");
  assert.match(leads, /"nome":"Ana"/);

  const conv = JSON.parse(await fs.readFile(path.join(dataDir, "conversas", "5511988887777.json"), "utf8"));
  assert.deepEqual(conv.messages.map((m) => m.role), ["user", "assistant", "user", "assistant"]);

  // Webhook repetido pela Meta não gera nova resposta
  await fetch(`${baseUrl}/webhook`, { method: "POST", body: JSON.stringify(payload) });
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(chamadasClaude.length, 2);
});
