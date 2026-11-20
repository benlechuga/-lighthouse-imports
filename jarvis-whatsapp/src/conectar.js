// Cadastro Incorporado (Embedded Signup) com coexistência: liga um número que já
// está no app WhatsApp Business do celular à API, sem tirar o número do celular.
// Docs: developers.facebook.com/docs/whatsapp/embedded-signup/implementation
//       developers.facebook.com/docs/whatsapp/embedded-signup/custom-flows/onboarding-business-app-users

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { config } from "./config.js";
import { graph } from "./whatsapp.js";

/** O que falta configurar para a página funcionar (vazio = tudo certo). */
export function faltaConfigConectar() {
  const falta = [];
  if (!config.conectar.appId) falta.push("FB_APP_ID");
  if (!config.conectar.configId) falta.push("ES_CONFIG_ID");
  if (!config.conectar.key) falta.push("CONECTAR_KEY");
  if (!config.whatsapp.appSecret) falta.push("WHATSAPP_APP_SECRET");
  return falta;
}

/** Compara a chave da URL (?k=) sem vazar tempo de comparação. */
export function chaveValida(k) {
  const esperada = config.conectar.key;
  if (!esperada || typeof k !== "string") return false;
  const a = crypto.createHash("sha256").update(k).digest();
  const b = crypto.createHash("sha256").update(esperada).digest();
  return crypto.timingSafeEqual(a, b);
}

const js = (v) => JSON.stringify(v).replace(/</g, "\\u003c");

/**
 * Opções do FB.login. Na v5 a coexistência (whatsapp_business_app_onboarding) já vem
 * ligada; na v4 precisa do featureType. A versão vem de ES_VERSION (padrão v5).
 */
export function extrasCadastro(versao = config.conectar.esVersion) {
  // sessionInfoVersion "3" faz a Meta mandar o postMessage WA_EMBEDDED_SIGNUP com os IDs.
  if (versao === "v4") return { setup: {}, featureType: "whatsapp_business_app_onboarding", sessionInfoVersion: "3" };
  return { setup: {}, version: versao, sessionInfoVersion: "3" };
}

