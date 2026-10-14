export type TaskStatus = 'pending' | 'in_progress' | 'completed'

export type Task = {
  id: string
  subject: string
  status: TaskStatus
  owner?: string
}

export type AgentRow = {
  id: string
  name?: string
  description: string
  type: string
  status: string
  /** A última ação observada do agente (ferramenta + alvo). */
  doing?: string
  doingAt?: number
}

export type NoteChange = {
  /** Caminho relativo à raiz do vault. */
  path: string
  name: string
  folder: string
  mtimeMs: number
  size: number
}

export type VaultSummary = {
  path: string
  notes: NoteChange[]
  total: number
  scannedAt: number
  truncated?: boolean
  error?: string
}

declare module 'claude-code' {
  interface PluginState {
    painel: {
      tasks: Task[]
      agents: AgentRow[]
      vault: VaultSummary
      updatedAt: number
    }
  }
}
