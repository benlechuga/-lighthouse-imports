import SwiftUI

@main
struct AgendaWatchApp: App {
    @StateObject private var store = WatchStore.shared

    init() { WatchStore.shared.start() }

    var body: some Scene {
        WindowGroup {
            WatchListView().environmentObject(store)
        }
    }
}
