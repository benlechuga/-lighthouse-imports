import Foundation
import SwiftData
import UserNotifications

/// Agenda notificações locais. O iOS as espelha automaticamente no Apple Watch
/// (quando o iPhone está bloqueado), incluindo os botões de ação abaixo.
final class NotificationManager: NSObject, UNUserNotificationCenterDelegate {
    static let shared = NotificationManager()
    var container: ModelContainer?

    private let center = UNUserNotificationCenter.current()
    private let category = "EVENT"
    private let doneAction = "DONE"
    private let snoozeAction = "SNOOZE"

    func setup() {
        center.delegate = self
        let done = UNNotificationAction(identifier: doneAction, title: "Concluir", options: [])
        let snooze = UNNotificationAction(identifier: snoozeAction, title: "Adiar 10 min", options: [])
        center.setNotificationCategories([
            UNNotificationCategory(identifier: category, actions: [done, snooze],
                                   intentIdentifiers: [], options: [])
        ])
    }

    func requestAuthorization() async -> Bool {
        (try? await center.requestAuthorization(options: [.alert, .sound, .badge])) ?? false
    }

    func schedule(_ event: Event) {
        cancel(event)
        guard !event.isDone else { return }
        let fire = event.date.addingTimeInterval(-Double(event.leadMinutes) * 60)
        let cal = Calendar.current
        let comps: DateComponents
        var repeats = true
        switch event.repeatRule {
        case .none:
            guard fire > .now else { return }
            comps = cal.dateComponents([.year, .month, .day, .hour, .minute], from: fire)
            repeats = false
        case .daily: comps = cal.dateComponents([.hour, .minute], from: fire)
        case .weekly: comps = cal.dateComponents([.weekday, .hour, .minute], from: fire)
        case .monthly: comps = cal.dateComponents([.day, .hour, .minute], from: fire)
        case .yearly: comps = cal.dateComponents([.month, .day, .hour, .minute], from: fire)
        }

        let content = UNMutableNotificationContent()
        content.title = event.title.isEmpty ? "Compromisso" : event.title
        content.body = body(for: event)
        content.sound = .default
        content.categoryIdentifier = category
        content.userInfo = ["id": event.id.uuidString]
        let trigger = UNCalendarNotificationTrigger(dateMatching: comps, repeats: repeats)
        center.add(UNNotificationRequest(identifier: event.id.uuidString, content: content, trigger: trigger))
    }

    func cancel(_ event: Event) {
        center.removePendingNotificationRequests(withIdentifiers: [event.id.uuidString, "snooze-\(event.id)"])
    }

    func rescheduleAll(_ events: [Event]) { events.forEach(schedule) }

    private func body(for event: Event) -> String {
        let time = event.date.formatted(date: .omitted, time: .shortened)
        let when = event.leadMinutes > 0 ? "Começa às \(time) (em \(event.leadMinutes) min)" : "Agora · \(time)"
        return event.notes.isEmpty ? when : "\(when)\n\(event.notes)"
    }

    // MARK: UNUserNotificationCenterDelegate

    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async
        -> UNNotificationPresentationOptions { [.banner, .list, .sound] }

    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        let content = response.notification.request.content
        guard let idString = content.userInfo["id"] as? String, let id = UUID(uuidString: idString) else { return }

        switch response.actionIdentifier {
        case doneAction:
            await MainActor.run {
                guard let context = container?.mainContext,
                      let event = try? context.fetch(FetchDescriptor<Event>(predicate: #Predicate { $0.id == id })).first
                else { return }
                if event.repeatRule == .none { event.isDone = true; cancel(event); try? context.save(); WatchSync.shared.syncFromContainer() }
            }
        case snoozeAction:
            let snooze = UNMutableNotificationContent()
            snooze.title = content.title
            snooze.body = content.body
            snooze.sound = .default
            snooze.categoryIdentifier = category
            snooze.userInfo = content.userInfo
            let trigger = UNTimeIntervalNotificationTrigger(timeInterval: 600, repeats: false)
            try? await center.add(UNNotificationRequest(identifier: "snooze-\(idString)", content: snooze, trigger: trigger))
        default: break
        }
    }
}
