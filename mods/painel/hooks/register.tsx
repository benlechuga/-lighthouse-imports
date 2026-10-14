import { atom, read, update } from 'claude-code'
import type { EngineInterface as Engine, Register } from 'claude-code'

import type { AgentRow, NoteChange, Task, VaultSummary } from '../types'

const PANE = 'painel'
const TITLE = 'Painel'
const PERIOD_MS = 60_000
const STORE_VAULT = 'vaultPath'

const MAX_NOTES = 40
const MAX_ENTRIES = 5000
const MAX_DEPTH = 8
const SKIP_DIRS = new Set(['.obsidian', '.git', '.trash', 'node_modules'])

const tasks = atom({ plugin: 'painel', key: 'tasks' } as const, [] as Task[])
const agents = atom({ plugin: 'painel', key: 'agents' } as const, [] as AgentRow[])
const vault = atom({ plugin: 'painel', key: 'vault' } as const, {
  path: '',
  notes: [],
  total: 0,
  scannedAt: 0,
} as VaultSummary)
const updatedAt = atom({ plugin: 'painel', key: 'updatedAt' } as const, 0)

// ---------- helpers ----------

const pad = (n: number) => String(n).padStart(2, '0')
const hhmm = (ms: number) => {
  const d = new Date(ms)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}
const startOfToday = (ms: number) => {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}
const cut = (s: string, n: number) => (s.length > n ? s.slice(0, Math.max(0, n - 1)) + '…' : s)

/** Uma linha curta descrevendo uma chamada de ferramenta. */
function describeCall(e: Record<string, unknown>): string {
  const tool = String(e.tool)
  const str = (k: string) => (typeof e[k] === 'string' ? (e[k] as string) : undefined)
  const target =
    str('command') ?? str('file_path') ?? str('pattern') ?? str('description') ?? str('prompt') ?? str('query') ?? str('url')
  const shortTool = tool.startsWith('mcp__') ? tool.split('__').slice(1).join(':') : tool
  return target ? `${shortTool} ${cut(target.replace(/\s+/g, ' '), 60)}` : shortTool
}

// ---------- refreshers ----------

async function refreshTasksFromTool($: Engine) {
  try {
    const r = await $.tool.call({ tool: 'TaskList' })
    if (r.deny !== undefined || r.isError || !r.result) return
    const list = (r.result as { tasks?: Task[] }).tasks
    if (Array.isArray(list)) await update($, tasks, () => list.map(normalizeTask))
  } catch {
    // TaskList indisponível: as tarefas seguem vindo dos hooks de TaskCreate/TaskUpdate.
  }
}

function normalizeTask(t: { id: string; subject: string; status: string; owner?: string }): Task {
  const status: Task['status'] =
    t.status === 'in_progress' || t.status === 'completed' ? t.status : 'pending'
  return { id: t.id, subject: t.subject, status, owner: t.owner }
}

async function refreshAgents($: Engine) {
  try {
    const list = await $.agent.list()
    await update($, agents, (prev: AgentRow[]) => {
      const doing = new Map(prev.map(a => [a.id, a]))
      return list.map(a => {
        const old = doing.get(a.id)
        return {
          id: a.id,
          name: a.name,
          description: a.description,
          type: a.type,
          status: a.status,
          doing: old?.doing,
          doingAt: old?.doingAt,
        }
      })
    })
  } catch {
    // mantém a lista anterior
  }
}

async function resolveVaultPath($: Engine, fallback: string): Promise<string> {
  try {
    const stored = await $.store.get(STORE_VAULT)
    if (typeof stored === 'string' && stored.trim()) return stored.trim()
  } catch {
    // sem store: usa a configuração
  }
  return fallback.trim()
}

async function scanVault($: Engine, root: string, since: number): Promise<Omit<VaultSummary, 'scannedAt'>> {
  const notes: NoteChange[] = []
  let visited = 0
  let truncated = false
  const queue: Array<{ dir: string; rel: string; depth: number }> = [{ dir: root, rel: '', depth: 0 }]

  while (queue.length > 0) {
    const { dir, rel, depth } = queue.shift()!
    let entries
    try {
      entries = await $.fs.list(dir)
    } catch {
      continue
    }
    for (const entry of entries) {
      if (++visited > MAX_ENTRIES) {
        truncated = true
        break
      }
      if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue
      const relPath = rel ? `${rel}/${entry.name}` : entry.name
      if (entry.kind === 'dir') {
        if (depth + 1 <= MAX_DEPTH) queue.push({ dir: `${dir}/${entry.name}`, rel: relPath, depth: depth + 1 })
        continue
      }
      if (entry.kind !== 'file' || !entry.name.toLowerCase().endsWith('.md')) continue
      if (entry.mtimeMs < since) continue
      notes.push({
        path: relPath,
        name: entry.name.replace(/\.md$/i, ''),
        folder: rel || '/',
        mtimeMs: entry.mtimeMs,
        size: entry.size,
      })
    }
    if (truncated) break
  }

  notes.sort((a, b) => b.mtimeMs - a.mtimeMs)
  return { path: root, notes: notes.slice(0, MAX_NOTES), total: notes.length, truncated }
}

