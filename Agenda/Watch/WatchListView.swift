import SwiftUI

struct WatchListView: View {
    @EnvironmentObject var store: WatchStore

    private var pending: [EventDTO] {
        store.events.filter { !$0.isDone }.sorted { $0.date < $1.date }
    }

    var body: some View {
        NavigationStack {
            Group {
                if pending.isEmpty {
                    ContentUnavailableView("Tudo em dia", systemImage: "checkmark.circle",
                                           description: Text("Crie compromissos no iPhone."))
                } else {
                    List(pending) { event in
                        NavigationLink(value: event) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(event.title).font(.headline).lineLimit(2)
                                HStack(spacing: 4) {
                                    Text(event.date, format: .dateTime.day().month(.abbreviated).hour().minute())
                                    if event.repeats { Image(systemName: "repeat") }
                                }
                                .font(.caption2)
                                .foregroundStyle(event.date < .now ? .red : .secondary)
                            }
                        }
                        .swipeActions(edge: .leading) {
                            if !event.repeats {
                                Button { store.complete(event) } label: { Image(systemName: "checkmark") }.tint(.green)
                            }
                        }
                    }
                }
            }
            .navigationTitle("Agenda")
            .navigationDestination(for: EventDTO.self) { EventDetailView(event: $0) }
        }
    }
}

struct EventDetailView: View {
    @EnvironmentObject var store: WatchStore
    @Environment(\.dismiss) private var dismiss
    let event: EventDTO

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 8) {
                Text(event.title).font(.headline)
                Text(event.date, format: .dateTime.weekday(.wide).day().month().hour().minute())
                    .font(.footnote).foregroundStyle(.secondary)
                if !event.notes.isEmpty { Text(event.notes).font(.footnote) }
                if !event.repeats {
                    Button {
                        store.complete(event)
                        dismiss()
                    } label: { Label("Concluir", systemImage: "checkmark") }
                        .tint(.green)
                }
            }
        }
    }
}
