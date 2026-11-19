# Jarvis no WhatsApp oficial: passo a passo

Este guia leva você do zero até o Jarvis atendendo clientes reais pela **API oficial do WhatsApp (Cloud API da Meta)**. Serve para o seu próprio número, para os clientes da Dualia e para os seus mentorados.

> As telas da Meta mudam de nome e de lugar com frequência. Se um menu não estiver exatamente onde o guia indica, procure pelo nome da função (por exemplo, "Usuários do sistema" ou "Webhooks").

---

## Sumário

0. [Por que este caminho e quanto custa](#0-por-que-este-caminho-e-quanto-custa)
1. [O que você precisa ter antes](#1-o-que-você-precisa-ter-antes)
2. [Criar o app na Meta](#2-criar-o-app-na-meta)
3. [Gerar o token permanente](#3-gerar-o-token-permanente)
4. [Criar a chave do Claude](#4-criar-a-chave-do-claude)
5. [Rodar o Jarvis no seu computador](#5-rodar-o-jarvis-no-seu-computador)
6. [Conectar o webhook](#6-conectar-o-webhook)
7. [Primeiro teste real no WhatsApp](#7-primeiro-teste-real-no-whatsapp)
8. [Personalizar o Jarvis para o negócio](#8-personalizar-o-jarvis-para-o-negócio)
9. [Colocar no ar (hospedagem)](#9-colocar-no-ar-hospedagem)
10. [Trocar o número de teste pelo número real](#10-trocar-o-número-de-teste-pelo-número-real)
11. [Atendimento humano e comandos do dono](#11-atendimento-humano-e-comandos-do-dono)
12. [Regras da Meta que você precisa respeitar](#12-regras-da-meta-que-você-precisa-respeitar)
13. [Modelo para a Dualia (vários clientes)](#13-modelo-para-a-dualia-vários-clientes)
14. [Problemas comuns](#14-problemas-comuns)
15. [Checklist final](#15-checklist-final)

---

## 0. Por que este caminho e quanto custa

**Por que o número foi bloqueado antes:** automatizar o WhatsApp Web (com extensão, Claude no Chrome, Z-API, Evolution API, Baileys etc.) viola os termos do WhatsApp. O sistema antispam percebe o padrão e bane o número. A API oficial existe justamente para empresas automatizarem o atendimento, por isso não há esse risco.

**Custos (confira sempre as tabelas oficiais, porque os valores mudam):**

| Item | Como é cobrado |
|---|---|
| WhatsApp Cloud API | Grátis para **responder** o cliente dentro de 24h da última mensagem dele. Mensagens que **a empresa inicia** (templates de marketing, utilidade e autenticação) são cobradas por mensagem, conforme a tabela de preços do Brasil na página de preços do WhatsApp Business. |
| Claude (Anthropic) | Cobrado por uso (tokens). Um atendimento comum custa centavos. Para baratear, troque `CLAUDE_MODEL` para `claude-sonnet-5-5` ou `claude-haiku-5-5` no `.env`. |
| Hospedagem | De R$ 0 a R$ 50/mês para começar (Railway, Render, Fly.io ou uma VPS). |

Neste projeto o Jarvis **só responde** quem chamou primeiro. Então, na prática, o custo da Meta é zero e você paga só o Claude e a hospedagem.

---

## 1. O que você precisa ter antes

- [ ] **Conta no Facebook** pessoal (é ela que administra o Business).
- [ ] **Portfólio empresarial na Meta (Business Manager):** em business.facebook.com, crie com o nome e o CNPJ (ou CPF) da empresa.
- [ ] **Um número de telefone para o Jarvis.** Ele pode ser:
  - um número novo (chip ou fixo que receba SMS ou ligação), **ou**
  - o número que já está no app WhatsApp Business, usando a **coexistência** (ver passo 10).
  - ⚠️ **Não use o número que acabou de ser banido** até a revisão sair. Peça a revisão pelo próprio app.
- [ ] **Conta na Anthropic** (console.anthropic.com) com crédito.
- [ ] **Node.js 20 ou superior** instalado (nodejs.org) e o código desta pasta (`jarvis-whatsapp/`).

---

## 2. Criar o app na Meta

1. Acesse **developers.facebook.com** → **Meus apps** → **Criar app**.
2. Escolha o caso de uso **"Outro"** e o tipo **"Empresa" (Business)**. Dê um nome (ex.: "Jarvis - Nome da Empresa") e vincule ao seu portfólio empresarial.
3. No painel do app, encontre o produto **WhatsApp** e clique em **Configurar**.
4. Vá em **WhatsApp → Configuração da API** (API Setup). A Meta dá um **número de teste** gratuito. Anote:
   - **ID do número de telefone** (Phone number ID) → vai no `WHATSAPP_PHONE_NUMBER_ID`
   - **ID da conta do WhatsApp Business** (WABA ID) → guarde, será usado no passo 3
5. Ainda nessa tela, em **"Para"** (To), **adicione o seu celular pessoal** como destinatário de teste e confirme o código que chega no WhatsApp. O número de teste só conversa com até 5 números cadastrados.
6. Vá em **Configurações do app → Básico** e copie a **Chave secreta do app** (App Secret) → vai no `WHATSAPP_APP_SECRET`.

---

## 3. Gerar o token permanente

O token que aparece na tela de configuração expira em 24h. Para produção, gere um **token de Usuário do Sistema**, que não expira:

1. Acesse **business.facebook.com → Configurações → Usuários → Usuários do sistema**.
2. Clique em **Adicionar**, dê um nome (ex.: "jarvis-bot") e escolha a função **Administrador**.
3. Clique em **Atribuir ativos**:
   - **Apps:** selecione o app do Jarvis, com controle total.
   - **Contas do WhatsApp:** selecione a sua WABA, com controle total.
4. Clique em **Gerar novo token**, escolha o app e marque as permissões:
   - `whatsapp_business_messaging`
   - `whatsapp_business_management`
5. Em validade, escolha **"Nunca"**. Copie o token → vai no `WHATSAPP_TOKEN`.

> 🔒 Esse token dá acesso total ao WhatsApp da empresa. Não mande por WhatsApp nem por e-mail, e nunca suba o `.env` para o GitHub (o `.gitignore` já bloqueia).

---

## 4. Criar a chave do Claude

1. Acesse **console.anthropic.com** → **API Keys** → **Create Key**.
2. Copie a chave → vai no `ANTHROPIC_API_KEY`.
3. Em **Billing**, adicione créditos e defina um **limite de gasto mensal**. Isso protege você de surpresas.
4. Para cada cliente da Dualia, crie uma **chave separada** (ou um workspace separado). Assim você sabe quanto cada um consome.

---

## 5. Rodar o Jarvis no seu computador

```bash
cd jarvis-whatsapp
npm install
cp .env.example .env
```

Abra o `.env` e preencha:

```env
WHATSAPP_TOKEN=EAAG...            # passo 3
WHATSAPP_APP_SECRET=abc123...     # passo 2.6
WHATSAPP_VERIFY_TOKEN=jarvis-uma-frase-longa-que-so-voce-sabe-8271
WHATSAPP_PHONE_NUMBER_ID=1234567890   # passo 2.4
OWNER_WHATSAPP=5511999999999      # seu celular (recebe os avisos)
ANTHROPIC_API_KEY=sk-ant-...      # passo 4
```

**Teste a personalidade sem o WhatsApp:**

```bash
npm run chat
```

Converse como se fosse um cliente. Digite `/novo` para recomeçar e `/sair` para sair.

**Suba o servidor:**

```bash
npm start
# Jarvis ouvindo em http://localhost:3000  (webhook: /webhook)
```

**Exponha para a internet (só para testar).** A Meta precisa de um endereço HTTPS público. Em outro terminal, rode uma das opções:

```bash
npx cloudflared tunnel --url http://localhost:3000
# ou: ngrok http 3000
```

Copie o endereço `https://....trycloudflare.com` (ou o do ngrok).

---

## 6. Conectar o webhook

1. No painel do app: **WhatsApp → Configuração** (Configuration) → **Webhook** → **Editar**.
2. Preencha:
   - **URL de retorno de chamada:** `https://SEU-ENDERECO/webhook`
   - **Token de verificação:** o mesmo texto que você colocou em `WHATSAPP_VERIFY_TOKEN`
3. Clique em **Verificar e salvar**. Se der certo, o Jarvis respondeu ao desafio da Meta.
4. Em **Campos do webhook**, clique em **Gerenciar** e **assine o campo `messages`**. ⚠️ Esse passo é o mais esquecido: sem ele, nada chega.

---

## 7. Primeiro teste real no WhatsApp

1. Do seu celular (o que você cadastrou como destinatário no passo 2.5), mande **"Oi"** para o número de teste.
2. Em uns 3 a 5 segundos você deve ver: ✔✔ azul, "digitando..." e a resposta do Jarvis.
3. Teste também:
   - mandar 3 mensagens seguidas (ele responde tudo de uma vez);
   - mandar uma foto de produto;
   - pedir um orçamento (o lead aparece em `data/leads.jsonl`);
   - pedir "quero falar com uma pessoa" (você recebe o aviso no `OWNER_WHATSAPP`).

Não funcionou? Veja a seção [14. Problemas comuns](#14-problemas-comuns).

---

## 8. Personalizar o Jarvis para o negócio

Tudo que o Jarvis sabe sobre a empresa está num arquivo de prompt. O servidor usa o arquivo indicado em **`JARVIS_PROMPT_FILE`**:

- `prompts/lighthouse.md`: Lighthouse Imports, pronto.
- `prompts/dualia.md`: Dualia, pronto.
- `prompts/jarvis.md`: modelo em branco. Para um cliente novo, copie para `prompts/<cliente>.md` e aponte `JARVIS_PROMPT_FILE` para ele. Se o servidor subir com o modelo, ele avisa no log.

Comentários `<!-- ... -->` no arquivo são anotações para quem edita e não chegam ao Claude.

No prompt de um cliente novo, preencha:

- **Sobre a empresa:** o que faz, cidade, horário, links.
- **Produtos e serviços:** com preço só se puder ser passado pelo WhatsApp.
- **Perguntas frequentes:** pagamento, prazo, garantia, trocas.
- **Próximo passo:** o que o Jarvis deve oferecer quando o cliente estiver pronto (orçamento, visita, link de compra).
- **O que não fazer:** descontos, promessas, assuntos proibidos.

Dicas:

- Quanto mais completo o prompt, menos o Jarvis precisa transferir para um humano.
- Depois de editar, **reinicie o servidor** (o prompt é lido na inicialização).
- Teste sempre com `npm run chat` antes de ir para produção.
- As regras do canal (formatação do WhatsApp, quando transferir, não inventar preço, resistir a tentativas de manipulação) já ficam fixas no código, em `src/jarvis.js`, e valem para todos os clientes.

**Ajustes no `.env`:**

| Variável | Para que serve |
|---|---|
| `JARVIS_PROMPT_FILE` | Qual prompt usar: `prompts/lighthouse.md`, `prompts/dualia.md` ou o do cliente |
| `CLAUDE_MODEL` | `claude-opus-5-5` (padrão, mais inteligente), `claude-sonnet-5-5` (mais barato), `claude-haiku-5-5` (o mais barato; nesse caso deixe `CLAUDE_FALLBACKS` vazio) |
| `CLAUDE_EFFORT` | `low` para atendimento rápido; `medium` se precisar de mais raciocínio |
| `DEBOUNCE_MS` | Quanto tempo esperar para juntar mensagens picadas |
| `LEADS_WEBHOOK_URL` | Manda cada lead para o n8n, Make, Zapier ou CRM |

---

## 9. Colocar no ar (hospedagem)

O túnel do passo 5 serve só para testes. Para produção, o Jarvis precisa ficar ligado 24h num servidor com HTTPS. Opções:

**Railway ou Render (mais fácil):**

1. Suba esta pasta para um repositório no GitHub (sem o `.env`).
2. Crie um serviço novo apontando para o repositório. Em **Settings → Root Directory**, coloque `jarvis-whatsapp` (no Railway, o `railway.json` e o `Dockerfile` já configuram o build e o health check).
3. Cadastre as variáveis do `.env` no painel de variáveis do serviço.
4. **Crie um volume persistente montado em `/app/data`.** Sem ele, o histórico e os leads somem a cada deploy.
5. Copie a URL pública (ex.: `https://jarvis-cliente.up.railway.app`) e atualize o webhook na Meta (passo 6) para `https://.../webhook`.

**VPS (Hostinger, DigitalOcean, Contabo...):**

```bash
docker build -t jarvis .
docker run -d --name jarvis --restart always \
  --env-file .env -p 3000:3000 -v $(pwd)/data:/app/data jarvis
```

Coloque um proxy com HTTPS na frente (Caddy é o mais simples) e aponte um subdomínio, como `jarvis.suaempresa.com.br`.

Para conferir se está no ar: abrir `https://SEU-ENDERECO/` deve mostrar "Jarvis WhatsApp online".

---

## 10. Trocar o número de teste pelo número real

No **Gerenciador do WhatsApp** (business.facebook.com → WhatsApp Manager) → **Números de telefone** → **Adicionar número**:

**Opção A: número novo (mais simples)**

1. Informe o **nome de exibição** (precisa bater com a marca; a Meta revisa).
2. Confirme o número por SMS ou ligação.
3. O número **não pode estar ativo** em nenhum app WhatsApp. Se estiver, apague a conta no app antes.

**Opção B: coexistência (manter o app WhatsApp Business no celular)**

O **mesmo número** fica no app WhatsApp Business do celular **e** na API: a equipe continua respondendo pelo celular, e o Jarvis atende pela API. Esse caminho **não** é feito pelo "Adicionar número" do Gerenciador: a Meta só libera pelo **Cadastro Incorporado** (Embedded Signup), e só para quem é **Provedor de Tecnologia** ou **Parceiro de Soluções**. O servidor do Jarvis já traz a página pronta em `/conectar`.

1. **Provedor de Tecnologia:** no app (developers.facebook.com) → Casos de uso → WhatsApp → **Torne-se um Provedor de Tecnologia** → *Independent Tech Provider* → **Iniciar integração** (aceita os Termos de Provedor de Tecnologia). Faça também a **verificação da empresa** (Central de Segurança do portfólio). Para ligar números de **outras** empresas (clientes da Dualia), o app precisa de **acesso avançado** às permissões `whatsapp_business_management` e `whatsapp_business_messaging` (análise do app). Administradores e desenvolvedores do app já conseguem testar o fluxo com o próprio Facebook.
2. **Login do Facebook para Empresas:** adicione o produto ao app. Em **Configurações** → *Configurações de OAuth do cliente*, ative Login do cliente com OAuth, Login do OAuth da web, Aplicar HTTPS, Login com OAuth via navegador incorporado, modo restrito para URIs de redirecionamento e **Login com o SDK do JavaScript**. Em **Domínios permitidos** e **URIs de redirecionamento de OAuth válidos**, coloque o domínio do servidor (ex.: `https://lighthouse-imports-production.up.railway.app/`).
3. **Configuração do cadastro:** em Login do Facebook para Empresas → **Configurações** → **Criar a partir de modelo** → *Configuração do cadastro incorporado do WhatsApp* (ou **Criar configuração** com a variação **Cadastro Incorporado do WhatsApp**). Anote o **ID da configuração**.
4. **Webhooks:** em WhatsApp → Configuração, assine os campos `messages`, `smb_message_echoes`, `history`, `smb_app_state_sync` e `account_update`.
5. **Variáveis no servidor:** `FB_APP_ID` (ID do app), `ES_CONFIG_ID` (ID da configuração), `CONECTAR_KEY` (um texto longo e aleatório que só você conhece) e, se quiser mudar, `HUMANO_PAUSA_HORAS` (padrão 12) e `ES_VERSION` (padrão `v5`).
6. **Conectar:** com o celular do número em mãos (app WhatsApp Business **2.24.17 ou mais novo**, aberto), abra `https://SEU-SERVIDOR/conectar?k=SUA_CONECTAR_KEY`, clique em **Conectar com o Facebook**, escolha **conectar uma conta existente do WhatsApp Business**, confirme no celular e **compartilhe o histórico**. A página troca o código pelo token, assina os webhooks da conta, pede a sincronização de contatos e histórico (a Meta só aceita uma vez, em até 24 horas) e confere se o número ficou `is_on_biz_app: true` e `platform_type: CLOUD_API`. Sem a chave certa, a página responde 404. O token da empresa não é salvo nem aparece no log; cada conexão fica registrada em `data/conexoes.jsonl` (só IDs e o resultado de cada etapa).
7. **Token de envio:** o Jarvis envia com o `WHATSAPP_TOKEN` (usuário do sistema). Dê a esse usuário do sistema acesso à nova conta do WhatsApp no portfólio e troque o `WHATSAPP_PHONE_NUMBER_ID` pelo ID do número conectado.

**Atendimento humano na coexistência:** quando alguém da equipe responde um cliente **pelo celular**, a Meta manda um eco (`smb_message_echoes`) e o Jarvis fica em silêncio com aquele cliente por `HUMANO_PAUSA_HORAS` (padrão 12 h). Se o cliente escrever nesse período, o Jarvis não responde. Passado o prazo, ele volta sabendo que houve atendimento humano. `#retomar <número>` encerra a pausa antes; `#pausar <número>` continua sendo a pausa sem prazo. Se a equipe responder enquanto o Jarvis ainda está escrevendo, a resposta do Jarvis é descartada.

Limites: com coexistência o número tem vazão fixa de 20 mensagens por segundo; mensagens temporárias, de visualização única e listas de transmissão ficam desativadas no app; grupos não são sincronizados. Mensagens enviadas pelo app do celular continuam gratuitas.

**Depois de adicionar:**

1. Troque o `WHATSAPP_PHONE_NUMBER_ID` no `.env` pelo ID do número real.
2. Em **Configurações do negócio → Central de segurança**, faça a **verificação da empresa** (CNPJ, documento, site ou domínio). Ela libera limites maiores e o nome verificado.
3. Configure **perfil, foto, descrição e horário** do número no WhatsApp Manager.
4. Coloque uma **forma de pagamento** na WABA. É exigida mesmo que você só responda clientes.

---

## 11. Atendimento humano e comandos do dono

**Quando o Jarvis transfere:** o cliente pediu uma pessoa, houve reclamação séria, ou a resposta depende da equipe. Nesse caso:

1. O Jarvis avisa o cliente que alguém vai continuar.
2. O Jarvis **para de responder** aquele contato.
3. O número em `OWNER_WHATSAPP` recebe um aviso com o resumo da conversa.

**Comandos** (enviados do `OWNER_WHATSAPP` para o número do Jarvis):

| Comando | O que faz |
|---|---|
| `#status` | Confirma que o Jarvis está online |
| `#pausar 5511988887777` | Para o Jarvis naquele contato (você assume) |
| `#retomar 5511988887777` | O Jarvis volta a atender aquele contato |

> ⚠️ **Janela de 24h do dono:** o aviso para o dono também é uma mensagem do WhatsApp. Se o dono não falou com o número do Jarvis nas últimas 24h, a Meta bloqueia mensagens livres. A solução é um **template de utilidade**, que o Jarvis usa automaticamente quando a mensagem normal é recusada:
>
> 1. No WhatsApp Manager → **Modelos de mensagem** → **Criar modelo**.
> 2. Categoria **Utilidade**, nome `aviso_atendimento`, idioma **Português (BR)**.
> 3. Corpo: `Novo atendimento precisa da equipe: {{1}}. Abra o WhatsApp para responder o cliente.` (no exemplo do `{{1}}`, coloque: `Ana (+5511988887777) · Motivo: pediu orçamento personalizado`).
> 4. Envie para aprovação (costuma levar de minutos a algumas horas).
> 5. Depois de aprovado, coloque `OWNER_TEMPLATE_NAME=aviso_atendimento` nas variáveis.
>
> Até o template ser aprovado, mande um `#status` por dia para manter a janela aberta. Os avisos não entregues ficam no log do servidor.

**Como o humano responde:**

- Com a **coexistência**, a equipe responde direto pelo app WhatsApp Business no celular.
- Sem coexistência, o número fica só na API. Para a equipe responder, conecte uma **caixa de entrada**. O **Chatwoot** é gratuito, open source e funciona com a API oficial. Essa é a evolução natural do projeto para clientes com equipe de atendimento.

---

## 12. Regras da Meta que você precisa respeitar

1. **Janela de 24h:** você só pode mandar mensagem livre até 24h depois da última mensagem do cliente. Depois disso, só com **template aprovado** (que é cobrado). O Jarvis responde sempre dentro da janela.
2. **Política de IA (vale desde janeiro de 2026):** a Meta proíbe chatbots de IA de **uso geral** na API. Assistentes que atendem **pelo negócio** (suporte, vendas, agendamento) são permitidos. O Jarvis já vem instruído a atender só assuntos da empresa e recusar o resto. **Não venda o produto como "ChatGPT no WhatsApp".** Venda como "atendente virtual da sua empresa".
3. **Consentimento (opt-in):** só mande mensagens ativas (templates) para quem autorizou receber. Responder quem chamou é sempre permitido.
4. **Qualidade:** se muitos clientes bloquearem ou denunciarem o número, a classificação de qualidade cai e os limites diminuem. Acompanhe no WhatsApp Manager.
5. **LGPD:** o Jarvis guarda conversas e leads em `data/`. Informe isso na política de privacidade da empresa, apague os dados de quem pedir e restrinja o acesso ao servidor.

---

## 13. Modelo para a Dualia (vários clientes)

**Arquitetura recomendada para começar: uma instância por cliente.**

```
Cliente A ── número A ── Jarvis (instância A, prompt A, .env A)
Cliente B ── número B ── Jarvis (instância B, prompt B, .env B)
```

- Isolamento total: o problema de um cliente não afeta outro.
- Cada um com seu prompt, seus leads e seu custo de IA separado.
- No Railway ou Render, é só duplicar o serviço e trocar as variáveis.

**De quem é cada coisa (importante para o contrato):**

| Item | Recomendação |
|---|---|
| Portfólio Meta, WABA e número | **Do cliente.** Ele é o dono; você entra como parceiro ou administrador. Se o contrato acabar, o número continua com ele. |
| App Meta e servidor | Da Dualia |
| Chave do Claude | Da Dualia (repasse o custo na mensalidade) ou do cliente |

**Para escalar (muitos clientes):**

- Torne-se **Tech Provider da Meta** (em developers.facebook.com, no programa de parceiros) e use o **Embedded Signup**. O cliente conecta o próprio número em poucos cliques, sem você pedir senha ou token.
- Uma alternativa mais rápida é usar um provedor oficial (BSP) com programa de parceiros, como 360dialog, Gupshup, Twilio, Blip ou Zenvia. Eles cuidam do cadastro, e você só troca a URL e o token da API em `src/whatsapp.js`.
- Mais tarde, junte tudo numa instância multi-cliente, que escolhe o prompt pelo `phone_number_id` que chega no webhook, e troque o armazenamento em JSON por Postgres.

**Pacote sugerido para vender:**

1. **Setup** (valor único): conta Meta, número, prompt personalizado, testes e treinamento da equipe.
2. **Mensalidade:** hospedagem, IA, ajustes no prompt e relatório mensal de leads.
3. **Extras:** integração com CRM ou agenda (via `LEADS_WEBHOOK_URL` + n8n), Chatwoot para a equipe e mensagens ativas com templates.

**Para os mentorados**, a trilha sugerida é: passos 1 a 7 com o número de teste → passo 8 com um negócio real (pode ser fictício) → passo 9 no Railway → passo 10 com um número real.

---

## 14. Problemas comuns

| Sintoma | Causa provável e solução |
|---|---|
| "Verificar e salvar" falha na Meta | Servidor fora do ar, URL sem `/webhook`, ou `WHATSAPP_VERIFY_TOKEN` diferente do que foi digitado no painel |
| Webhook verificou, mas nada chega | Faltou **assinar o campo `messages`** (passo 6.4) |
| Chega, mas o log mostra `401 assinatura inválida` | `WHATSAPP_APP_SECRET` errado (precisa ser o do **mesmo app**) |
| `WhatsApp API 401` ao responder | Token expirado ou sem permissão. Gere o token de Usuário do Sistema (passo 3) |
| `Recipient phone number not in allowed list` | Com o número de teste, o destinatário precisa estar cadastrado (passo 2.5) |
| `Re-engagement message` / erro 131047 | Passaram mais de 24h desde a última mensagem do cliente. Só é possível falar com template |
| O dono não recebe avisos | Janela de 24h do dono (ver passo 11) ou `OWNER_WHATSAPP` em formato errado (só dígitos, com 55) |
| O Jarvis responde "tive uma instabilidade" | Erro no Claude: veja o log. Normalmente é a chave errada, falta de crédito ou limite de uso |
| O Jarvis não responde um contato | Ele pode estar pausado (transferido). Envie `#retomar NUMERO` |
| Histórico some depois do deploy | Falta o volume persistente em `/app/data` (passo 9) |

**Teste local sem WhatsApp:** com `WHATSAPP_DRY_RUN=true` no `.env`, rode `npm start` e, em outro terminal:

```bash
npm run simular -- "Oi, quanto custa o serviço?"
```

A resposta aparece no terminal do servidor, sem enviar nada para o WhatsApp.

---

## 15. Checklist final

- [ ] App criado na Meta e produto WhatsApp adicionado
- [ ] Token permanente (Usuário do Sistema) no `.env`
- [ ] App Secret e Verify Token no `.env`
- [ ] Chave do Claude com limite de gasto
- [ ] Prompt do cliente preenchido, `JARVIS_PROMPT_FILE` apontando para ele e testado com `npm run chat`
- [ ] Servidor no ar com HTTPS e volume persistente
- [ ] Webhook verificado **e** campo `messages` assinado
- [ ] Teste real: texto, várias mensagens seguidas, foto, pedido de orçamento, pedido de humano
- [ ] Número real adicionado, nome de exibição aprovado, empresa verificada
- [ ] Forma de pagamento cadastrada na WABA
- [ ] Política de privacidade menciona o atendimento automatizado
- [ ] Dono sabe usar `#pausar`, `#retomar` e `#status`
