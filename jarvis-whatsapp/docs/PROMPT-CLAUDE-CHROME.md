# Prompt para o Claude in Chrome configurar o Jarvis

Cole o texto abaixo no painel do Claude in Chrome (extensão do navegador), já logado no Facebook, no GitHub e no Railway.

---

Você vai configurar a API oficial do WhatsApp (Cloud API da Meta) e publicar um servidor no Railway para mim. Siga as etapas em ordem. Trabalhe em abas novas.

REGRAS
- Não abra o WhatsApp Web e não envie mensagens por ele em nenhum momento.
- Quando aparecer login, senha, código por SMS, autenticação em dois fatores, captcha, pagamento ou aceite de termos, PARE e me peça para fazer. Continue quando eu disser "pronto".
- Tokens e chaves secretas: copie direto de uma tela para o campo de destino. Não escreva o valor no chat nem em resumo nenhum.
- Antes de clicar em qualquer coisa que exclua ou desative algo, pergunte para mim.
- Se uma tela estiver diferente do que eu descrevi, me mostre o que está vendo e pergunte, em vez de adivinhar.

ETAPA 1. Meta: app e número de teste (developers.facebook.com)
1. Meus apps → Criar app → caso de uso "Outro" → tipo "Empresa". Nome: "Jarvis - [NOME DA EMPRESA]". Vincule ao portfólio empresarial [NOME DO PORTFÓLIO].
2. Adicione o produto WhatsApp → Configurar.
3. Em WhatsApp → Configuração da API, anote o "ID do número de telefone" e o "ID da conta do WhatsApp Business". Esses dois pode me mostrar.
4. No campo "Para", adicione o número [MEU CELULAR] como destinatário de teste. O código chega no meu celular: me peça.

ETAPA 2. Meta: token permanente (business.facebook.com)
1. Configurações → Usuários → Usuários do sistema → Adicionar: nome "jarvis-bot", função Administrador.
2. Atribuir ativos: o app "Jarvis - ..." com controle total, e a conta do WhatsApp com controle total.
3. Gerar novo token → app "Jarvis - ..." → validade "Nunca" → permissões whatsapp_business_messaging e whatsapp_business_management.
4. Deixe essa aba aberta com o token visível; ele será colado na etapa 3.
5. No app (developers.facebook.com) → Configurações do app → Básico → "Chave secreta do app": deixe pronta para copiar também.

ETAPA 3. Railway (railway.com)
1. New Project → Deploy from GitHub repo → repositório "-lighthouse-imports", branch "claude/ecstatic-hypatia-s0v27j".
2. No serviço: Settings → Root Directory = "jarvis-whatsapp".
3. Variables (Raw Editor), uma por linha:
   WHATSAPP_TOKEN = (token da etapa 2)
   WHATSAPP_APP_SECRET = (chave secreta do app)
   WHATSAPP_VERIFY_TOKEN = (invente uma frase longa sem espaços, ex.: jarvis-verifica-8f3k29dk; anote para a etapa 4)
   WHATSAPP_PHONE_NUMBER_ID = (ID do número de telefone)
   OWNER_WHATSAPP = [MEU CELULAR, só dígitos com 55]
   ANTHROPIC_API_KEY = (vou colar eu mesmo: me peça)
   CLAUDE_MODEL = claude-opus-5-5
   CLAUDE_EFFORT = low
   JARVIS_PROMPT_FILE = [prompts/lighthouse.md OU prompts/dualia.md, conforme o número]
4. Adicione um Volume montado em /app/data.
5. Settings → Networking → Generate Domain. Anote a URL.
6. Espere o deploy ficar verde e abra a URL: deve aparecer "Jarvis WhatsApp online".

ETAPA 4. Meta: webhook
1. No app → WhatsApp → Configuração → Webhook → Editar.
2. URL de retorno: https://(URL do Railway)/webhook. Token de verificação: a frase da etapa 3.
3. Verificar e salvar.
4. Campos do webhook → Gerenciar → assinar "messages".

ETAPA 5. Template de aviso (WhatsApp Manager → Modelos de mensagem → Criar)
- Categoria: Utilidade. Nome: aviso_atendimento. Idioma: Português (BR).
- Corpo: Novo atendimento precisa da equipe: {{1}}. Abra o WhatsApp para responder o cliente.
- Exemplo do {{1}}: Ana (+5511988887777) · Motivo: pediu orçamento personalizado
- Envie para aprovação.

AO FINAL, me mostre um resumo com: ID do número, ID da conta WhatsApp, URL do Railway, status do webhook e status do template. Não inclua tokens nem chaves.