async function refreshVault($: Engine, configuredPath: string) {
  const now = await $.clock.now()
  const root = await resolveVaultPath($, configuredPath)
  if (!root) {
    await update($, vault, () => ({ path: '', notes: [], total: 0, scannedAt: now }))
    return
  }
  try {
    const exists = await $.fs.exists(root)
    if (!exists) {
      await update($, vault, () => ({ path: root, notes: [], total: 0, scannedAt: now, error: 'pasta não encontrada' }))
      return
    }
    const summary = await scanVault($, root, startOfToday(now))
    await update($, vault, () => ({ ...summary, scannedAt: now }))
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await update($, vault, () => ({ path: root, notes: [], total: 0, scannedAt: now, error: cut(message, 60) }))
  }
}

async function refreshAll($: Engine, configuredPath: string) {
  await Promise.all([refreshAgents($), refreshVault($, configuredPath)])
  const now = await $.clock.now()
  await update($, updatedAt, () => now)
}

// ---------- the mod ----------

export const register: Register = (on, options) => {
  const configuredPath = typeof options.vaultPath === 'string' ? options.vaultPath : ''

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'painel',
      description: 'Abre o painel (tarefas, subagentes, vault). "/painel vault <caminho>" define a pasta do vault.',
    })
    void $.ui.open({ id: PANE, title: TITLE })

    // Primeira carga agora, depois a cada minuto.
    void refreshTasksFromTool($).then(() => refreshAll($, configuredPath))
    $.clock.every(PERIOD_MS, () => {
      void refreshAll($, configuredPath)
    })

    return next(e)
  })

  on('command.run', { command: 'painel' }, async ($, e) => {
    const [verb, ...rest] = e.args.trim().split(/\s+/)
    if (verb === 'vault') {
      const path = rest.join(' ').trim()
      if (!path) {
        const current = await resolveVaultPath($, configuredPath)
        return { text: current ? `Vault atual: ${current}` : 'Nenhum vault definido. Use: /painel vault <caminho>' }
      }
      await $.store.set(STORE_VAULT, path)
      await refreshVault($, configuredPath)
      await $.ui.open({ id: PANE, title: TITLE })
      return { text: `Vault definido: ${path}` }
    }
    if (verb === 'atualizar' || verb === 'refresh') {
      await refreshTasksFromTool($)
      await refreshAll($, configuredPath)
      return { text: 'Painel atualizado.' }
    }
    const opened = await $.ui.open({ id: PANE, title: TITLE })
    return { text: opened.isPlaced ? 'Painel aberto.' : `Painel aguardando espaço: ${opened.reason}` }
  })

  // Tarefas: acompanha as ferramentas Task* na hora, sem esperar o minuto.
  on('tool.call', { tool: 'TaskCreate' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny === undefined && !ran.isError && ran.result) {
      const created = (ran.result as { task?: { id: string; subject: string } }).task
      if (created) {
        const fresh: Task = { id: created.id, subject: created.subject, status: 'pending' }
        await update($, tasks, list => [...list.filter(t => t.id !== created.id), fresh])
      }
    }
    return ran
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'TaskUpdate' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny === undefined && !ran.isError && e.tool === 'TaskUpdate') {
      const { taskId, status, subject, owner } = e as typeof e & { owner?: string }
      await update($, tasks, list => {
        if (status === 'deleted') return list.filter(t => t.id !== taskId)
        const known = list.some(t => t.id === taskId)
        const base = known ? list : [...list, { id: taskId, subject: subject ?? taskId, status: 'pending' as const }]
        return base.map(t =>
          t.id === taskId
            ? {
                ...t,
                subject: subject ?? t.subject,
                owner: owner ?? t.owner,
                status: status === 'in_progress' || status === 'completed' || status === 'pending' ? status : t.status,
              }
            : t,
        )
      })
    }
    return ran
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'TaskList' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny === undefined && !ran.isError && ran.result) {
      const list = (ran.result as { tasks?: Task[] }).tasks
      if (Array.isArray(list)) await update($, tasks, () => list.map(normalizeTask))
    }
    return ran
  }).catch(($, e, next) => next(e))

  // Subagentes: registra o que cada um está fazendo a partir das ferramentas que chama.
  on('tool.call', async ($, e, next) => {
    if (e.agentId !== undefined) {
      const agentId = e.agentId
      const doing = describeCall(e as unknown as Record<string, unknown>)
      const now = await $.clock.now()
      let isNew = false
      await update($, agents, list => {
        isNew = !list.some(a => a.id === agentId)
        const rows = isNew
          ? [...list, { id: agentId, description: '', type: '…', status: 'running' }]
          : list
        return rows.map(a => (a.id === agentId ? { ...a, doing, doingAt: now } : a))
      })
      if (isNew) void refreshAgents($)
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    if (e.agentId !== undefined) void refreshAgents($)
    return next(e)
  })

  // ---------- drawing ----------

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const [taskList, agentList, vaultInfo, stamp] = await Promise.all([
      read($, tasks),
      read($, agents),
      read($, vault),
      read($, updatedAt),
    ])

    const cols = Math.max(20, e.props.bodyColumns ?? e.viewport?.columns ?? 40)
    const rows = e.viewport?.rows ?? 30
    const room = Math.max(6, rows - 9)
    const tasksMax = Math.max(2, Math.floor(room * 0.3))
    const agentsMax = Math.max(2, Math.floor(room * 0.3))
    const notesMax = Math.max(2, room - tasksMax - agentsMax)

    const openTasks = taskList.filter(t => t.status !== 'completed')
    const doneCount = taskList.length - openTasks.length
    const orderedTasks = [
      ...openTasks.filter(t => t.status === 'in_progress'),
      ...openTasks.filter(t => t.status === 'pending'),
    ]

    const live = agentList.filter(a => a.status !== 'completed' && a.status !== 'failed' && a.status !== 'killed')
    const ended = agentList.filter(a => !live.includes(a))
    const orderedAgents = [...live, ...ended]

    const taskGlyph = (s: Task['status']) => (s === 'in_progress' ? '▶' : s === 'completed' ? '✓' : '○')
    const agentGlyph = (s: string) =>
      s === 'running' ? '●' : s === 'completed' ? '✓' : s === 'failed' || s === 'killed' ? '✗' : '◌'

    const header = (label: string, extra: string) => (
      <Box flexDirection="row" justifyContent="space-between">
        <Text bold>{label}</Text>
        <Text dimColor>{extra}</Text>
      </Box>
    )

    const folders = new Map<string, number>()
    for (const n of vaultInfo.notes) folders.set(n.folder, (folders.get(n.folder) ?? 0) + 1)
    const folderLine = [...folders.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([f, c]) => `${f === '/' ? 'raiz' : f} ${c}`)
      .join(' · ')

    return (
      <Box flexDirection="column" width={cols}>
        {header('Tarefas', `${openTasks.length} abertas · ${doneCount} feitas`)}
        {orderedTasks.length === 0 && <Text dimColor>nenhuma tarefa em andamento</Text>}
        {orderedTasks.slice(0, tasksMax).map(t => (
          <Text key={`t-${t.id}`} wrap="truncate-end" dimColor={t.status === 'pending'}>
            {taskGlyph(t.status)} {t.subject}
            {t.owner ? ` (${t.owner})` : ''}
          </Text>
        ))}
        {orderedTasks.length > tasksMax && <Text dimColor>+{orderedTasks.length - tasksMax} mais</Text>}

        <Text> </Text>
        {header('Subagentes', `${live.length} ativos`)}
        {orderedAgents.length === 0 && <Text dimColor>nenhum subagente rodando</Text>}
        {orderedAgents.slice(0, agentsMax).map(a => (
          <Box key={`a-${a.id}`} flexDirection="column">
            <Text wrap="truncate-end" dimColor={!live.includes(a)}>
              {agentGlyph(a.status)} {a.name ?? a.type}
              {a.description ? `: ${a.description}` : ''}
            </Text>
            {a.doing && live.includes(a) && (
              <Text wrap="truncate-end" dimColor>
                {'   '}↳ {a.doing}
              </Text>
            )}
          </Box>
        ))}

        <Text> </Text>
        {header('Vault hoje', vaultInfo.total ? `${vaultInfo.total} nota${vaultInfo.total === 1 ? '' : 's'} alterada${vaultInfo.total === 1 ? '' : 's'}` : '')}
        {!vaultInfo.path && <Text dimColor>defina a pasta: /painel vault {'<caminho>'}</Text>}
        {vaultInfo.path && vaultInfo.error && (
          <Text color="yellow" wrap="truncate-end">
            {vaultInfo.error}: {vaultInfo.path}
          </Text>
        )}
        {vaultInfo.path && !vaultInfo.error && vaultInfo.total === 0 && <Text dimColor>nada mudou hoje</Text>}
        {folderLine && (
          <Text dimColor wrap="truncate-end">
            {folderLine}
          </Text>
        )}
        {vaultInfo.notes.slice(0, notesMax).map(n => (
          <Text key={`n-${n.path}`} wrap="truncate-end">
            <Text dimColor>{hhmm(n.mtimeMs)}</Text> {n.name}
            {n.folder !== '/' ? <Text dimColor> · {n.folder}</Text> : null}
          </Text>
        ))}
        {vaultInfo.notes.length > notesMax && <Text dimColor>+{vaultInfo.notes.length - notesMax} mais</Text>}

        <Text> </Text>
        <Text dimColor wrap="truncate-end">
          atualizado {stamp ? hhmm(stamp) : '—'} · a cada 1 min · /painel
        </Text>
      </Box>
    )
  })
}
