import Foundation
import WatchConnectivity
import WidgetKit

final class WatchStore: NSObject, ObservableObject, WCSessionDelegate {
    static let shared = WatchStore()
    @Published var events: [EventDTO] = SharedStore.load()

    func start() {
        guard WCSession.isSupported() else { return }
        WCSession.default.delegate = self
        WCSession.default.activate()
    }

    /// Marca como concluído (otimista) e avisa o iPhone; a fila garante a entrega mesmo offline.
    func complete(_ event: EventDTO) {
        events.removeAll { $0.id == event.id }
        SharedStore.save(events)
        WidgetCenter.shared.reloadAllTimelines()
        WCSession.default.transferUserInfo(["done": event.id])
    }

    private func apply(_ context: [String: Any]) {
        guard let data = context["events"] as? Data,
              let list = try? JSONDecoder().decode([EventDTO].self, from: data) else { return }
        DispatchQueue.main.async {
            self.events = list
            SharedStore.save(list)
            WidgetCenter.shared.reloadAllTimelines()
        }
    }

    func session(_ session: WCSession, activationDidCompleteWith state: WCSessionActivationState, error: Error?) {
        apply(session.receivedApplicationContext)
    }

    func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
        apply(applicationContext)
    }
}
