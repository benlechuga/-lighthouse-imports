export type SiteChange = { kind: string; path: string }

export type SiteInfo = {
  branch: string
  changes: SiteChange[]
  lastCommit: string
  ahead: number | null
  behind: number | null
  updatedAt: number
}

declare module 'claude-code' {
  interface PluginState {
    'lighthouse-painel': { info: SiteInfo | null }
  }
}
