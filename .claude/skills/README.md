# Mods do Claude Code para o site Lighthouse Imports

Cada pasta aqui é um mod (plugin de function hooks) do Claude Code. Numa sessão aberta neste
repositório eles carregam sozinhos, sem instalar nada.

| Mod | O que faz | Comando |
| --- | --- | --- |
| `lighthouse-painel` | Painel lateral com branch, mudanças pendentes, último commit e botão Publicar | `/site` |
| `lighthouse-guardiao` | Bloqueia push forçado, reset hard, remoção recursiva e apagar arquivos do site | (automático) |
| `lighthouse-faixa` | Faixa acima do prompt com branch, mudanças e status de publicação | `/faixa` |
| `lighthouse-site-check` | Valida index.html, links locais, sitemap, robots, manifest e script.js | `/site-check` |

## Instalar em outra máquina

No prompt de uma sessão do Claude Code no terminal:

```
/plugin install lighthouse-painel --marketplace benlechuga/-lighthouse-imports
/plugin install lighthouse-guardiao --marketplace benlechuga/-lighthouse-imports
/plugin install lighthouse-faixa --marketplace benlechuga/-lighthouse-imports
/plugin install lighthouse-site-check --marketplace benlechuga/-lighthouse-imports
```

Responda `y` para adicionar o marketplace e escolha o escopo (user). No app desktop: `+` ao lado
do prompt, Plugins, Add marketplace com `benlechuga/-lighthouse-imports`, depois Add plugin.

## Testar e validar

```
claude plugin validate .claude/skills/<mod>
claude plugin test .claude/skills/<mod>
```
