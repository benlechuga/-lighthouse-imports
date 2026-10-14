# duo

Um mod do Claude Code pra duas sessões abertas no mesmo computador conversarem:
uma **planeja** (planejador) e a outra **constrói** (construtor). Quando o
planejador fecha uma etapa, manda o plano pro construtor; quando o construtor
termina, devolve o resultado. Um painel lateral mostra tudo que foi trocado.

## Como usar

Abra duas sessões do Claude Code, as duas com o mod carregado:

```sh
# terminal 1
claude --plugin-dir ./mods/duo

# terminal 2
claude --plugin-dir ./mods/duo
```

Defina o papel de cada uma (ou exporte `CLAUDE_DUO_ROLE=planner` /
`CLAUDE_DUO_ROLE=builder` antes de abrir):

```
/duo planner     # no terminal 1
/duo builder     # no terminal 2
```

Pronto. Peça algo ao planejador ("planeja a migração do módulo X em etapas").
Ele escreve a primeira etapa e envia com a ferramenta `mcp__duo__send`. A
mensagem chega no construtor como uma mensagem de outra sessão, ele implementa,
roda o que precisa e devolve o resultado com a mesma ferramenta. O planejador
revisa e manda a próxima etapa, até acabar.

O mod coloca uma seção no system prompt de cada sessão explicando o papel e o
protocolo, então o modelo sabe quando enviar e quando esperar.

## Comandos

| Comando | O que faz |
| --- | --- |
| `/duo planner` / `/duo builder` | Define o papel desta sessão e abre o painel |
| `/duo` | Abre o painel e mostra o estado (papel, outra sessão, auto) |
| `/duo auto [on\|off]` | Liga/desliga o envio automático: toda resposta do modelo vai pro outro lado (plano se planejador, resultado se construtor) sem precisar da ferramenta |
| `/duo send <texto>` | Manda uma nota sua pro outro lado |
| `/duo clear` | Limpa o painel |
| `/duo off` | Tira o papel desta sessão |

## O painel

Abre sozinho quando a sessão ganha um papel (encaixado ao lado da conversa em
tela cheia, ou acima do prompt). Mostra o papel, a outra sessão encontrada, um
toggle do modo auto, a lista de mensagens (→ enviadas, ← recebidas, com tipo e
hora; em vermelho as que não foram entregues e o motivo) e um campo pra mandar
uma nota direto pro outro lado. `ctrl+x tab` foca o painel, `Esc` volta.

## Como funciona por baixo

- Cada sessão com papel grava `~/.claude/duo/<papel>.json` com o id da sessão.
  Antes de cada envio o mod lê o arquivo do outro papel pra achar o destino.
- O envio usa `$.session.send({ to: { sessionId } })`, o mesmo canal da
  ferramenta SendMessage do Claude Code. O texto vai com um cabeçalho
  `[duo:plan|result|note from planner|builder]`.
- Do outro lado, um hook em `session.receive` reconhece o cabeçalho, registra a
  mensagem no painel e reescreve o texto com instruções pro modelo (o que fazer
  com o plano, ou como revisar o resultado). A entrega acorda a sessão se ela
  estiver ociosa.
- O histórico do painel fica em `$.state`, então sobrevive a um hot reload do
  mod, mas não a um restart da sessão.

## Desenvolvimento

```sh
claude plugin validate mods/duo
claude plugin test mods/duo
```
