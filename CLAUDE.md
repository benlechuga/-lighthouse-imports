# CLAUDE.md — Contexto da Lighthouse Imports

Este arquivo é lido automaticamente por toda sessão do Claude Code aberta neste repositório, local ou na nuvem. Ele existe porque sessões na nuvem sobem em container novo, sem memória das sessões anteriores. Tudo que o Claude precisa saber sobre a Lighthouse para trabalhar bem fica aqui.

Itens marcados com **[PREENCHER]** ainda não foram confirmados pelo Ben. Trate-os como desconhecidos, não invente.

---

## 1. Quem fala com você

- **Ben Lechuga** (benlechuga@gmail.com). Dono da Lighthouse Imports. Chama o Claude de **"Jarvis"**. Responda sempre em **português do Brasil**, direto, sem rodeio.
- **Pedro.** SDR da Lighthouse. Prospecta **indústrias** por **WhatsApp e e-mail** para vender insumos importados, usando o Claude Code para pesquisar leads e redigir mensagens. Está em evolução do nível 1 (contato) para o nível 2 (condução da conversa). O material de treinamento dele está em `treinamento/treinamento-sdr-pedro.md`.

## 2. A empresa

- **Nome:** Lighthouse Imports. Domínio: `lighthouseimports.com.br`.
- **Negócio principal (confirmado pelo Ben em 2026-10):** **venda de insumos importados para a indústria.** A Lighthouse importa e vende matéria-prima e insumos para fábricas no Brasil. É isso que o Pedro vende.
- **Linhas de insumos, origens (países e fornecedores), ticket médio, pedido mínimo, prazo de entrega e condições de pagamento:** **[PREENCHER]**. Sem isso, o Claude deve usar exemplos genéricos (resinas, químicos, componentes, embalagens, metais) e deixar claro que são ilustrativos.
- **Produto secundário:** **CALCCOMEX IA**, plataforma web de cotação e simulação de custo total de importação, cujo site está neste repositório. Site em `https://calc.lighthouseimports.com.br/`; o app roda em `https://calculadora.lighthouseimports.com.br/`. **[PREENCHER]** se a CALCCOMEX entra no discurso de vendas de insumos (ex.: transparência de custo nacionalizado para o cliente) ou se é um produto separado.
- **Sede, CNPJ, tempo de mercado, tamanho da equipe, certificações:** **[PREENCHER]**.

## 3. Produto secundário: CALCCOMEX IA

Fonte: copy do `index.html`. Use estes termos, não invente outros. Lembre: o Pedro **não** vende a CALCCOMEX como produto principal.

- **Promessa:** "Calcule o custo total da sua importação em segundos com IA." Simula impostos, frete, seguro e despesas aduaneiras automaticamente. "Decida com precisão antes de fechar negócio, sem planilhas, sem chute, sem retrabalho."
- **Como funciona (3 passos):**
  1. Envia a invoice (PDF, planilha) ou descreve o produto em texto livre. A IA extrai descrição, quantidade, peso e identifica o NCM.
  2. A IA calcula impostos federais e estaduais, frete internacional, seguro, THC, capatazia, armazenagem, despachante, conforme Incoterm e modal.
  3. Devolve o **Valor Final Nacionalizado** em BRL, margem sugerida e relatório em PDF ou Excel.
- **Funcionalidades anunciadas:** classificação NCM por IA validada contra a TEC; II, IPI, PIS-Importação, COFINS-Importação e ICMS por estado; frete marítimo, aéreo e rodoviário com câmbio do dia; comparação de cenários (Incoterms, modais, regimes) lado a lado; exportação PDF e Excel; histórico versionado e auditável.
- **Números usados no site:** mais de 30 tributos e despesas cobertos; cerca de 8 segundos por cotação; 99% de precisão validada.
- **Plano grátis:** até 5 cotações por mês, sem cartão de crédito.
- **Planos pagos e preços:** **[PREENCHER]**. Enquanto não definido, não cite valores. Use "[faixa]" ou pergunte ao Ben.
- **Termo-chave do produto:** "Valor Final Nacionalizado" (sempre com essa grafia).
- **Exemplo de simulação usado no site:** NCM 8471.30.12, FOB Shanghai → Santos, FOB US$ 12.500, resultado R$ 98.124,70 nacionalizado.

## 4. Vendas e prospecção

