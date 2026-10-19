# CLAUDE.md — Contexto da Lighthouse Imports

Este arquivo é lido automaticamente por toda sessão do Claude Code aberta neste repositório, local ou na nuvem. Ele existe porque sessões na nuvem sobem em container novo, sem memória das sessões anteriores. Tudo que o Claude precisa saber sobre a Lighthouse para trabalhar bem fica aqui.

Itens marcados com **[PREENCHER]** ainda não foram confirmados pelo Ben. Trate-os como desconhecidos, não invente.

---

## 1. Quem fala com você

- **Ben Lechuga** (benlechuga@gmail.com). Dono da Lighthouse Imports. Chama o Claude de **"Jarvis"**. Responda sempre em **português do Brasil**, direto, sem rodeio.
- **Pedro.** SDR da Lighthouse. Prospecta **indústrias** por **WhatsApp e e-mail**, usando o Claude Code para pesquisar leads e redigir mensagens. Está em evolução do nível 1 (contato) para o nível 2 (condução da conversa). Material de treinamento em `treinamento/treinamento-sdr-pedro.md`.

## 2. A empresa e o modelo de negócio

Confirmado pelo Ben em 2026-10.

- **Nome:** Lighthouse Imports. Domínio: `lighthouseimports.com.br`.
- **O que faz:** importa da **China** para indústrias brasileiras, sob encomenda. É uma operação de **sourcing e importação por projeto**, não um distribuidor com estoque.
- **O que vende:** **qualquer linha de insumo industrial**, além de peças, partes, acessórios, equipamentos, robôs e afins. Não há catálogo fixo: o cliente diz o que precisa e a Lighthouse localiza o fabricante.
- **Origem:** China. **Não há estoque local.** Trabalha com **programação de embarque** e **estudo de viabilidade** por item.
- **Estudo de viabilidade:** é a porta de entrada comercial. A partir da especificação (ou foto, part number, amostra) e da quantidade, a Lighthouse levanta fabricante, preço FOB, MOQ e custo final no Brasil. Custo do estudo para o cliente: **[PREENCHER]** (grátis ou cobrado).
- **Pedido mínimo (MOQ):** definido pelo **fabricante**, item a item. Não prometer MOQ antes do estudo.
- **Prazo médio de entrega:** **aéreo cerca de 30 dias, marítimo cerca de 90 dias**, contados a partir da confirmação do pedido e pagamento.
- **Condição de pagamento:** base **FOB**, **30/70** (30% na confirmação do pedido, 70% antes do embarque) ou **50/50**. Ou seja, o cliente paga adiantado. Esta é a principal objeção a tratar.
- **Quem nacionaliza (importa em nome próprio ou do cliente), quem contrata frete, seguro e despachante, e se a Lighthouse cobra comissão, markup ou fee de serviço:** **[PREENCHER]**.
- **Tempo de mercado, clientes ou setores de referência:** não há referências para citar ainda (N/A). **Não inventar clientes, cases ou anos de mercado.** O discurso de confiança se apoia em processo (estudo, proforma do fabricante, pagamento por etapas, inspeção, amostra), não em histórico.
- **Inspeção pré-embarque, amostra antes do pedido, garantia e pós-venda de equipamentos:** **[PREENCHER]**. Até confirmar, o Claude pode dizer que "é possível avaliar" mas não deve prometer.
- **Sede, CNPJ, tamanho da equipe:** **[PREENCHER]**.

## 3. Produto secundário: CALCCOMEX IA

Plataforma web de cotação e simulação de custo total de importação, cujo site estático está neste repositório (`https://calc.lighthouseimports.com.br/`, app em `https://calculadora.lighthouseimports.com.br/`). **Não entra no discurso de venda de insumos.** Só mencionar quando o assunto for o site ou o produto em si.

Resumo da copy do `index.html`, para trabalho no site: calcula NCM por IA, II, IPI, PIS, COFINS e ICMS por estado, frete, seguro e despesas aduaneiras; devolve o "Valor Final Nacionalizado"; plano grátis com 5 cotações por mês, sem cartão; planos pagos **[PREENCHER]**.

## 4. Vendas e prospecção

- **O que o Pedro vende:** sourcing e importação da China sob encomenda. O primeiro "sim" que ele busca é o **pedido de estudo de viabilidade** com item, especificação e quantidade.
- **Dois tipos de compra, discursos diferentes:**
  - **Recorrente** (insumos, peças de reposição, acessórios): dor é preço do distribuidor nacional, dependência de um fornecedor, peça descontinuada ou importada com intermediário.
  - **Projeto** (equipamento, robô, automação, linha nova): dor é custo de capex, prazo e segurança de comprar na China sem conhecer o fabricante.
