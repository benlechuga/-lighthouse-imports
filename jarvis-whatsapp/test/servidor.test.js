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

// --- Graph API falsa: usada pela página /conectar (Cadastro Incorporado) ---
const TOKEN_EMPRESA = "EAA-token-da-empresa-NAO-PODE-VAZAR";
const CODIGO = "codigo-trocavel-NAO-PODE-VAZAR";
const CODIGO_PRESO = "codigo-preso-ao-redirect-NAO-PODE-VAZAR";
const PAGINA = "https://jarvis.exemplo.com/conectar";
const chamadasGraph = [];
const fakeGraph = http.createServer(async (req, res) => {
  let body = "";
  for await (const c of req) body += c;
  const u = new URL(req.url, "http://x");
  chamadasGraph.push({ method: req.method, path: u.pathname, query: Object.fromEntries(u.searchParams), auth: req.headers.authorization ?? "", body });
  const json = (o, status = 200) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(o)); };
  if (u.pathname.endsWith("/oauth/access_token")) {
    if (u.searchParams.get("code") === CODIGO_PRESO) {
      return u.searchParams.get("redirect_uri") === PAGINA
        ? json({ access_token: TOKEN_EMPRESA, token_type: "bearer" })
        : json({ error: { message: "Error validating verification code. Please make sure your redirect_uri is identical to the one you used in the OAuth dialog request", code: 100, error_subcode: 36008 } }, 400);
    }
    return u.searchParams.get("code") === CODIGO
      ? json({ access_token: TOKEN_EMPRESA, token_type: "bearer" })
      : json({ error: { message: "código inválido" } }, 400);
  }
  if (u.pathname.endsWith("/102290129340398/subscribed_apps")) return json({ success: true });
  if (u.pathname.endsWith("/106540352242922/smb_app_data")) return json({ messaging_product: "whatsapp", request_id: "req-" + JSON.parse(body).sync_type });
  if (u.pathname.endsWith("/106540352242922")) return json({ id: "106540352242922", is_on_biz_app: true, platform_type: "CLOUD_API", display_phone_number: "+55 47 99605-6084" });
  json({ error: { message: "rota não esperada " + u.pathname } }, 404);
});

let server, baseUrl, logs = [];
const origLog = console.log;
const origWarn = console.warn;