- **O que o Pedro vende:** insumos importados para indústria. O comprador é quem decide ou influencia a compra de matéria-prima.
- **Perfis-alvo (ICP):** comprador, gerente de suprimentos ou compras de indústria; PCP ou engenharia de processo (influencia pela especificação); dono ou diretor industrial em fábricas menores. **[PREENCHER]** segmentos industriais prioritários (ex.: plástico, química, cosmético, alimentício, metalmecânica) e porte.
- **Não é alvo:** revenda sem indústria, pessoa física, empresa que só compra nacional por exigência contratual.
- **Diferenciais a usar no discurso:** **[PREENCHER]**. Hipóteses a confirmar: preço nacionalizado competitivo, previsibilidade de custo (uso da CALCCOMEX), estoque local ou programação de entrega, documentação completa (laudo, COA, FISPQ, certificado de origem), suporte de comex para o cliente.
- **Canais:** WhatsApp e e-mail. E-mail qualifica, WhatsApp fecha.
- **Objetivo do SDR, em ordem:** reunião ou visita confirmada com quem compra; pedido de cotação formal com especificação, volume e frequência; amostra aprovada ou homologação iniciada; próximo passo com data; lead desqualificado com motivo registrado.
- **CRM usado:** **[PREENCHER]**.
- **Tom de voz nas mensagens:** profissional e direto, "você" sempre, uma pergunta por mensagem, sem atacar planilha, despachante ou sistema atual do lead. Detalhes completos no treinamento do Pedro.
- **Ferramentas do SDR além do Claude Code:** **[PREENCHER]** (ex.: Mailerfind aparece como conector disponível nas sessões, confirmar se é usado para prospecção).

## 5. O que há neste repositório

Site estático (landing page) da CALCCOMEX IA mais mods do Claude Code.

| Caminho | O que é |
| --- | --- |
| `index.html`, `styles.css`, `script.js` | Landing page. Sem framework, sem build. `script.js` só atualiza o ano do rodapé. |
| `sitemap.xml`, `robots.txt`, `site.webmanifest`, ícones, `og-image.*` | SEO e PWA. A URL canônica é `https://calc.lighthouseimports.com.br/`. |
| `vercel.json` | Headers de cache e segurança, redirects de `/home` e `/index.html` para `/`. |
| `.github/workflows/pages.yml` | Deploy automático para GitHub Pages a cada push na `main`. |
| `.claude/skills/` | Mods do site: `lighthouse-painel` (`/site`), `lighthouse-guardiao` (bloqueia push forçado, reset hard, rm recursivo), `lighthouse-faixa` (`/faixa`), `lighthouse-site-check` (`/site-check`). |
| `mods/` | Mods gerais: `painel` (tarefas, subagentes e notas do vault Obsidian alteradas hoje), `duo` (sessões planner e builder trocando mensagens), `smart-task-routing` (roteia pedidos simples para modelo mais barato). |
| `.claude-plugin/marketplace.json` | Marketplace `lighthouse-mods` (`benlechuga/-lighthouse-imports`) que publica os mods acima. |
| `.mcp.json` | Registra o servidor MCP `rea` (engenharia reversa). |
| `treinamento/` | Materiais de treinamento da equipe. |

Cores da marca no manifest: fundo `#0a1226`, tema `#0B1B3B`.

## 6. Como trabalhar aqui

- **Idioma:** tudo em português do Brasil, inclusive commits, READMEs e nomes de arquivos novos quando fizer sentido.
- **Site:** alterar `index.html` e `styles.css` diretamente. Rodar `/site-check` antes de publicar. Push na `main` publica.
- **Mods:** validar com `claude plugin validate <pasta>` e testar com `claude plugin test <pasta>`.
- **Git:** o mod `lighthouse-guardiao` bloqueia operações destrutivas. Trabalhar em branch `claude/<tema>` e abrir PR; não commitar direto na `main` sem o Ben pedir.
- **Notas e memória:** o Ben mantém um vault no Obsidian na máquina local (lido pelo mod `painel`). Esse vault **não** está acessível em sessões na nuvem. Contexto que precisa sobreviver entre sessões deve entrar neste arquivo ou em `treinamento/` e `docs/`.
- **Quando faltar contexto de negócio:** verificar este arquivo primeiro. Se o item estiver marcado **[PREENCHER]**, perguntar ao Ben em vez de assumir.

## 7. Histórico de decisões

- 2026-10: criado o treinamento SDR nível 2 do Pedro (`treinamento/treinamento-sdr-pedro.md`), com provas, gabarito e roleplays no Claude Code. Primeira versão foi escrita para a CALCCOMEX por falta de contexto; reescrita para venda de insumos industriais após o Ben corrigir. Revisar quando os itens [PREENCHER] forem definidos.
- 2026-10: criado este CLAUDE.md para dar memória persistente às sessões.