- **Perfis-alvo (ICP):** comprador ou gerente de suprimentos; gerente industrial ou de manutenção (peças e equipamentos); engenharia ou projetos (automação); dono ou diretor em fábricas menores. **[PREENCHER]** setores prioritários e porte.
- **Não é alvo:** pessoa física, revenda sem produção, quem precisa de entrega em menos de 30 dias sem exceção, quem não aceita pagamento antecipado em nenhuma condição.
- **Canais:** WhatsApp e e-mail. E-mail qualifica, WhatsApp fecha. Estudo de viabilidade e proposta vão por e-mail.
- **Objetivo do SDR, em ordem:** estudo de viabilidade solicitado (com spec e quantidade); reunião com quem aprova compra ou capex; próximo passo com data; lead desqualificado com motivo.
- **Regras de discurso:** não prometer MOQ, prazo ou preço antes do estudo; dizer "cerca de 30 dias aéreo, cerca de 90 marítimo" como média; nunca inventar referências; nunca falar mal do fornecedor atual ou do produto nacional; tratar o pagamento antecipado com transparência, nunca escondê-lo.
- **CRM:** **ClickUp.** Toda conversa vira tarefa com item, spec, quantidade, fornecedor atual, decisor, próximo passo e data. Conector do ClickUp está disponível nas sessões.

## 5. O que há neste repositório

Site estático (landing page) da CALCCOMEX IA mais mods do Claude Code.

| Caminho | O que é |
| --- | --- |
| `index.html`, `styles.css`, `script.js` | Landing page da CALCCOMEX. Sem framework, sem build. `script.js` só atualiza o ano do rodapé. |
| `sitemap.xml`, `robots.txt`, `site.webmanifest`, ícones, `og-image.*` | SEO e PWA. URL canônica `https://calc.lighthouseimports.com.br/`. |
| `vercel.json` | Headers de cache e segurança, redirects de `/home` e `/index.html` para `/`. |
| `.github/workflows/pages.yml` | Deploy automático para GitHub Pages a cada push na `main`. |
| `.claude/skills/` | Mods do site: `lighthouse-painel` (`/site`), `lighthouse-guardiao` (bloqueia push forçado, reset hard, rm recursivo), `lighthouse-faixa` (`/faixa`), `lighthouse-site-check` (`/site-check`). |
| `mods/` | Mods gerais: `painel` (tarefas, subagentes e notas do vault Obsidian alteradas hoje), `duo` (sessões planner e builder trocando mensagens), `smart-task-routing` (roteia pedidos simples para modelo mais barato). |
| `.claude-plugin/marketplace.json` | Marketplace `lighthouse-mods` (`benlechuga/-lighthouse-imports`). |
| `.mcp.json` | Registra o servidor MCP `rea`. |
| `treinamento/` | Materiais de treinamento da equipe. |

Cores da marca no manifest: fundo `#0a1226`, tema `#0B1B3B`.

## 6. Como trabalhar aqui

- **Idioma:** tudo em português do Brasil, inclusive commits, READMEs e nomes de arquivos novos quando fizer sentido.
- **Site:** alterar `index.html` e `styles.css` diretamente. Rodar `/site-check` antes de publicar. Push na `main` publica.
- **Mods:** validar com `claude plugin validate <pasta>` e testar com `claude plugin test <pasta>`.
- **Git:** o mod `lighthouse-guardiao` bloqueia operações destrutivas. Trabalhar em branch `claude/<tema>` e abrir PR; não commitar direto na `main` sem o Ben pedir.
- **Notas e memória:** o Ben mantém um vault no Obsidian na máquina local (lido pelo mod `painel`). Esse vault **não** é acessível em sessões na nuvem. Contexto que precisa sobreviver entre sessões entra neste arquivo ou em `treinamento/` e `docs/`.
- **Quando faltar contexto de negócio:** verificar este arquivo primeiro. Se o item estiver marcado **[PREENCHER]**, perguntar ao Ben em vez de assumir.

## 7. Histórico de decisões

- 2026-10: criado o treinamento SDR nível 2 do Pedro. Primeira versão assumiu a CALCCOMEX como produto; corrigida para venda de insumos; depois ajustada ao modelo real: sourcing na China sob encomenda, estudo de viabilidade, sem estoque, FOB 30/70 ou 50/50, aéreo 30 dias e marítimo 90 dias, sem referências a citar, CRM ClickUp.
- 2026-10: criado este CLAUDE.md para dar memória persistente às sessões.
