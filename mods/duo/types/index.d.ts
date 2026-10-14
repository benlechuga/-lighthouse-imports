export type DuoRole = 'planner' | 'builder'

export type DuoKind = 'plan' | 'result' | 'note'

export type DuoMessage = {
  id: string
  at: number
  direction: 'in' | 'out'
  kind: DuoKind
  from: DuoRole | 'unknown'
  text: string
  isDelivered?: boolean
  reason?: string
}

export type DuoPeer = {
  role: DuoRole
  sessionId: string
  cwd: string
  at: number
}

declare module 'claude-code' {
  interface PluginState {
    duo: {
      role: DuoRole | null
      messages: DuoMessage[]
      peer: DuoPeer | null
      isAuto: boolean
    }
  }
}
