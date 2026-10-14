import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

const HOME = '/home/tester'
const BUILDER_ID = 'builder-session-id'

/** An in-memory file system plus the session facts the planner side needs. */
function world(on: On, files: Record<string, string>) {
  mock.clock(on, { now: 1_700_000_000_000 })
  mock.env(on, { HOME })
  on('fs.write', (_$, e) => {
    files[e.path] = e.text
    return { value: undefined }
  })
  on('fs.exists', (_$, e) => ({ value: e.path in files }))
  on('fs.read', (_$, e) => {
    const text = files[e.path]
    if (text === undefined) throw new Error(`ENOENT ${e.path}`)
    return { value: text }
  })
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('session.receive', (_$, e) => ({ text: e.text }))
  on('session.id', () => ({ value: 'planner-session-id' }))
  on('session.cwd', () => ({ value: '/work/planner' }))
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('tool.register', (_$, e) => ({ value: { tool: `mcp__duo__${e.name}` } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.invalidate', () => ({ value: undefined }))
}

const RUN = { origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } } as const

async function becomePlanner($: Engine) {
  await $.session.start({ cwd: '/work/planner', surface: 'terminal', isInteractive: true })
  return $.command.run({ ...RUN, command: 'duo', args: 'planner' })
}

test('taking a role announces the session and finds the other side', async ($, on) => {
  const files: Record<string, string> = {
    [`${HOME}/.claude/duo/builder.json`]: JSON.stringify({ role: 'builder', sessionId: BUILDER_ID, cwd: '/work', at: 1 }),
  }
  world(on, files)

  const ran = await becomePlanner($)

  expect(ran.text).toContain('planejador')
  expect(ran.text).toContain(BUILDER_ID)
  const mine = JSON.parse(files[`${HOME}/.claude/duo/planner.json`] ?? '{}')
  expect(mine.sessionId).toBe('planner-session-id')
})

test('the send tool delivers a framed plan to the builder session', async ($, on) => {
  const files: Record<string, string> = {
    [`${HOME}/.claude/duo/builder.json`]: JSON.stringify({ role: 'builder', sessionId: BUILDER_ID, cwd: '/work', at: 1 }),
  }
  world(on, files)
  const sent: { to: string; text: string }[] = []
  on('session.send', (_$, e) => {
    sent.push({ to: e.to, text: e.text })
    return { isDelivered: true }
  })

  await becomePlanner($)
  const answered = await $.tool.call({ tool: 'mcp__duo__send', kind: 'plan', text: 'Etapa 1: criar o módulo X' })

  expect(answered.deny).toBeUndefined()
  expect(String(answered.result)).toContain('Entregue')
  expect(sent.length).toBe(1)
  expect(sent[0]?.to).toContain(BUILDER_ID)
  expect(sent[0]?.text).toBe('[duo:plan from planner]\nEtapa 1: criar o módulo X')
})

test('without the other side announced the send fails and says why', async ($, on) => {
  const files: Record<string, string> = {}
  world(on, files)
  let sends = 0
  on('session.send', () => {
    sends += 1
    return { isDelivered: true }
  })

  await becomePlanner($)
  const answered = await $.tool.call({ tool: 'mcp__duo__send', kind: 'plan', text: 'Etapa 1' })

  expect(sends).toBe(0)
  expect(String(answered.result)).toContain('/duo builder')
})

test('a result from the builder is logged and framed for the planner model', async ($, on) => {
  const files: Record<string, string> = {}
  world(on, files)
  on('session.send', () => ({ isDelivered: true }))

  await becomePlanner($)
  const received = await $.session.receive({
    origin: { kind: 'peer', plugin: 'duo' },
    text: '[duo:result from builder]\nFeito: módulo X criado e testado.',
  })

  expect(received.consumed).toBeUndefined()
  expect(received.text).toContain('construtora devolveu')
  expect(received.text).toContain('Feito: módulo X criado e testado.')
  expect(received.text).not.toContain('[duo:result')
})

test('the pane lists what was exchanged and its field sends a note', async ($, on) => {
  const files: Record<string, string> = {
    [`${HOME}/.claude/duo/builder.json`]: JSON.stringify({ role: 'builder', sessionId: BUILDER_ID, cwd: '/work', at: 1 }),
  }
  world(on, files)
  const sent: string[] = []
  on('session.send', (_$, e) => {
    sent.push(e.text)
    return { isDelivered: true }
  })

  await becomePlanner($)
  await $.tool.call({ tool: 'mcp__duo__send', kind: 'plan', text: 'Etapa 1: criar X' })
  await $.session.receive({ origin: { kind: 'peer', plugin: 'duo' }, text: '[duo:result from builder]\nX criado.' })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({
      plugin: 'duo',
      surface,
      component: 'Pane',
      requestId: 'duo',
      props: { title: 'duo', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
    })
    expect(await ui.find({ type: 'Text', text: /plano/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /resultado/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /X criado\./ })).toBeDefined()

    await $.ui.input({ plugin: 'duo', key: 'compose', text: 'pode seguir' })
    expect(sent.at(-1)).toBe('[duo:note from planner]\npode seguir')
    await ui.unmount()
  }
})
