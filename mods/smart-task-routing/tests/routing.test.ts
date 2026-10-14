import { describe, expect, mock, test } from 'claude-code/testing'
import type { TurnStepInput, TurnStepResult } from 'claude-code'

import { classify, shortModel } from '../hooks/classify'

describe('classify', () => {
  test('simple asks are routed cheap', () => {
    expect(classify('renomeia o arquivo utils.js para helpers.js').kind).toBe('simple')
    expect(classify('rename config.yaml to config.yml')).toEqual({ kind: 'simple', reason: 'renomear arquivo' })
    expect(classify('formata esse texto em lista').kind).toBe('simple')
    expect(classify('resume esse parágrafo: a reunião foi boa e decidimos lançar sexta').reason).toBe('resumo curto')
    expect(classify('git status').reason).toBe('comando de git')
    expect(classify('faz um commit com a mensagem "ajusta css"').reason).toBe('comando de git')
    expect(classify('cria uma branch feature/login').reason).toBe('comando de git')
    expect(classify('push').reason).toBe('comando de git')
    expect(classify('obrigado!').reason).toBe('mensagem curta')
  })

  test('complex asks stay on the main model', () => {
    expect(classify('implementa autenticação com JWT no backend').kind).toBe('complex')
    expect(classify('por que o deploy está falhando?').kind).toBe('complex')
    expect(classify('refactor the payment module and add tests').kind).toBe('complex')
    expect(classify('faz um commit e depois sobe pra produção').kind).toBe('complex')
    expect(classify('resolve os conflitos do rebase').kind).toBe('complex')
    expect(classify('```js\nconsole.log(1)\n```\nformata isso').kind).toBe('complex')
    expect(classify('resume: ' + 'x'.repeat(4000)).kind).toBe('complex')
    expect(classify('').kind).toBe('complex')
  })

  test('nothing matched is unsure', () => {
    expect(classify('me conta sobre a empresa').kind).toBe('unsure')
  })

  test('shortModel trims ids', () => {
    expect(shortModel('claude-haiku-4-5-20251001')).toBe('haiku-4-5')
    expect(shortModel('us.anthropic.claude-opus-5-5-v1:0')).toBe('opus-5-5')
    expect(shortModel('haiku')).toBe('haiku')
    expect(shortModel(undefined)).toBe('?')
  })
})

const MAIN = 'claude-opus-5-5'

async function drain(stream: AsyncGenerator<unknown, TurnStepResult>): Promise<TurnStepResult> {
  for (;;) {
    const item = await stream.next()
    if (item.done) return item.value
  }
}

function step(turnId: string, index: number): TurnStepInput {
  return { turnId, index, model: MAIN, effort: 'high', messageCount: 1 }
}

const COMPOSER = { kind: 'composer' } as const
const PRESENTATION = { isFullscreen: false, columns: 80 } as const

function run(args: string) {
  return { command: 'routing', args, origin: COMPOSER, presentation: PRESENTATION }
}