before(async () => {
  await new Promise((r) => fakeClaude.listen(0, r));
  await new Promise((r) => fakeGraph.listen(0, r));
  Object.assign(process.env, {
    ANTHROPIC_API_KEY: "sk-test",
    ANTHROPIC_BASE_URL: `http://127.0.0.1:${fakeClaude.address().port}`,
    WHATSAPP_DRY_RUN: "true",
    WHATSAPP_APP_SECRET: SECRET,
    WHATSAPP_VERIFY_TOKEN: "verifica-123",
    DEBOUNCE_MS: "50",
    DATA_DIR: dataDir,
    OWNER_WHATSAPP: "",
    GRAPH_API_BASE: `http://127.0.0.1:${fakeGraph.address().port}`,
    GRAPH_API_VERSION: "v27.0",
    FB_APP_ID: "APP123",
    ES_CONFIG_ID: "CFG456",
    CONECTAR_KEY: "chave-secreta-da-pagina",
    HUMANO_PAUSA_HORAS: String(1.5 / 3600), // 1,5 s nos testes
  });
  console.log = (...a) => { logs.push(a.join(" ")); };
  console.warn = (...a) => { logs.push(a.join(" ")); };
  const { createServer } = await import("../src/server.js");
  server = createServer();
  await new Promise((r) => server.listen(0, r));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  console.log = origLog;
  console.warn = origWarn;
  server?.close();
  fakeClaude.close();
  fakeGraph.close();
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

test("nono dígito de celular brasileiro", async () => {
  const { numeroBR } = await import("../src/whatsapp.js");
  assert.equal(numeroBR("554796056084"), "5547996056084"); // como o webhook entrega
  assert.equal(numeroBR("5547996056084"), "5547996056084"); // já tem o 9
  assert.equal(numeroBR("554733334444"), "554733334444");   // fixo: não mexe
  assert.equal(numeroBR("15551757374"), "15551757374");     // fora do Brasil: não mexe
  assert.equal(numeroBR("+55 (47) 9605-6084"), "5547996056084");
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

test("política de privacidade pública", async () => {
  for (const caminho of ["/privacidade", "/privacy"]) {
    const res = await fetch(`${baseUrl}${caminho}`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type"), /text\/html/);
    assert.match(await res.text(), /Política de Privacidade/);
  }
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

test("prompts dos clientes: sem comentários nem campos a preencher", async () => {
  const { montarPrompt } = await import("../src/jarvis.js");
  for (const nome of ["lighthouse.md", "dualia.md", "lighthouse-dualia.md"]) {
    const texto = await fs.readFile(new URL(`../prompts/${nome}`, import.meta.url), "utf8");
    const prompt = montarPrompt(texto);
    assert.equal(prompt.includes("<!--"), false, `${nome}: comentário vazou para o prompt`);
    assert.equal(/\[[^\]]*(NOME|descreva|PREENCHER|Produto\/serviço)[^\]]*\]/i.test(prompt), false, `${nome}: campo do modelo sem preencher`);
    assert.match(prompt, /^# Quem você é/, `${nome}: deve começar pela identidade`);
    assert.match(prompt, /# Regras do canal \(WhatsApp\)/, `${nome}: faltam as regras fixas`);
    assert.match(prompt, /registrar_lead/);
    assert.match(prompt, /transferir_para_humano/);
  }
});

test("aviso do dono vira parâmetro de template válido", async () => {
  const { templateParam } = await import("../src/server.js");
  const p = templateParam("🔔 *Jarvis: atendimento*\nCliente: Ana\n\nMotivo:   reclamação");
  assert.equal(p.includes("\n"), false);
  assert.equal(p.includes("*"), false);
  assert.equal(/\s{2,}/.test(p), false);
  assert.ok(templateParam("x".repeat(2000)).length <= 900);
});

test("página /conectar só abre com a chave", async () => {
  assert.equal((await fetch(`${baseUrl}/conectar`)).status, 404);
  assert.equal((await fetch(`${baseUrl}/conectar?k=errada`)).status, 404);
  assert.equal((await fetch(`${baseUrl}/conectar/finalizar?k=errada`, { method: "POST", body: "{}" })).status, 404);
  const ok = await fetch(`${baseUrl}/conectar?k=chave-secreta-da-pagina`);
  assert.equal(ok.status, 200);
  const html = await ok.text();
  assert.match(html, /"APP123"/);
  assert.match(html, /"CFG456"/);
  assert.match(html, /"version":"v5"/);
  assert.match(html, /response_type: "code"/);
  assert.match(html, /connect\.facebook\.net/);
  const { extrasCadastro } = await import("../src/conectar.js");
  assert.deepEqual(extrasCadastro("v4"), { setup: {}, featureType: "whatsapp_business_app_onboarding", sessionInfoVersion: "3" });
  assert.match(html, /"sessionInfoVersion":"3"/);
});

test("finalizar conexão: código preso ao redirect_uri tenta de novo com a URL da página", async () => {
  chamadasGraph.length = 0;
  const texto = await (await fetch(`${baseUrl}/conectar/finalizar?k=chave-secreta-da-pagina`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: CODIGO_PRESO, waba_id: "102290129340398", phone_number_id: "106540352242922", pagina: PAGINA }),
  })).text();
  const r = JSON.parse(texto);
  assert.equal(r.ok, true, texto);
  const trocas = chamadasGraph.filter((c) => c.path.endsWith("/oauth/access_token"));
  assert.deepEqual(trocas.map((c) => c.query.redirect_uri), [undefined, "", PAGINA]);
  for (const segredo of [TOKEN_EMPRESA, CODIGO_PRESO]) assert.equal(texto.includes(segredo), false);

  // URL de página estranha é ignorada: só as duas primeiras tentativas
  chamadasGraph.length = 0;
  const ruim = JSON.parse(await (await fetch(`${baseUrl}/conectar/finalizar?k=chave-secreta-da-pagina`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: CODIGO_PRESO, waba_id: "102290129340398", pagina: "https://evil.example/outra" }),
  })).text());
  assert.equal(ruim.ok, false);
  assert.equal(chamadasGraph.filter((c) => c.path.endsWith("/oauth/access_token")).length, 2);
});

test("finalizar conexão: troca o código, assina, sincroniza e não vaza o token", async () => {
  const dataDir = process.env.DATA_DIR;
  const inicioLogs = logs.length;
  chamadasGraph.length = 0;
  const res = await fetch(`${baseUrl}/conectar/finalizar?k=chave-secreta-da-pagina`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: CODIGO, evento: "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING", waba_id: "102290129340398", phone_number_id: "106540352242922" }),
  });
  assert.equal(res.status, 200);
  const texto = await res.text();
  const r = JSON.parse(texto);
  assert.equal(r.ok, true, texto);

  // Ordem das chamadas à Meta
  assert.deepEqual(chamadasGraph.map((c) => `${c.method} ${c.path}`), [
    "GET /v27.0/oauth/access_token",
    "POST /v27.0/102290129340398/subscribed_apps",
    "POST /v27.0/106540352242922/smb_app_data",
    "POST /v27.0/106540352242922/smb_app_data",
    "GET /v27.0/106540352242922",
  ]);
  assert.equal(chamadasGraph[0].query.client_id, "APP123");
  assert.equal(chamadasGraph[0].query.client_secret, SECRET);
  assert.equal(chamadasGraph[1].auth, `Bearer ${TOKEN_EMPRESA}`);
  assert.deepEqual(chamadasGraph.slice(2, 4).map((c) => JSON.parse(c.body).sync_type), ["smb_app_state_sync", "history"]);
  assert.equal(chamadasGraph[4].query.fields, "is_on_biz_app,platform_type,display_phone_number");

  // O token, o código e o segredo do app não aparecem na resposta, nos logs nem no arquivo
  const novosLogs = logs.slice(inicioLogs).join("\n");
  const arquivo = await fs.readFile(path.join(dataDir, "conexoes.jsonl"), "utf8");
  for (const segredo of [TOKEN_EMPRESA, CODIGO, SECRET]) {
    assert.equal(texto.includes(segredo), false, "vazou na resposta");
    assert.equal(novosLogs.includes(segredo), false, "vazou no log");
    assert.equal(arquivo.includes(segredo), false, "vazou no conexoes.jsonl");
  }
  assert.match(arquivo, /"waba_id":"102290129340398"/);
  assert.match(arquivo, /"numero":"\+55 47 99605-6084"/);

  // Código errado: para na primeira etapa
  const ruim = await (await fetch(`${baseUrl}/conectar/finalizar?k=chave-secreta-da-pagina`, {
    method: "POST", body: JSON.stringify({ code: "outro", waba_id: "102290129340398" }),
  })).json();
  assert.equal(ruim.ok, false);
  assert.equal(ruim.passos.length, 1);
});

