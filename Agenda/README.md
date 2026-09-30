# Agenda

App de agenda para iPhone (SwiftUI + SwiftData, iOS 17+). Os lembretes são notificações
locais: funcionam offline, sem servidor, e o iOS os espelha no Apple Watch pareado
(com os botões **Concluir** e **Adiar 10 min**).

## Rodar
1. No Mac: `brew install xcodegen`
2. `cd Agenda && xcodegen` → gera `Agenda.xcodeproj`
3. Abra no Xcode, escolha seu Team em Signing, troque o bundle id (`com.example.agenda`) e rode no iPhone.
4. Aceite a permissão de notificações.

## Apple Watch
Nada a instalar no relógio. Em Watch (app no iPhone) → Notificações → Agenda, deixe
"Espelhar meu iPhone". O espelhamento ocorre quando o iPhone está bloqueado; com o
iPhone desbloqueado, o alerta aparece só nele.

## Recursos
Criar/editar/apagar, repetição (dia/semana/mês/ano), aviso antecipado, concluir por swipe,
busca, seções Atrasados/Hoje/Próximos/Concluídos, alertas reagendados ao abrir o app.
