export type Snap = {
  branch: string
  pending: number
  unpushed: number
  lastCommit: string
  at: number
}

declare module 'claude-code' {
  interface PluginState {
    'lighthouse-faixa': { snap: Snap | null; isHidden: boolean }
  }
}