test("eco do celular (coexistência): pausa o contato, não chama o Claude e volta depois", async () => {
  const cliente = "5511977776666";
  const espera = (ms) => new Promise((r) => setTimeout(r, ms));
  const webhook = (value, field) => fetch(`${baseUrl}/webhook`, {
    method: "POST",
    body: JSON.stringify({ object: "whatsapp_business_account", entry: [{ id: "WABA1", changes: [{ field, value }] }] }),
  });
  const msgCliente = (id, texto) => webhook({
    metadata: { phone_number_id: "PNID" },
    contacts: [{ wa_id: cliente, profile: { name: "Bia" } }],
    messages: [{ from: cliente, id, timestamp: "1763470100", type: "text", text: { body: texto } }],
  }, "messages");

  const antes = chamadasClaude.length;
  const enviosAntes = logs.filter((l) => l.includes(`"to":"${cliente}"`) && l.includes('"text":{"body"')).length;

  // A equipe responde pelo app do celular
  const eco = await webhook({
    metadata: { phone_number_id: "PNID" },
    message_echoes: [{ from: "554796056084", to: cliente, id: "wamid.eco1", timestamp: "1763470099", type: "text", text: { body: "Oi Bia, aqui é o Benjamin" } }],
  }, "smb_message_echoes");
  assert.equal(eco.status, 200);
  await espera(100);

  // O cliente responde: o Jarvis fica quieto
  await msgCliente("wamid.bia1", "Oi Benjamin!");
  await espera(400);
  assert.equal(chamadasClaude.length, antes, "não devia chamar o Claude durante a pausa");
  assert.ok(logs.some((l) => l.includes(cliente) && l.includes("em silêncio")));
  const conv = JSON.parse(await fs.readFile(path.join(process.env.DATA_DIR, "conversas", `${cliente}.json`), "utf8"));
  assert.ok(conv.pausadoAte > Date.now() - 5000);

  // Outros webhooks da coexistência são aceitos e só registrados
  for (const field of ["history", "smb_app_state_sync", "account_update"]) {
    assert.equal((await webhook({ messaging_product: "whatsapp" }, field)).status, 200);
  }

  // Passou a pausa: o Jarvis volta a responder, sabendo que houve atendimento humano
  await espera(1300);
  await msgCliente("wamid.bia2", "Ainda está aí?");
  for (let i = 0; i < 60 && chamadasClaude.length < antes + 2; i++) await espera(50);
  await espera(100);
  assert.equal(chamadasClaude.length, antes + 2);
  const primeira = chamadasClaude[antes].messages.at(-1).content.map((b) => b.text ?? "").join(" ");
  assert.match(primeira, /atendente humano conduziu/);
  const envios = logs.filter((l) => l.includes(`"to":"${cliente}"`) && l.includes('"text":{"body"')).length;
  assert.equal(envios, enviosAntes + 1);
});

test("variantes do nono dígito para a pausa", async () => {
  const { variantesBR } = await import("../src/server.js");
  assert.deepEqual(variantesBR("5547996056084"), ["5547996056084", "554796056084"]);
  assert.deepEqual(variantesBR("554796056084"), ["554796056084", "5547996056084"]);
  assert.deepEqual(variantesBR("15551757374"), ["15551757374"]);
});
