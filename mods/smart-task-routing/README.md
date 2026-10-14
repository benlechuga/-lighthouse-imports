# smart-task-routing

Mod do Claude Code que olha cada pedido antes de mandar para o modelo. Pedido simples vai para um modelo mais barato e rápido (`haiku` por padrão); o resto continua no modelo principal da sessão. Toda resposta termina com uma linha dizendo qual modelo respondeu.

## O que conta como simples

As regras locais (sem custo, sem chamada de modelo) marcam como simples:

- renomear ou mover um arquivo
- formatar ou indentar um texto
- resumir algo curto (até 3000 caracteres no pedido)
- comando de git (status, commit, push, pull, branch, stash, diff, log...)
- mensagem curta (oi, obrigado, ok)

Fica no modelo principal qualquer pedido que: tenha bloco de código, passe de 600 caracteres, peça vários passos ("e depois"), ou fale em implementar, corrigir, depurar, refatorar, testar, explicar, planejar, revisar, rebase ou conflito.

Se o pedido não bate em nenhuma regra, fica no modelo principal. Com `classifier: haiku` no `/config`, esses casos em dúvida são perguntados ao modelo barato antes.

## Ligar e desligar

- `/routing on` e `/routing off` (vale entre sessões)
- botão **Ligar / Desligar** na faixa acima do prompt
- `/routing` mostra o estado e a contagem da sessão
- `/routing test <pedido>` mostra para onde aquele pedido iria, sem mandar nada

## O rótulo em cada resposta

- `⚡ haiku-4-5 · comando de git`: respondido pelo modelo barato, e o motivo
- `● opus-5-5 · modelo principal`: respondido pelo modelo principal
- `⚡→● haiku → opus-5-5 · ...`: começou no barato, passou de `maxCheapSteps` chamadas (8 por padrão) e o resto da resposta voltou ao principal
- `● opus-5-5 · roteador desligado`

## Opções (`/config`)

| opção | padrão | o que faz |
| --- | --- | --- |
| `cheapModel` | `haiku` | alias ou id completo do modelo barato. Se a sessão recusar o alias, use o id completo |
| `classifier` | `rules` | `haiku` pergunta ao modelo barato nos casos em dúvida |
| `cheapEffort` | `low` | esforço de raciocínio pedido ao modelo barato (`keep` mantém o da sessão) |
| `maxCheapSteps` | `8` | depois disso a resposta volta ao modelo principal |

## Desenvolvimento

```
claude plugin validate .
claude plugin test .
```
