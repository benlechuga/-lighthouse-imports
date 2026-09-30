import Foundation
import SwiftData
import WatchConnectivity

/// Envia os compromissos ao Apple Watch e recebe "Concluir" vindo do relógio.
final class WatchSync: NSObject, WCSessionDelegate {
    static let shared = WatchSync()
    private var session: WCSession? { WCSession.isSupported() ? WCSession.default : nil }

    func start() {
        session?.delegate = self
        session?.activate()
    }

    func sync(_ events: [Event]) {
        guard let s = session, s.activationState == .activated, s.isPaired, s.isWatchAppInstalled else { return }
        let dtos = events
            .filter { !$0.isDone }
            .map { EventDTO(id: $0.id.uuidString, title: $0.title, notes: $0.notes, date: $0.nextDate,
                            isDone: false, repeats: $0.repeatRule != .none) }
            .sorted { $0.date < $1.date }
            .prefix(60)
        guard let data = try? JSONEncoder().encode(Array(dtos)) else { return }
        try? s.updateApplicationContext(["events": data])
    }

    @MainActor
    func syncFromContainer() {
        guard let context = NotificationManager.shared.container?.mainContext,
              let events = try? context.fetch(FetchDescriptor<Event>()) else { return }
        sync(events)
    }

    // MARK: WCSessionDelegate

    func session(_ session: WCSession, activationDidCompleteWith state: WCSessionActivationState, error: Error?) {
        Task { @MainActor in syncFromContainer() }
    }

    func sessionDidBecomeInactive(_ session: WCSession) {}
    func sessionDidDeactivate(_ session: WCSession) { session.activate() }
    func sessionWatchStateDidChange(_ session: WCSession) { Task { @MainActor in syncFromContainer() } }

    func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
        guard let idString = userInfo["done"] as? String, let id = UUID(uuidString: idString) else { return }
        Task { @MainActor in
            guard let context = NotificationManager.shared.container?.mainContext,
                  let event = try? context.fetch(FetchDescriptor<Event>(predicate: #Predicate { $0.id == id })).first
            else { return }
            event.isDone = true
            NotificationManager.shared.cancel(event)
            try? context.save()
            syncFromContainer()
        }
    }
}

extension Event {
    /// Próxima ocorrência a partir de agora (ou a data original se não repete / ainda é futura).
    var nextDate: Date {
        guard repeatRule != .none, date < .now else { return date }
        let cal = Calendar.current
        let comps: DateComponents
        switch repeatRule {
        case .none: return date
        case .daily: comps = cal.dateComponents([.hour, .minute], from: date)
        case .weekly: comps = cal.dateComponents([.weekday, .hour, .minute], from: date)
        case .monthly: comps = cal.dateComponents([.day, .hour, .minute], from: date)
        case .yearly: comps = cal.dateComponents([.month, .day, .hour, .minute], from: date)
        }
        return cal.nextDate(after: .now.addingTimeInterval(-1), matching: comps, matchingPolicy: .nextTime) ?? date
    }

    /// Muda quando qualquer campo relevante para o Watch muda.
    var signature: String { "\(id)|\(title)|\(notes)|\(date.timeIntervalSince1970)|\(repeatRaw)|\(isDone)" }
}
