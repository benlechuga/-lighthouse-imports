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
O projeto inclui o app do relógio (`Watch/`) e uma complicação (`WatchWidget/`).
- Lista de pendentes (atrasados em vermelho), detalhes e **Concluir** (swipe ou botão).
  Concluir no relógio é enviado ao iPhone, mesmo offline (fila do WatchConnectivity).
- Complicação "Próximo compromisso" (retangular, circular, canto e inline) no mostrador.
- As notificações continuam sendo espelhadas do iPhone (com Concluir / Adiar 10 min).
  Em Watch (app no iPhone) → Notificações → Agenda, deixe "Espelhar meu iPhone".
- Compromissos repetidos aparecem no Watch, mas só se concluem no iPhone.

**App Group:** o app do Watch e a complicação compartilham dados por `group.com.example.agenda`.
Se trocar o bundle id, troque também o grupo em `Sources/Shared/EventDTO.swift`, em `project.yml`
e ative a capability *App Groups* nos targets AgendaWatch e AgendaWatchWidget (Signing & Capabilities).
Instale o app no iPhone; o Watch pareado recebe o app automaticamente.

## Recursos
Criar/editar/apagar, repetição (dia/semana/mês/ano), aviso antecipado, concluir por swipe,
busca, seções Atrasados/Hoje/Próximos/Concluídos, alertas reagendados ao abrir o app.
