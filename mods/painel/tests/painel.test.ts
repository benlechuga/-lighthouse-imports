import { expect, mock, test } from 'claude-code/testing'
import type { AgentInfo, FsEntry } from 'claude-code'

const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE
// Meio-dia UTC: em qualquer fuso, "um minuto atrás" ainda é hoje e "dois dias atrás" não é.
const NOW = Date.UTC(2026, 9, 14, 12, 0, 0)

const file = (name: string, mtimeMs: number): FsEntry => ({ name, kind: 'file', size: 10, mtimeMs, isLink: false })
const dir = (name: string): FsEntry => ({ name, kind: 'dir', size: 0, mtimeMs: 0, isLink: false })

for (const surface of ['terminal', 'desktop'] as const) {
  test(`painel mostra tarefas, subagentes e notas de hoje (${surface})`, { options: { vaultPath: '/vault' } }, async ($, on) => {
    const clock = mock.clock(on, { now: NOW })
    mock.store(on, {})

    let agentsNow: AgentInfo[] = [
      { id: 'ag1', description: 'Explora o repositório', type: 'Explore', status: 'running' },
    ]
    let tree: Record<string, FsEntry[]> = {
      '/vault': [file('Hoje.md', NOW - MINUTE), file('Antiga.md', NOW - 2 * DAY), dir('.obsidian'), dir('projetos')],
      '/vault/projetos': [file('Plano.md', NOW - 2 * MINUTE)],
      '/vault/.obsidian': [file('Oculta.md', NOW - MINUTE)],
    }

    on('session.start', ($, e) => ({ cwd: e.cwd, startedAt: NOW }))
    on('command.register', ($, e) => ({ value: { command: e.name } }))
    on('ui.open', () => ({ value: { isPlaced: true as const } }))
    on('agent.list', () => ({ value: agentsNow }))
    on('fs.exists', () => ({ value: true }))
    on('fs.list', ($, e) => ({ value: tree[e.path] ?? [] }))
    on('tool.call', { tool: 'TaskList' }, () => ({
      result: {
        tasks: [
          { id: '1', subject: 'Escrever o mod', status: 'in_progress' as const, blockedBy: [] },
          { id: '2', subject: 'Testar o mod', status: 'pending' as const, blockedBy: [] },
          { id: '3', subject: 'Ler a API', status: 'completed' as const, blockedBy: [] },
        ],
      },
    }))

    await $.session.start({ cwd: '/work', surface, isInteractive: true })
    await clock.settle()

    const pane = await $.ui.mount({
      plugin: 'painel',
      surface,
      component: 'Pane',
      requestId: 'painel',
      props: { title: 'Painel', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
    })

    // Tarefas: as abertas aparecem, a concluída conta no cabeçalho.
    expect(await pane.find({ text: /Escrever o mod/ })).toBeDefined()
    expect(await pane.find({ text: /Testar o mod/ })).toBeDefined()
    expect(await pane.find({ text: /2 abertas · 1 feitas/ })).toBeDefined()

    // Subagentes: o que está rodando e sua descrição.
    expect(await pane.find({ text: /Explora o repositório/ })).toBeDefined()
    expect(await pane.find({ text: /1 ativos/ })).toBeDefined()

    // Vault: só as notas de hoje, fora de pastas ocultas, com subpastas.
    expect(await pane.find({ text: /Hoje/ })).toBeDefined()
    expect(await pane.find({ text: /Plano/ })).toBeDefined()
    expect(await pane.find({ text: /Antiga/ })).toBeUndefined()
    expect(await pane.find({ text: /Oculta/ })).toBeUndefined()
    expect(await pane.find({ text: /2 notas alteradas/ })).toBeDefined()

    // Um minuto depois o painel se atualiza sozinho.
    agentsNow = [{ ...agentsNow[0]!, status: 'completed' }]
    tree = { ...tree, '/vault': [...tree['/vault']!, file('Nova.md', NOW + MINUTE - 1000)] }
    await clock.advance(MINUTE)

    expect(await pane.find({ text: /0 ativos/ })).toBeDefined()
    expect(await pane.find({ text: /Nova/ })).toBeDefined()
    expect(await pane.find({ text: /3 notas alteradas/ })).toBeDefined()
  })

  test(`tarefas criadas e atualizadas aparecem na hora (${surface})`, async ($, on) => {
    const clock = mock.clock(on, { now: NOW })
    mock.store(on, {})
    on('session.start', ($, e) => ({ cwd: e.cwd, startedAt: NOW }))
    on('command.register', ($, e) => ({ value: { command: e.name } }))
    on('ui.open', () => ({ value: { isPlaced: true as const } }))
    on('agent.list', () => ({ value: [] }))
    on('tool.call', { tool: 'TaskList' }, () => ({ result: { tasks: [] } }))
    on('tool.call', { tool: 'TaskCreate' }, () => ({ result: { task: { id: 'n1', subject: 'Revisar o painel' } } }))
    on('tool.call', { tool: 'TaskUpdate' }, () => ({
      result: { success: true, taskId: 'n1', updatedFields: ['status'] },
    }))

    await $.session.start({ cwd: '/work', surface, isInteractive: true })
    await clock.settle()
    await $.tool.call({ tool: 'TaskCreate', subject: 'Revisar o painel', description: 'olhar o painel' })

    const pane = await $.ui.mount({
      plugin: 'painel',
      surface,
      component: 'Pane',
      requestId: 'painel',
      props: { title: 'Painel', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
    })
    expect(await pane.find({ text: /○ Revisar o painel/ })).toBeDefined()

    await $.tool.call({ tool: 'TaskUpdate', taskId: 'n1', status: 'in_progress' })
    expect(await pane.find({ text: /▶ Revisar o painel/ })).toBeDefined()

    await $.tool.call({ tool: 'TaskUpdate', taskId: 'n1', status: 'completed' })
    expect(await pane.find({ text: /Revisar o painel/ })).toBeUndefined()
    expect(await pane.find({ text: /0 abertas · 1 feitas/ })).toBeDefined()
  })
}
