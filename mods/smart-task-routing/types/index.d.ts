export type RouteKind = 'cheap' | 'main'

export type LastRoute = {
  /** Which way the last answered prompt went. */
  kind: RouteKind
  /** Short name of the model that actually answered, as the API reported it. */
  model: string
  /** Why the router decided so, in the person's words. */
  reason: string
  /** True when a cheap turn ran past its step budget and finished on the main model. */
  isEscalated: boolean
}

export type RouteStats = { cheap: number; main: number }

declare module 'claude-code' {
  interface PluginState {
    'smart-task-routing': {
      enabled: boolean
      last: LastRoute | null
      stats: RouteStats
    }
  }
}
