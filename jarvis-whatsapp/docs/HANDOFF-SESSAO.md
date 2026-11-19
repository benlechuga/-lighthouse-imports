# Handoff: Jarvis no WhatsApp oficial

Resumo da sessão para continuar o trabalho em outra conversa. Cole este arquivo (ou o link dele) no início da nova sessão.

## Contexto

- **Problema:** o Jarvis (assistente com IA) atendia clientes do WhatsApp pelo Claude in Chrome automatizando o WhatsApp Web. O WhatsApp bloqueou o número por automação.
- **Objetivo:** uma solução definitiva, que possa ser apresentada para os clientes do **projeto Dualia** e ensinada aos **mentorados**.
- **Decisão:** usar a **API oficial do WhatsApp (Cloud API da Meta)** + **Claude API** num servidor próprio. Foram descartadas as opções não oficiais (Z-API, Evolution API, Baileys, WPPConnect, extensões de navegador), que têm o mesmo risco de bloqueio.

## Onde está o código

- **Repositório:** `benlechuga/-lighthouse-imports`
- **Branch:** `claude/ecstatic-hypatia-s0v27j` (enviada para o GitHub, sem PR aberto)
- **Pasta:** `jarvis-whatsapp/`

| Arquivo | Para que serve |
|---|---|
| `src/server.js` | Webhook HTTP (`GET`/`POST /webhook`), junta mensagens picadas, fila por contato, comandos do dono, aviso ao dono com template como reserva |
| `src/jarvis.js` | Chamada ao Claude (Messages API + ferramentas), regras fixas do canal, resumo automático de conversas longas |
| `src/whatsapp.js` | Graph API: envio de texto e template, assinatura `X-Hub-Signature-256`, marcar como lida + "digitando", download de imagem |
| `src/store.js` | Conversas em `data/conversas/*.json`, leads em `data/leads.jsonl`, ignora webhooks repetidos |
| `src/config.js` | Variáveis de ambiente |
| `src/conectar.js` | Página `/conectar?k=` do Cadastro Incorporado com coexistência: troca o código pelo token, assina os webhooks, sincroniza contatos e histórico e confere o número (token nunca salvo nem logado) |
| `prompts/lighthouse.md` | Prompt da **Lighthouse Imports**, preenchido em 18/11/2026 a partir do `CLAUDE.md` e do treinamento SDR v2.2 do Pedro (branch `claude/treinamento-sdr-pedro`): estudo de viabilidade gratuito (7 a 15 dias), 5 perguntas de qualificação, 30/70 ou 50/50 com pagamento direto ao fabricante, objeções, sem preço/MOQ/referências |
| `prompts/dualia.md` | Prompt da **Dualia**, preenchido em 18/11/2026 a partir do `DUALIA_projeto.md` e das mensagens de prospecção de Itajaí: objetivo é agendar a visita sem compromisso; não fala preço (as tabelas ainda são hipótese); demonstração e confirmação de horário ficam com o Benjamin |
| `prompts/jarvis.md` | Modelo em branco para cliente novo (o servidor avisa no log se subir com ele) |
| `scripts/chat.js` | `npm run chat`: conversa com o Jarvis no terminal, sem WhatsApp |
| `scripts/simular-webhook.js` | `npm run simular -- "texto"`: simula a Meta enviando uma mensagem |
| `test/servidor.test.js` | 6 testes com o Claude simulado (`npm test`), todos passando; o 6º confere que os prompts prontos não têm campo do modelo nem comentário vazando |
| `Dockerfile`, `railway.json` | Publicação (Railway com Root Directory = `jarvis-whatsapp` e volume em `/app/data`) |
| `docs/PASSO-A-PASSO.md` | Guia completo do zero até produção, em português (15 seções) |
| `docs/PROMPT-CLAUDE-CHROME.md` | Prompt para o Claude in Chrome fazer a configuração na Meta e no Railway |
| `.env.example` | Todas as variáveis, comentadas |

## Como o Jarvis funciona

- **Fluxo:** o cliente manda mensagem → a Meta chama o webhook → o servidor espera 3 s para juntar mensagens picadas → chama o Claude → responde pela Cloud API.
- **Modelo:** `claude-opus-5-5` por padrão, com `effort: low`. Usa `fallbacks: "default"` (beta `server-side-fallback-2026-07-01`) e cache de prompt automático. Configurável por `CLAUDE_MODEL`, `CLAUDE_EFFORT` e `CLAUDE_FALLBACKS` (deixar vazio no Haiku).
- **Ferramentas do Claude** (`strict: true`):
  - `registrar_lead`: grava em `leads.jsonl` e, opcionalmente, faz POST em `LEADS_WEBHOOK_URL`.
  - `transferir_para_humano`: pausa o Jarvis naquele contato e avisa o `OWNER_WHATSAPP`.
- **Comandos do dono** (do `OWNER_WHATSAPP` para o número do Jarvis): `#status`, `#pausar <número>`, `#retomar <número>`.
- **Histórico:** só cresce, nunca é editado no meio (exigência do "preserved thinking" dos modelos atuais). Quando passa de `MAX_HISTORY_MESSAGES`, vira um resumo e recomeça. A lista de ferramentas e o prompt de sistema não mudam durante a execução.
- **Mídia:** imagens são enviadas ao Claude, que consegue vê-las. Para áudio, vídeo e documento, o Jarvis pede com educação que o cliente escreva.
- **Aviso ao dono fora da janela de 24h:** usa o template `OWNER_TEMPLATE_NAME` (sugestão: `aviso_atendimento`, categoria Utilidade, com um parâmetro `{{1}}`).

## Status

