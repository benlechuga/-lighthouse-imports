import type { EngineInterface } from 'claude-code'

import type { Snap } from '../types'

export function countPending(porcelain: string): number {
  return porcelain.split('\n').filter(line => line.trim() !== '').length
}

export function countUnpushed(leftRight: string): number {
  const ahead = Number(leftRight.trim().split(/\s+/)[0])
  return Number.isFinite(ahead) ? ahead : 0
}

/** O texto da faixa, pronto para o terminal. */
export function describe(snap: Snap): { text: string; isClean: boolean } {
  const parts = [`⚓ ${snap.branch}`]
  const isClean = snap.pending === 0 && snap.unpushed === 0
  if (snap.pending > 0) parts.push(`${snap.pending} mudança${snap.pending === 1 ? '' : 's'}`)
  if (snap.unpushed > 0) parts.push(`${snap.unpushed} commit${snap.unpushed === 1 ? '' : 's'} sem push`)
  parts.push(isClean ? 'publicado ✅' : 'não publicado ⏳')
  if (snap.lastCommit) parts.push(`último: ${snap.lastCommit}`)

  return { text: parts.join(' · '), isClean }
}

async function git($: EngineInterface, args: string[]): Promise<string> {
  try {
    const ran = await $.process.run(['git', ...args], { timeoutMs: 10_000 })
    return ran.exitCode === 0 ? ran.stdout.trim() : ''
  } catch {
    return ''
  }
}

export async function take($: EngineInterface): Promise<Snap> {
  const [branch, status, counts, last, at] = await Promise.all([
    git($, ['rev-parse', '--abbrev-ref', 'HEAD']),
    git($, ['status', '--porcelain']),
    git($, ['rev-list', '--left-right', '--count', 'HEAD...@{upstream}']),
    git($, ['log', '-1', '--format=%cr']),
    $.clock.now(),
  ])

  return {
    branch: branch || '(sem branch)',
    pending: countPending(status),
    unpushed: countUnpushed(counts),
    lastCommit: last,
    at,
  }
}
