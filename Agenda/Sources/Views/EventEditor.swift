import SwiftUI
import SwiftData

struct EventEditor: View {
    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss
    let event: Event?

    @State private var title = ""
    @State private var notes = ""
    @State private var date = Date.now.addingTimeInterval(3600)
    @State private var repeatRule = Repeat.none
    @State private var lead = 10

    private let leads = [0, 5, 10, 15, 30, 60, 120, 1440]

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Título", text: $title)
                    TextField("Notas", text: $notes, axis: .vertical).lineLimit(1...5)
                }
                Section {
                    DatePicker("Data e hora", selection: $date)
                    Picker("Repetir", selection: $repeatRule) {
                        ForEach(Repeat.allCases) { Text($0.label).tag($0) }
                    }
                    Picker("Avisar", selection: $lead) {
                        ForEach(leads, id: \.self) { Text(leadLabel($0)).tag($0) }
                    }
                } footer: {
                    Text("A notificação chega no iPhone e é espelhada no Apple Watch, com botões Concluir e Adiar.")
                }
                if let event {
                    Section {
                        Button("Apagar compromisso", role: .destructive) {
                            NotificationManager.shared.cancel(event)
                            context.delete(event)
                            dismiss()
                        }
                    }
                }
            }
            .navigationTitle(event == nil ? "Novo" : "Editar")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancelar") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Salvar", action: save).disabled(title.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
            .onAppear(perform: load)
        }
    }

    private func leadLabel(_ m: Int) -> String {
        switch m {
        case 0: "Na hora"
        case 60...: m >= 1440 ? "1 dia antes" : "\(m / 60) h antes"
        default: "\(m) min antes"
        }
    }

    private func load() {
        guard let event else { return }
        title = event.title; notes = event.notes; date = event.date
        repeatRule = event.repeatRule; lead = event.leadMinutes
    }

    private func save() {
        let target = event ?? Event()
        target.title = title.trimmingCharacters(in: .whitespaces)
        target.notes = notes; target.date = date
        target.repeatRule = repeatRule; target.leadMinutes = lead
        if event == nil { context.insert(target) }
        try? context.save()
        NotificationManager.shared.schedule(target)
        dismiss()
    }
}
