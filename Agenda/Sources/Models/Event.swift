import Foundation
import SwiftData

enum Repeat: String, CaseIterable, Identifiable, Codable {
    case none, daily, weekly, monthly, yearly
    var id: String { rawValue }
    var label: String {
        switch self {
        case .none: "Nunca"
        case .daily: "Todo dia"
        case .weekly: "Toda semana"
        case .monthly: "Todo mês"
        case .yearly: "Todo ano"
        }
    }
}

@Model
final class Event {
    @Attribute(.unique) var id: UUID
    var title: String
    var notes: String
    var date: Date
    var repeatRaw: String
    /// Minutos de antecedência do lembrete (0 = na hora).
    var leadMinutes: Int
    var isDone: Bool

    var repeatRule: Repeat {
        get { Repeat(rawValue: repeatRaw) ?? .none }
        set { repeatRaw = newValue.rawValue }
    }

    init(title: String = "", notes: String = "", date: Date = .now.addingTimeInterval(3600),
         repeatRule: Repeat = .none, leadMinutes: Int = 10) {
        self.id = UUID()
        self.title = title
        self.notes = notes
        self.date = date
        self.repeatRaw = repeatRule.rawValue
        self.leadMinutes = leadMinutes
        self.isDone = false
    }
}