export function paginaConectar(chave) {
  const { appId, configId } = config.conectar;
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Conectar WhatsApp · Jarvis</title>
<style>
  :root { --navy: #0e3658; --ouro: #ce9730; --texto: #1d2733; --fundo: #ffffff; --linha: #e3e6ea; --suave: #6b7480; --ok: #1f7a4d; --erro: #b3261e; }
  @media (prefers-color-scheme: dark) { :root { --texto: #e7eaee; --fundo: #0f1720; --linha: #2a3440; --navy: #8fb6d8; --suave: #9aa4b0; --ok: #6fcf97; --erro: #f28b82; } }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--fundo); color: var(--texto); font: 16px/1.6 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  main { max-width: 680px; margin: 0 auto; padding: 40px 16px 64px; }
  h1 { color: var(--navy); font-size: 1.6rem; line-height: 1.25; margin: 0 0 8px; }
  .faixa { height: 4px; width: 64px; background: var(--ouro); margin: 0 0 20px; border-radius: 2px; }
  ol { padding-left: 1.2rem; } li { margin: 6px 0; }
  .aviso { border-left: 4px solid var(--ouro); padding: 8px 12px; margin: 16px 0; color: var(--suave); }
  button { background: var(--navy); color: #fff; border: 0; border-radius: 6px; font: 600 16px/1 inherit; padding: 14px 22px; cursor: pointer; }
  @media (prefers-color-scheme: dark) { button { background: #1b4f7a; } }
  button:disabled { opacity: .5; cursor: default; }
  #status { margin-top: 24px; }
  .passo { display: flex; gap: 8px; padding: 6px 0; border-bottom: 1px solid var(--linha); }
  .ok { color: var(--ok); } .erro { color: var(--erro); }
  code { font-size: .9em; }
</style>
</head>
<body>
<main>
  <div class="faixa"></div>
  <h1>Conectar o WhatsApp ao Jarvis</h1>
  <p>O número continua funcionando no app WhatsApp Business do celular. O Jarvis passa a responder pela API ao mesmo tempo (coexistência).</p>
  <ol>
    <li>Deixe o celular com o app WhatsApp Business aberto e atualizado.</li>
    <li>Clique no botão abaixo e entre com o Facebook de um administrador do portfólio.</li>
    <li>Escolha <strong>conectar uma conta existente do WhatsApp Business</strong>, digite o número e confirme no celular, compartilhando o histórico de conversas.</li>
    <li>Termine o fluxo clicando em <strong>Concluir</strong> e não feche esta página até aparecer o resultado.</li>
  </ol>
  <p class="aviso">Depois de conectado, quando alguém da equipe responder um cliente pelo celular, o Jarvis fica em silêncio com aquele cliente por ${config.humanoPausaHoras} h.</p>
  <button id="conectar" disabled>Carregando…</button>
  <div id="status" aria-live="polite"></div>
</main>
<script>
  const CHAVE = ${js(chave)};
  const APP_ID = ${js(appId)};
  const CONFIG_ID = ${js(configId)};
  const GRAPH_VERSION = ${js(config.whatsapp.graphVersion)};
  const EXTRAS = ${js(extrasCadastro())};
  const botao = document.getElementById("conectar");
  const status = document.getElementById("status");
  let sessao = null, codigo = null, enviado = false;

  function linha(texto, classe) {
    const d = document.createElement("div");
    d.className = "passo " + (classe || "");
    d.textContent = texto;
    status.appendChild(d);
  }

  window.fbAsyncInit = function () {
    FB.init({ appId: APP_ID, autoLogAppEvents: true, xfbml: false, version: GRAPH_VERSION });
    botao.disabled = false;
    botao.textContent = "Conectar com o Facebook";
  };

  // Informações da sessão do Cadastro Incorporado (IDs da conta e do número)
  window.addEventListener("message", (event) => {
    if (!event.origin.endsWith("facebook.com")) return;
    let data;
    try { data = JSON.parse(event.data); } catch { return; }
    if (!data || data.type !== "WA_EMBEDDED_SIGNUP") return;
    if (data.event === "CANCEL") {
      linha("Fluxo interrompido na etapa " + ((data.data && data.data.current_step) || "desconhecida") + ". Pode tentar de novo.", "erro");
      botao.disabled = false;
      return;
    }
    if (data.event === "ERROR") {
      linha("A Meta mostrou um erro: " + ((data.data && data.data.error_message) || "sem detalhe") + " (código " + ((data.data && data.data.error_code) || "?") + ")", "erro");
      botao.disabled = false;
      return;
    }
    sessao = { evento: data.event || "", ...(data.data || {}) };
    linha("Conta recebida da Meta (" + (sessao.evento || "sessão") + ").");
    finalizar();
  });

  function finalizar() {
    if (enviado || !codigo) return;
    // O código vale só 5 minutos: espera um pouco pelos IDs da sessão e segue mesmo sem eles.
    if (!sessao) { setTimeout(() => { if (!enviado) enviar(); }, 4000); return; }
    enviar();
  }

  async function enviar() {
    if (enviado) return;
    enviado = true;
    linha("Conectando o número ao Jarvis…");
    try {
      const res = await fetch("/conectar/finalizar?k=" + encodeURIComponent(CHAVE), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: codigo,
          evento: sessao && sessao.evento,
          waba_id: sessao && sessao.waba_id,
          phone_number_id: sessao && sessao.phone_number_id,
          business_id: sessao && sessao.business_id,
          pagina: location.origin + location.pathname,
        }),
      });
      const r = await res.json();
      for (const p of r.passos || []) linha((p.ok ? "✓ " : "✗ ") + p.passo + (p.detalhe ? ": " + p.detalhe : ""), p.ok ? "ok" : "erro");
      linha(r.ok ? "Pronto! Número conectado. Pode fechar esta página." : "Alguma etapa falhou. Mande um print desta tela para o suporte.", r.ok ? "ok" : "erro");
    } catch (e) {
      linha("Não consegui falar com o servidor: " + e.message, "erro");
    }
  }

  botao.addEventListener("click", () => {
    botao.disabled = true;
    status.textContent = "";
    sessao = null; codigo = null; enviado = false;
    FB.login((response) => {
      if (response.authResponse && response.authResponse.code) {
        codigo = response.authResponse.code;
        finalizar();
      } else {
        linha("O login não foi concluído. Pode tentar de novo.", "erro");
        botao.disabled = false;
      }
    }, {
      config_id: CONFIG_ID,
      response_type: "code",
      override_default_response_type: true,
      extras: EXTRAS,
    });
  });
</script>
<script async defer crossorigin="anonymous" src="https://connect.facebook.net/pt_BR/sdk.js"></script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Finalização no servidor (servidor → Meta). O token da empresa só vive na
// memória durante esta função: não é salvo, não é logado e não volta para a página.
// ---------------------------------------------------------------------------

const so = (v) => (typeof v === "string" && /^\d{3,30}$/.test(v) ? v : "");

export async function finalizarConexao(body, { fetchImpl = fetch } = {}) {
  const segredos = [];
  const limpar = (t) => {
    let s = String(t ?? "");
    for (const seg of segredos) if (seg) s = s.split(seg).join("[oculto]");
    return s.slice(0, 300);
  };
  const passos = [];
  const passo = (nome, ok, detalhe = "") => {
    passos.push({ passo: nome, ok, detalhe: limpar(detalhe) });
    console.log(`[conectar] ${ok ? "ok" : "ERRO"} ${nome}${detalhe ? `: ${limpar(detalhe)}` : ""}`);
    return ok;
  };

  async function chamar(metodo, caminho, { token, json, query } = {}) {
    const url = new URL(graph(caminho));
    for (const [k, v] of Object.entries(query ?? {})) url.searchParams.set(k, v);
    const res = await fetchImpl(url, {
      method: metodo,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(json ? { "Content-Type": "application/json" } : {}),
      },
      body: json ? JSON.stringify(json) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.error) throw new Error(data?.error?.message || `HTTP ${res.status}`);
    return data;
  }

  const code = typeof body?.code === "string" ? body.code : "";
  segredos.push(code, config.whatsapp.appSecret);
  let wabaId = so(body?.waba_id);
  let phoneNumberId = so(body?.phone_number_id);
  const evento = typeof body?.evento === "string" ? body.evento.slice(0, 60) : "";
  const resultado = { ok: false, passos, waba_id: "", phone_number_id: "", numero: "" };

  if (!code) {
    passo("Receber o código da Meta", false, "a página não enviou o código");
    return resultado;
  }

  // 1. Troca o código (vale 5 minutos) pelo token da empresa
  let token;
  try {
    // O código do FB.login do SDK JS às vezes fica preso a um redirect_uri (erro 36008).
    // Tenta sem redirect_uri (documentado), depois vazio, depois a URL da própria página.
    const pagina = typeof body?.pagina === "string" && /^https:\/\/[a-z0-9.-]+\/conectar$/i.test(body.pagina) ? body.pagina : "";
    const tentativas = [undefined, "", ...(pagina ? [pagina] : [])];
    let r, ultimoErro;
    for (const redirect of tentativas) {
      const query = { client_id: config.conectar.appId, client_secret: config.whatsapp.appSecret, code };
      if (redirect !== undefined) query.redirect_uri = redirect;
      try { r = await chamar("GET", "oauth/access_token", { query }); break; }
      catch (err) { ultimoErro = err; if (!/redirect_uri/i.test(err.message)) break; }
    }
    if (!r) throw ultimoErro;
    token = r.access_token;
    if (!token) throw new Error("a Meta não devolveu o token");
    segredos.push(token);
    passo("Trocar o código pelo token da empresa", true);
  } catch (err) {
    passo("Trocar o código pelo token da empresa", false, err.message);
    return resultado;
  }

  // 2. Sem waba_id na sessão: descobre pelas permissões concedidas ao token
  if (!wabaId) {
    try {
      const r = await chamar("GET", "debug_token", {
        query: { input_token: token, access_token: `${config.conectar.appId}|${config.whatsapp.appSecret}` },
      });
      const escopo = (r.data?.granular_scopes ?? []).find((g) => g.scope === "whatsapp_business_management");
      wabaId = so(escopo?.target_ids?.[0]);
      if (!wabaId) throw new Error("nenhuma conta do WhatsApp foi compartilhada");
      passo("Descobrir a conta do WhatsApp", true, wabaId);
    } catch (err) {
      passo("Descobrir a conta do WhatsApp", false, err.message);
      return resultado;
    }
  }
  resultado.waba_id = wabaId;

  // 3. Assina os webhooks da conta para este app
  try {
    await chamar("POST", `${wabaId}/subscribed_apps`, { token });
    passo("Ligar a conta ao app (webhooks)", true);
  } catch (err) {
    passo("Ligar a conta ao app (webhooks)", false, err.message);
  }

  // 4. Sem phone_number_id na sessão: pega o número da conta
  if (!phoneNumberId) {
    try {
      const r = await chamar("GET", `${wabaId}/phone_numbers`, {
        token, query: { fields: "id,display_phone_number,is_on_biz_app,platform_type" },
      });
      const lista = r.data ?? [];
      const escolhido = lista.find((n) => n.is_on_biz_app) ?? lista[0];
      phoneNumberId = so(escolhido?.id);
      if (!phoneNumberId) throw new Error("a conta não tem número");
      passo("Encontrar o número", true, escolhido.display_phone_number || phoneNumberId);
    } catch (err) {
      passo("Encontrar o número", false, err.message);
      return fecharResultado();
    }
  }
  resultado.phone_number_id = phoneNumberId;

  // 5. Coexistência: sincroniza contatos e histórico (uma vez só, em até 24 h).
  // Número novo só na API (evento FINISH) não tem o que sincronizar e precisaria de /register.
  if (evento === "FINISH") {
    passo("Sincronizar contatos e histórico", false,
      "este número entrou como número novo da API (sem o app do celular); falta registrar com PIN");
  } else {
    for (const [nome, tipo] of [["Sincronizar contatos", "smb_app_state_sync"], ["Sincronizar histórico de conversas", "history"]]) {
      try {
        const r = await chamar("POST", `${phoneNumberId}/smb_app_data`, {
          token, json: { messaging_product: "whatsapp", sync_type: tipo },
        });
        passo(nome, true, r.request_id ? `pedido ${r.request_id}` : "");
      } catch (err) {
        passo(nome, false, err.message);
      }
    }
  }

  // 6. Confere se o número está no app E na API
  try {
    const r = await chamar("GET", phoneNumberId, {
      token, query: { fields: "is_on_biz_app,platform_type,display_phone_number" },
    });
    resultado.numero = r.display_phone_number || "";
    const ok = r.platform_type === "CLOUD_API";
    passo("Conferir o número", ok,
      `${r.display_phone_number || phoneNumberId} · no app do celular: ${r.is_on_biz_app ? "sim" : "não"} · plataforma: ${r.platform_type || "?"}`);
  } catch (err) {
    passo("Conferir o número", false, err.message);
  }

  return fecharResultado();

  async function fecharResultado() {
    resultado.ok = passos.every((p) => p.ok);
    try {
      await fs.mkdir(config.dataDir, { recursive: true });
      await fs.appendFile(path.join(config.dataDir, "conexoes.jsonl"), JSON.stringify({
        em: new Date().toISOString(),
        evento,
        waba_id: resultado.waba_id,
        phone_number_id: resultado.phone_number_id,
        numero: resultado.numero,
        ok: resultado.ok,
        passos,
      }) + "\n");
    } catch (err) {
      console.warn("[conectar] não consegui gravar conexoes.jsonl:", err.message);
    }
    console.log(`[conectar] fim: waba ${resultado.waba_id || "?"} · número ${resultado.phone_number_id || "?"} · ${resultado.ok ? "tudo certo" : "com falhas"}`);
    return resultado;
  }
}
