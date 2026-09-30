import SwiftUI
import SwiftData

@main
struct AgendaApp: App {
    let container: ModelContainer = {
        do { return try ModelContainer(for: Event.self) }
        catch { fatalError("Falha ao criar o banco: \(error)") }
    }()

    init() {
        NotificationManager.shared.container = container
        NotificationManager.shared.setup()
        WatchSync.shared.start()
    }

    var body: some Scene {
        WindowGroup { ContentView() }
            .modelContainer(container)
    }
}
