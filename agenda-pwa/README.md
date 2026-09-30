# Agenda (PWA)

Agenda instalável no iPhone (sem Mac, sem App Store). Os lembretes chegam por **Web Push**
e o iOS os espelha no **Apple Watch** pareado (iPhone bloqueado), como qualquer notificação.

**Arquitetura**
- `public/` – app (HTML/JS puro, funciona offline) + Service Worker que exibe os pushes.
- `api/` + `lib/` – funções da Vercel: sincronizam os compromissos, calculam os lembretes
  (com repetição e fuso horário) e enviam os pushes.
- Upstash Redis guarda os compromissos e a fila de lembretes.
- Um agendador externo chama `/api/cron` **a cada minuto** (a Vercel Hobby só permite cron diário).

## Publicar (≈10 min, tudo pelo navegador)

1. **Vercel** → *Add New Project* → importe este repositório → **Root Directory: `agenda-pwa`**
   (Framework: *Other*; o `.gitignore`/`vercel.json` já estão prontos). Branch: `claude/agenda-app` (ou a que você fizer merge).
2. **Redis**: no projeto → *Storage* → *Marketplace* → **Upstash for Redis** (plano grátis) → conectar ao projeto.
   Isso cria as variáveis `KV_REST_API_URL` e `KV_REST_API_TOKEN` sozinho.
3. **Variáveis de ambiente** (Settings → Environment Variables):
   | Nome | Valor |
   |---|---|
   | `VAPID_PUBLIC_KEY` | chave pública gerada (ver abaixo) |
   | `VAPID_PRIVATE_KEY` | chave privada gerada |
   | `VAPID_SUBJECT` | `mailto:seu@email.com` |
   | `CRON_SECRET` | uma senha longa qualquer |
   Gere as chaves VAPID com `npm install && npm run keys` (ou peça ao Claude).
4. **Redeploy** para as variáveis valerem.
5. **Agendador por minuto**: em https://cron-job.org (grátis) crie um job:
   URL `https://SEU-APP.vercel.app/api/cron?key=SEU_CRON_SECRET`, execução **a cada 1 minuto**.
   (Na Vercel Pro você pode usar `crons` no `vercel.json` com `* * * * *`.)

## Instalar no iPhone (iOS 16.4+)
1. Abra `https://SEU-APP.vercel.app` no **Safari**.
2. Compartilhar → **Adicionar à Tela de Início** → abra o app **pelo ícone** (obrigatório para push no iOS).
3. Toque em **Ativar notificações** e aceite.
4. Toque no pontinho verde (canto superior direito) → *Enviar notificação de teste*.
5. Apple Watch: app Watch → Notificações → Agenda → **Espelhar meu iPhone**.

## Limitações
- O Apple Watch só espelha o alerta; não há app/complicação no relógio nem botões Concluir/Adiar
  (o iOS não exibe botões de ação em push web). Toque na notificação para abrir o app.
- Um dispositivo por "conta" é o uso previsto: o identificador (uid) fica no aparelho e funciona como senha.
- O lembrete chega com até ~1 min de atraso (granularidade do agendador externo).

## Testes
`npm test` – cobre fusos/horário de verão, repetições, envio, adiar, concluir e limpeza de assinaturas mortas.
