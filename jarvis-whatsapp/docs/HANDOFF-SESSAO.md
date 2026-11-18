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

**Ainda não testado de verdade**
- [ ] Chamada real ao Claude (falta a chave da Anthropic)
- [ ] Envio real pelo WhatsApp (falta configurar a Meta)

**Pendente com o usuário** (detalhes em `docs/PASSO-A-PASSO.md` e `docs/PROMPT-CLAUDE-CHROME.md`)
1. Portfólio empresarial na Meta (business.facebook.com).
2. App na Meta com o produto WhatsApp, número de teste e celular cadastrado como destinatário.
3. Token permanente (Usuário do Sistema, validade "Nunca", permissões `whatsapp_business_messaging` e `whatsapp_business_management`) e a chave secreta do app.
4. Chave da Anthropic com crédito e limite de gasto.
5. Railway: deploy da branch, Root Directory `jarvis-whatsapp`, variáveis, volume em `/app/data`, domínio público.
6. Webhook na Meta: `https://URL/webhook`, verify token e **assinatura do campo `messages`**.
7. Template `aviso_atendimento` aprovado e `OWNER_TEMPLATE_NAME` configurado.
8. Número real (novo ou por coexistência com o app WhatsApp Business), verificação da empresa e forma de pagamento na conta do WhatsApp.
9. Não usar o número banido até a revisão do WhatsApp sair.

O usuário pretende fazer os passos 2 a 7 com o Claude in Chrome, usando `docs/PROMPT-CLAUDE-CHROME.md` (precisa trocar os campos entre colchetes).

## Próximos passos sugeridos para a nova sessão

1. ~~Preencher o prompt~~ Feito em 18/11/2026 (`prompts/lighthouse.md` e `prompts/dualia.md`). Falta só **testar de verdade** com `JARVIS_PROMPT_FILE=prompts/<negócio>.md npm run chat`, quando houver chave da Anthropic, e ajustar o texto pelo que sair.
2. **Revisar a configuração** a partir do resumo que o Claude in Chrome devolver (ID do número, ID da conta WhatsApp, URL do Railway, status do webhook e do template).
3. **Primeiro teste real:** mandar "Oi" para o número de teste e conferir os logs do Railway.
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
