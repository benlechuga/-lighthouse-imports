import SwiftUI
import SwiftData

struct ContentView: View {
    @Environment(\.modelContext) private var context
    @Environment(\.scenePhase) private var scenePhase
    @Query(sort: \Event.date) private var events: [Event]
    @State private var editing: Event?
    @State private var creating = false
    @State private var search = ""
    @State private var denied = false

    private var filtered: [Event] {
        search.isEmpty ? events : events.filter {
            $0.title.localizedCaseInsensitiveContains(search) || $0.notes.localizedCaseInsensitiveContains(search)
        }
    }
    private var today: [Event] { filtered.filter { !$0.isDone && Calendar.current.isDateInToday($0.date) } }
    private var upcoming: [Event] { filtered.filter { !$0.isDone && $0.date > .now && !Calendar.current.isDateInToday($0.date) } }
    private var overdue: [Event] { filtered.filter { !$0.isDone && $0.date < .now && !Calendar.current.isDateInToday($0.date) } }
    private var done: [Event] { filtered.filter(\.isDone) }

    var body: some View {
        NavigationStack {
            List {
                if denied {
                    Section {
                        Label("Notificações desativadas. Ative em Ajustes para receber no Apple Watch.", systemImage: "bell.slash")
                            .foregroundStyle(.red)
                        Button("Abrir Ajustes") {
                            if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
                        }
                    }
                }
                section("Atrasados", overdue)
                section("Hoje", today)
                section("Próximos", upcoming)
                section("Concluídos", done)
            }
            .overlay { if events.isEmpty { ContentUnavailableView("Sem compromissos", systemImage: "calendar.badge.plus", description: Text("Toque em + para criar o primeiro.")) } }
            .navigationTitle("Agenda")
            .searchable(text: $search)
            .toolbar { Button { creating = true } label: { Image(systemName: "plus") } }
            .sheet(isPresented: $creating) { EventEditor(event: nil) }
            .sheet(item: $editing) { EventEditor(event: $0) }
            .task { await refreshAuth() }
            .onChange(of: scenePhase) { _, phase in
                if phase == .active { Task { await refreshAuth() }; NotificationManager.shared.rescheduleAll(events) }
            }
        }
    }

    @ViewBuilder
    private func section(_ title: String, _ items: [Event]) -> some View {
        if !items.isEmpty {
            Section(title) {
                ForEach(items) { event in
                    Button { editing = event } label: { row(event) }
                        .foregroundStyle(.primary)
                        .swipeActions(edge: .leading) {
                            Button { toggle(event) } label: { Label(event.isDone ? "Reabrir" : "Concluir", systemImage: "checkmark") }.tint(.green)
                        }
                        .swipeActions {
                            Button(role: .destructive) { delete(event) } label: { Label("Apagar", systemImage: "trash") }
                        }
                }
            }
        }
    }

    private func row(_ e: Event) -> some View {
        HStack {
            Image(systemName: e.isDone ? "checkmark.circle.fill" : "circle").foregroundStyle(e.isDone ? .green : .secondary)
            VStack(alignment: .leading, spacing: 2) {
                Text(e.title).strikethrough(e.isDone)
                HStack(spacing: 6) {
                    Text(e.date.formatted(date: .abbreviated, time: .shortened))
                    if e.repeatRule != .none { Image(systemName: "repeat") }
                    if e.leadMinutes > 0 { Image(systemName: "bell") }
                }.font(.caption).foregroundStyle(.secondary)
            }
        }
    }

    private func toggle(_ e: Event) {
        e.isDone.toggle()
        NotificationManager.shared.schedule(e)
    }

    private func delete(_ e: Event) {
        NotificationManager.shared.cancel(e)
        context.delete(e)
    }

    private func refreshAuth() async {
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        if settings.authorizationStatus == .notDetermined {
            denied = !(await NotificationManager.shared.requestAuthorization())
        } else {
            denied = settings.authorizationStatus == .denied
        }
    }
}
