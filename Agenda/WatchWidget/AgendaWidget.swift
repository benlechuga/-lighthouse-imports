import SwiftUI
import WidgetKit

struct AgendaEntry: TimelineEntry {
    let date: Date
    let event: EventDTO?
}

struct AgendaProvider: TimelineProvider {
    private let grace: TimeInterval = 15 * 60  // mantém o evento visível 15 min após o início

    func placeholder(in context: Context) -> AgendaEntry {
        AgendaEntry(date: .now, event: EventDTO(id: "x", title: "Reunião", notes: "", date: .now.addingTimeInterval(1800), isDone: false, repeats: false))
    }

    func getSnapshot(in context: Context, completion: @escaping (AgendaEntry) -> Void) {
        completion(entry(at: .now, events: SharedStore.load()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<AgendaEntry>) -> Void) {
        let events = SharedStore.load().filter { !$0.isDone }.sorted { $0.date < $1.date }
        var times: Set<Date> = [.now]
        for e in events.prefix(10) {
            if e.date > .now { times.insert(e.date) }
            if e.date.addingTimeInterval(grace) > .now { times.insert(e.date.addingTimeInterval(grace)) }
        }
        let entries = times.sorted().map { entry(at: $0, events: events) }
        completion(Timeline(entries: entries, policy: .after(.now.addingTimeInterval(3600))))
    }

    private func entry(at time: Date, events: [EventDTO]) -> AgendaEntry {
        let next = events.filter { !$0.isDone && $0.date.addingTimeInterval(grace) >= time }.min { $0.date < $1.date }
        return AgendaEntry(date: time, event: next)
    }
}

struct AgendaWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: AgendaEntry

    var body: some View {
        switch family {
        case .accessoryInline:
            if let e = entry.event {
                Text("\(e.date.formatted(date: .omitted, time: .shortened)) \(e.title)")
            } else { Text("Sem compromissos") }
        case .accessoryCircular, .accessoryCorner:
            ZStack {
                AccessoryWidgetBackground()
                if let e = entry.event {
                    Text(e.date, format: .dateTime.hour().minute()).font(.caption2.bold())
                } else { Image(systemName: "checkmark") }
            }
            .widgetLabel(entry.event?.title ?? "Agenda")
        default:
            VStack(alignment: .leading, spacing: 2) {
                Label("Agenda", systemImage: "calendar").font(.caption2).foregroundStyle(.secondary)
                if let e = entry.event {
                    Text(e.title).font(.headline).lineLimit(1)
                    Text(e.date, format: .dateTime.weekday(.abbreviated).hour().minute()).font(.caption)
                } else {
                    Text("Tudo em dia").font(.headline)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

@main
struct AgendaWidgetBundle: WidgetBundle {
    var body: some Widget { AgendaWidget() }
}

struct AgendaWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "AgendaNext", provider: AgendaProvider()) { entry in
            AgendaWidgetView(entry: entry).containerBackground(.fill.tertiary, for: .widget)
        }
        .configurationDisplayName("Próximo compromisso")
        .description("Mostra o próximo compromisso no mostrador.")
        .supportedFamilies([.accessoryRectangular, .accessoryInline, .accessoryCircular, .accessoryCorner])
    }
}