describe('routing', () => {
  test('a git command goes to the cheap model and the answer says so', async ($, on) => {
    const sent: { model: string; effort?: unknown }[] = []
    on('prompt.submit', (_, e) => ({ text: e.text }))
    on('turn.start', (_, e) => ({ turnId: e.turnId }))
    on('turn.step', async function* (_, e) {
      sent.push({ model: e.model, effort: e.effort })
      return { turnId: e.turnId, index: e.index, answer: 'ok', toolUses: [], stopReason: 'end_turn', usage: null } as TurnStepResult
    })
    on('turn.complete', (_, e) => ({ text: e.answer }))

    await $.prompt.submit({ text: 'git status', origin: { kind: 'composer' }, wait: false })
    await $.turn.start({ text: 'git status', turnId: 't1' })
    await drain($.turn.step(step('t1', 0)))
    expect(sent).toEqual([{ model: 'haiku', effort: 'low' }])

    const done = await $.turn.complete({
      answer: 'Tudo limpo.', durationMs: 10, isAborted: false, turnId: 't1', reason: 'answer',
      usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, model: 'claude-haiku-4-5-20251001' },
    })
    expect(done.text).toBe('⚡ haiku-4-5 · comando de git')
  })

  test('a complex ask stays on the main model and is labelled', async ($, on) => {
    const sent: string[] = []
    on('prompt.submit', (_, e) => ({ text: e.text }))
    on('turn.start', (_, e) => ({ turnId: e.turnId }))
    on('turn.step', async function* (_, e) {
      sent.push(e.model)
      return { turnId: e.turnId, index: e.index, answer: 'ok', toolUses: [], stopReason: 'end_turn', usage: null } as TurnStepResult
    })
    on('turn.complete', (_, e) => ({ text: e.answer }))

    await $.prompt.submit({ text: 'implementa o login com JWT', origin: { kind: 'composer' }, wait: false })
    await $.turn.start({ text: 'implementa o login com JWT', turnId: 't2' })
    await drain($.turn.step(step('t2', 0)))
    expect(sent).toEqual([MAIN])

    const done = await $.turn.complete({
      answer: 'Feito.', durationMs: 10, isAborted: false, turnId: 't2', reason: 'answer',
      usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, model: 'claude-opus-5-5-20260301' },
    })
    expect(done.text).toBe('● opus-5-5 · modelo principal')
  })

  test('a cheap turn that runs too long escalates to the main model', async ($, on) => {
    const sent: string[] = []
    on('prompt.submit', (_, e) => ({ text: e.text }))
    on('turn.start', (_, e) => ({ turnId: e.turnId }))
    on('turn.step', async function* (_, e) {
      sent.push(e.model)
      return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'tool_use', usage: null } as TurnStepResult
    })
    on('turn.complete', (_, e) => ({ text: e.answer }))

    await $.prompt.submit({ text: 'formata o README', origin: { kind: 'composer' }, wait: false })
    await $.turn.start({ text: 'formata o README', turnId: 't3' })
    for (let i = 0; i < 10; i++) await drain($.turn.step(step('t3', i)))
    expect(sent.slice(0, 8).every(m => m === 'haiku')).toBe(true)
    expect(sent.slice(8)).toEqual([MAIN, MAIN])

    const done = await $.turn.complete({
      answer: 'Formatado.', durationMs: 10, isAborted: false, turnId: 't3', reason: 'answer',
      usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, model: 'claude-opus-5-5-20260301' },
    })
    expect(done.text).toContain('⚡→● haiku → opus-5-5')
  })

  test('/routing off sends everything to the main model, /routing on brings it back', async ($, on) => {
    mock.store(on)
    const sent: string[] = []
    on('prompt.submit', (_, e) => ({ text: e.text }))
    on('turn.start', (_, e) => ({ turnId: e.turnId }))
    on('turn.step', async function* (_, e) {
      sent.push(e.model)
      return { turnId: e.turnId, index: e.index, answer: 'ok', toolUses: [], stopReason: 'end_turn', usage: null } as TurnStepResult
    })
    on('turn.complete', (_, e) => ({ text: e.answer }))

    const off = await $.command.run(run('off'))
    expect(off.text).toContain('desligado')

    await $.prompt.submit({ text: 'git status', origin: { kind: 'composer' }, wait: false })
    await $.turn.start({ text: 'git status', turnId: 't4' })
    await drain($.turn.step(step('t4', 0)))
    expect(sent).toEqual([MAIN])
    const done = await $.turn.complete({
      answer: 'ok', durationMs: 1, isAborted: false, turnId: 't4', reason: 'answer',
      usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, model: MAIN },
    })
    expect(done.text).toBe('● opus-5-5 · roteador desligado')

    const back = await $.command.run(run('on'))
    expect(back.text).toContain('ligado')
    await $.prompt.submit({ text: 'git status', origin: { kind: 'composer' }, wait: false })
    await $.turn.start({ text: 'git status', turnId: 't5' })
    await drain($.turn.step(step('t5', 0)))
    expect(sent).toEqual([MAIN, 'haiku'])
  })

  test('/routing test explains the decision, /routing shows status', async $ => {
    const t = await $.command.run(run('test renomeia foo.txt para bar.txt'))
    expect(t.text).toContain('→ haiku (renomear arquivo)')
    const s = await $.command.run(run(''))
    expect(s.text).toContain('Roteador: ligado')
  })

  test('the band above the prompt shows the state and its button toggles it', async ($, on) => {
    mock.store(on)
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({
        plugin: 'smart-task-routing', surface, component: 'AbovePrompt',
        props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 75, scroll: { offset: 0, bodyRows: 10 }, view: {} },
      })
      expect(await ui.find({ type: 'Text', text: /roteador ligado/ })).toBeDefined()
      await ui.press({ key: 'toggle' })
      expect(await ui.find({ type: 'Text', text: /roteador desligado/ })).toBeDefined()
      await ui.press({ key: 'toggle' })
      expect(await ui.find({ type: 'Text', text: /roteador ligado/ })).toBeDefined()
      await ui.unmount()
    }
  })
})
