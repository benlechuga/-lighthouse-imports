import type { EngineInterface } from 'claude-code'

import type { SiteChange, SiteInfo } from '../types'

const KINDS: Record<string, string> = {
  '??': 'novo',
  A: 'novo',
  M: 'alterado',
  D: 'apagado',
  R: 'renomeado',
  C: 'copiado',
  U: 'conflito',
}

/** Lê a saída de `git status --porcelain` e devolve uma linha por arquivo. */
export function parseStatus(porcelain: string): SiteChange[] {
  return porcelain
    .split('\n')
    .filter(line => line.trim() !== '')
    .map(line => {
      const code = line.slice(0, 2)
      const path = line.slice(3).trim()
      const letter = code === '??' ? '??' : (code.trim()[0] ?? 'M')
      return { kind: KINDS[letter] ?? 'alterado', path }
    })
}

/** Lê "ahead\tbehind" de `git rev-list --left-right --count HEAD...@{u}`. */
export function parseAheadBehind(text: string): { ahead: number | null; behind: number | null } {
  const [a, b] = text.trim().split(/\s+/)
  const ahead = Number(a)
  const behind = Number(b)
  if (!Number.isFinite(ahead) || !Number.isFinite(behind)) return { ahead: null, behind: null }
  return { ahead, behind }
}

async function git($: EngineInterface, args: string[]): Promise<string> {
  try {
    const ran = await $.process.run(['git', ...args], { timeoutMs: 10_000 })
    return ran.exitCode === 0 ? ran.stdout.trim() : ''
  } catch {
    return ''
  }
}

export async function probe($: EngineInterface): Promise<SiteInfo> {
  const [branch, status, last, counts, now] = await Promise.all([
    git($, ['rev-parse', '--abbrev-ref', 'HEAD']),
    git($, ['status', '--porcelain']),
    git($, ['log', '-1', '--format=%h %s (%cr)']),
    git($, ['rev-list', '--left-right', '--count', 'HEAD...@{upstream}']),
    $.clock.now(),
  ])
  const { ahead, behind } = parseAheadBehind(counts)

  return {
    branch: branch || '(sem branch)',
    changes: parseStatus(status),
    lastCommit: last || '(nenhum commit)',
    ahead,
    behind,
    updatedAt: now,
  }
}