**Feito**
- [x] Código completo e testado com as APIs simuladas
- [x] Guia passo a passo, prompt para o Claude in Chrome e configuração do Railway
- [x] Tudo commitado e enviado para o GitHub
- [x] Prompts reais da Lighthouse e da Dualia; escolha por `JARVIS_PROMPT_FILE` (18/11/2026)
- [x] Comentários `<!-- -->` no prompt são removidos antes de ir para o Claude (18/11/2026)

**Decisão pendente com o usuário (18/11/2026)**
- Qual número atende qual prompt. Cada número oficial roda uma instância com um prompt. Hoje o (47) 99605-6084 mistura prospecção da Dualia e da Lighthouse (o Pedro também usa) e o perfil se chama "Lighthouse business"; o (47) 99148-8351 é o da Lighthouse com as conversas dos fornecedores chineses. Se um número continuar servindo os dois negócios, um só prompt não atende bem: separar os números ou juntar os dois prompts num só.

**Testado de verdade (18/11/2026)**
- [x] Meta: app "Jarvis Atendimento" publicado (política em `/privacidade`), número de teste +1 555 175-7374, webhook no Railway
- [x] Conversa real do (47) 99605-6084 com o número de teste: mensagem chega, o Claude responde, a resposta chega no WhatsApp
- Três travas resolvidas no caminho (fazer em toda instalação nova):
  1. App não publicado só recebe os webhooks de teste do painel. Publicar exige URL de política de privacidade.
  2. A conta do WhatsApp (WABA) precisa estar assinada no app: `POST /<WABA_ID>/subscribed_apps` no Graph API Explorer. Sem isso, nada chega ao servidor.
  3. Nono dígito: o webhook entrega celulares antigos sem o 9 (`554796056084`); `numeroBR()` põe o 9 antes de enviar (erro 131030 sem isso).

**Pendente com o usuário** (detalhes em `docs/PASSO-A-PASSO.md` e `docs/PROMPT-CLAUDE-CHROME.md`)
1. ~~Passos 1 a 6 (portfólio, app, token, chave da Anthropic, Railway, webhook)~~ Feitos em 18/11/2026.
7. Template `aviso_atendimento`: enviado para análise em 19/11/2026 na conta de teste, com `OWNER_TEMPLATE_NAME=aviso_atendimento` já no Railway. Template vale só para a conta (WABA) onde foi criado: recriar na conta do número real.
8. Número real (novo ou por coexistência com o app WhatsApp Business), verificação da empresa e forma de pagamento na conta do WhatsApp.
9. Não usar o número banido até a revisão do WhatsApp sair.

IDs e endereços da instalação de teste: app 1104944078981456, Phone Number ID 1482534918276729, WABA de teste 1828852601571014, Railway `https://lighthouse-imports-production.up.railway.app` (projeto "blissful-prosperity", trial de 30 dias ou US$ 5).

## Próximos passos sugeridos para a nova sessão

1. **Ajustar o prompt da Lighthouse** pelas primeiras conversas reais (o primeiro teste real foi em 18/11/2026).
2. **Conferir a aprovação** do template `aviso_atendimento` (Gerenciador do WhatsApp → Modelos de mensagem).
3. **Número real (decidido em 19/11/2026): (47) 99605-6084 em coexistência**, com o prompt único `prompts/lighthouse-dualia.md` e avisos para o (47) 99148-8351. A Meta só faz coexistência por Cadastro Incorporado de Provedor de Tecnologia; a página está pronta em `/conectar?k=<CONECTAR_KEY>` (seção 10, opção B, do guia). Falta, nesta ordem:
   - aceitar os Termos de Provedor de Tecnologia e concluir a verificação da empresa (LIGHT HOUSE IMPORTS LTDA);
   - Login do Facebook para Empresas: OAuth com SDK do JavaScript, domínio do Railway e uma configuração do Cadastro Incorporado do WhatsApp (anotar o ID);
   - no Railway: `FB_APP_ID=1104944078981456`, `ES_CONFIG_ID`, `CONECTAR_KEY`, `JARVIS_PROMPT_FILE=prompts/lighthouse-dualia.md`, `OWNER_WHATSAPP=5547991488351`;
   - webhooks: assinar também `smb_message_echoes`, `history`, `smb_app_state_sync` e `account_update`;
   - abrir `/conectar?k=...` com o celular do 99605-6084 em mãos; depois dar ao usuário do sistema `jarvis-bot` acesso à nova conta, trocar `WHATSAPP_PHONE_NUMBER_ID` e recriar o template `aviso_atendimento` nessa conta;
   - para os clientes da Dualia: análise do app para acesso avançado.
4. **Evoluções possíveis:**
   - Chatwoot como caixa de entrada para a equipe responder quem foi transferido.
   - Leads indo para n8n ou CRM via `LEADS_WEBHOOK_URL`.
   - Versão para vários clientes num servidor só (prompt escolhido pelo `phone_number_id`, armazenamento em Postgres).
   - Apresentação comercial da Dualia (setup + mensalidade + extras; ver seção 13 do guia).

## Regras importantes

- **Segredos** (tokens, chaves, App Secret) vão direto nas Variables do Railway, nunca no chat nem no Git. O `.env` está no `.gitignore`.
- **Política de IA da Meta (vigente desde janeiro de 2026):** só são permitidos assistentes que atendem pelo negócio, nada de chatbot de uso geral. O Jarvis já recusa assuntos fora da empresa.
- **Janela de 24h:** o Jarvis só responde quem escreveu. Mensagens ativas exigem template aprovado e são cobradas.
- **Modelo para a Dualia:** uma instância por cliente. A conta Meta, a conta do WhatsApp e o número ficam no nome do cliente; o app na Meta e o servidor ficam com a Dualia. Para escalar: tornar-se Tech Provider com Embedded Signup, ou usar um BSP oficial (360dialog, Gupshup, Twilio, Blip, Zenvia).
