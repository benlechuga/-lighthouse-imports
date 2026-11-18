# Jarvis WhatsApp

Atendente com IA (Claude) rodando na **API oficial do WhatsApp** (Cloud API da Meta).
Não usa WhatsApp Web, extensão de navegador nem bibliotecas não oficiais, então o número não corre risco de ser bloqueado por automação.

```
Cliente no WhatsApp
      │
      ▼
WhatsApp Cloud API (Meta) ──webhook──►  Jarvis (este servidor)
                                          │  junta mensagens picadas
                                          │  guarda o histórico por contato
                                          ▼
                                     Claude API ──► ferramentas:
                                          │          • registrar_lead
                                          │          • transferir_para_humano
                                          ▼
WhatsApp Cloud API ◄──── resposta ────────┘
```

👉 **Passo a passo completo (do zero até produção): [docs/PASSO-A-PASSO.md](docs/PASSO-A-PASSO.md)**

## O que já vem pronto

| Recurso | Como funciona |
|---|---|
| Webhook oficial | Verificação da Meta (`GET /webhook`) e assinatura `X-Hub-Signature-256` conferida em toda mensagem |
| Mensagens picadas | Espera `DEBOUNCE_MS` (3 s) e responde "oi / tudo bem? / quanto custa?" de uma vez |
| Memória | Histórico por contato em `data/conversas/`; conversas longas viram um resumo automático |
| Imagens | O cliente manda uma foto e o Jarvis enxerga e comenta |
| Áudio e outros tipos | O Jarvis pede com educação que o cliente escreva |
| "Digitando..." e lido | Marca como lida e mostra o indicador de digitação |
| Leads | Grava em `data/leads.jsonl` e, se você configurar, envia para `LEADS_WEBHOOK_URL` (n8n, CRM...) |
| Passar para humano | Pausa o Jarvis naquele contato e avisa o dono no WhatsApp |
| Comandos do dono | `#status`, `#pausar 55119...`, `#retomar 55119...` |
| Reenvio da Meta | Mensagens duplicadas são ignoradas |

## Começo rápido

```bash
cd jarvis-whatsapp
npm install
cp .env.example .env      # preencha pelo menos ANTHROPIC_API_KEY
npm run chat              # converse com o Jarvis no terminal, sem WhatsApp
npm test                  # testes sem custo (a API é simulada)
npm start                 # sobe o webhook na porta 3000
```

## Personalizar para um cliente

1. Copie `prompts/jarvis.md` (o modelo) para `prompts/<cliente>.md` e preencha com os dados reais da empresa (produtos, preços, FAQ, tom de voz).
2. Aponte `JARVIS_PROMPT_FILE=prompts/<cliente>.md` no `.env` e teste com `npm run chat` até as respostas ficarem como você quer.
3. Suba uma instância por cliente, cada uma com seu próprio `.env` (número, token e prompt).

Prompts prontos: `prompts/lighthouse.md` (Lighthouse Imports) e `prompts/dualia.md` (Dualia). Comentários `<!-- ... -->` dentro do prompt são anotações para quem edita e não vão para o Claude.

## Arquivos

```
src/server.js      webhook HTTP, fila por contato, comandos do dono
src/jarvis.js      conversa com o Claude, ferramentas, resumo de histórico
src/whatsapp.js    envio, assinatura, download de mídia (Graph API)
src/store.js       persistência em JSON (troque por banco quando escalar)
prompts/jarvis.md  modelo de prompt para um cliente novo
prompts/lighthouse.md, prompts/dualia.md  prompts prontos (escolha com JARVIS_PROMPT_FILE)
scripts/chat.js    chat de teste no terminal
scripts/simular-webhook.js  simula a Meta enviando uma mensagem
```
