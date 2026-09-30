import Foundation

/// Representação leve de um compromisso, enviada do iPhone para o Watch.
struct EventDTO: Codable, Identifiable, Hashable {
    var id: String
    var title: String
    var notes: String
    /// Próxima ocorrência (para eventos repetidos) ou a data original.
    var date: Date
    var isDone: Bool
    var repeats: Bool
}

/// Cache local no Watch, compartilhado entre o app e a complicação via App Group.
enum SharedStore {
    static let group = "group.com.example.agenda"
    private static let key = "events"
    private static var defaults: UserDefaults { UserDefaults(suiteName: group) ?? .standard }

    static func save(_ events: [EventDTO]) {
        if let data = try? JSONEncoder().encode(events) { defaults.set(data, forKey: key) }
    }

    static func load() -> [EventDTO] {
        guard let data = defaults.data(forKey: key) else { return [] }
        return (try? JSONDecoder().decode([EventDTO].self, from: data)) ?? []
    }
}
