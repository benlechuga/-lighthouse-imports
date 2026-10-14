import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { LastRoute, RouteStats } from '../types'
import { classify, shortModel } from './classify'

const COMMAND = 'routing'
const STORE_KEY = 'enabled'

const enabled = atom({ plugin: 'smart-task-routing', key: 'enabled' } as const, true)
const last = atom({ plugin: 'smart-task-routing', key: 'last' } as const, null)
const stats = atom({ plugin: 'smart-task-routing', key: 'stats' } as const, { cheap: 0, main: 0 })

/** What the router decided for one prompt, before its turn has an id. */
type Decision = { text: string; cheap: boolean; reason: string }

/** A turn the router sent to the cheap model, by its turn id. */
type CheapTurn = { model: string; reason: string; steps: number; isEscalated: boolean }

async function setEnabled($: EngineInterface, value: boolean): Promise<void> {
  await update($, enabled, () => value)
  await $.store.set(STORE_KEY, value)
  $.ui.status(value ? 'roteador: ligado' : 'roteador: desligado')
}

export const register: Register = (on, options) => {
  const cheapModel = String(options.cheapModel || 'haiku')
  const classifier = options.classifier === 'haiku' ? 'haiku' : 'rules'
  const cheapEffort = String(options.cheapEffort || 'low')
  const maxCheapSteps = Math.max(1, Number(options.maxCheapSteps) || 8)

  /** Decisions made at prompt.submit, waiting for their turn.start (FIFO). */
  const pending: Decision[] = []
  /** The turns running on the cheap model right now. */
  const cheapTurns = new Map<string, CheapTurn>()

  on('session.start', async ($, e, next) => {
    const stored = await $.store.get(STORE_KEY)
    const isOn = typeof stored === 'boolean' ? stored : true
    await update($, enabled, () => isOn)
    await $.command.register({
      name: COMMAND,
      description: 'Roteador de tarefas simples: on, off, status ou test <pedido>',
      argumentHint: 'on|off|status|test <pedido>',
    })
    $.ui.status(isOn ? 'roteador: ligado' : 'roteador: desligado')

    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    // A slash command, a hidden prompt or a delivery into a running turn is not a new ask.
    if (e.command || e.isMeta || e.turnId !== undefined) return next(e)
    if (!(await read($, enabled))) return next(e)

    let verdict = classify(e.text)
    if (verdict.kind === 'unsure' && classifier === 'haiku' && !e.attachments) {
      try {
        const label = await $.model.classify(e.text, ['simple', 'complex'], { model: cheapModel })
        if (label === 'simple') verdict = { kind: 'simple', reason: `classificado por ${shortModel(cheapModel)}` }
      } catch {
        // the classifier failed: the main model takes it
      }
    }

    pending.push({ text: e.text, cheap: verdict.kind === 'simple', reason: verdict.reason })
    if (pending.length > 20) pending.shift()

    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.start', ($, e, next) => {
    if (e.agentId !== undefined) return next(e)

    const at = pending.findIndex(d => d.text === e.text)
    const decision = at >= 0 ? pending.splice(at, 1)[0] : pending.shift()
    if (decision?.cheap) {
      cheapTurns.set(e.turnId, { model: cheapModel, reason: decision.reason, steps: 0, isEscalated: false })
      $.ui.toast(`→ ${shortModel(cheapModel)} · ${decision.reason}`)
    }

    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    const route = e.agentId === undefined ? cheapTurns.get(e.turnId) : undefined
    if (!route || route.isEscalated) return yield* next(e)

    if (route.steps >= maxCheapSteps) {
      route.isEscalated = true
      $.ui.toast(`${shortModel(route.model)} passou de ${maxCheapSteps} passos · voltando ao modelo principal`)

      return yield* next(e)
    }

    route.steps += 1
    const effort =
      e.effort !== undefined && cheapEffort !== 'keep' ? (cheapEffort as 'low' | 'medium') : e.effort

    return yield* next({ ...e, model: route.model, effort })
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId !== undefined) return next(e)

    const route = cheapTurns.get(e.turnId)
    cheapTurns.delete(e.turnId)
    const result = await next(e)
    if (e.reason !== 'answer') return result

    const isOn = await read($, enabled)
    const answered = shortModel(e.usage?.model ?? (route && !route.isEscalated ? route.model : await $.session.model()))

    let entry: LastRoute
    let text: string
    if (route?.isEscalated) {
      entry = { kind: 'main', model: answered, reason: route.reason, isEscalated: true }
      text = `⚡→● ${shortModel(route.model)} → ${answered} · ${route.reason}, mas passou de ${maxCheapSteps} passos e voltou ao principal`
    } else if (route) {
      entry = { kind: 'cheap', model: answered, reason: route.reason, isEscalated: false }
      text = `⚡ ${answered} · ${route.reason}`
    } else {
      entry = { kind: 'main', model: answered, reason: isOn ? 'modelo principal' : 'roteador desligado', isEscalated: false }
      text = `● ${answered} · ${entry.reason}`
    }

    await update($, last, () => entry)
    await update($, stats, (s: RouteStats) => ({ ...s, [entry.kind]: s[entry.kind] + 1 }))
    $.ui.status(`roteador: ${isOn ? 'ligado' : 'desligado'} · último: ${answered}`)

    return { text, usage: result.usage }
  })

  on('command.run', { command: COMMAND }, async ($, e) => {
    const [verb = '', ...rest] = e.args.trim().split(/\s+/)
    const arg = rest.join(' ')

    switch (verb.toLowerCase()) {
      case 'on':
      case 'liga':
      case 'ligar':
        await setEnabled($, true)
        return { text: `Roteador ligado: pedidos simples vão para ${shortModel(cheapModel)}.` }
      case 'off':
      case 'desliga':
      case 'desligar':
        await setEnabled($, false)
        return { text: 'Roteador desligado: tudo vai para o modelo principal.' }
      case 'test':
      case 'testa': {
        if (!arg) return { text: 'Uso: /routing test <pedido>' }
        const v = classify(arg)
        const where = v.kind === 'simple' ? shortModel(cheapModel) : 'modelo principal'
        return { text: `"${arg}" → ${where} (${v.reason})` }
      }
      default: {
        const isOn = await read($, enabled)
        const s = await read($, stats)
        const l = await read($, last)
        const lines = [
          `Roteador: ${isOn ? 'ligado' : 'desligado'} · simples → ${shortModel(cheapModel)} · classificador: ${classifier}`,
          `Respostas nesta sessão: ${s.cheap} no modelo barato, ${s.main} no principal`,
          l ? `Última: ${l.model} (${l.reason})` : 'Nenhuma resposta ainda',
          'Comandos: /routing on · /routing off · /routing test <pedido>',
        ]
        return { text: lines.join('\n') }
      }
    }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)

    const { Box, Button, Text } = $.ui.resolve(e)
    const isOn = await read($, enabled)
    const l = await read($, last)
    const lastText = l ? ` · último: ${l.kind === 'cheap' ? '⚡' : '●'} ${l.model}` : ''

    return (
      <Box>
        <Text dimColor>
          {isOn ? `roteador ligado · simples → ${shortModel(cheapModel)}` : 'roteador desligado'}
          {lastText}{' '}
        </Text>
        <Button
          key="toggle"
          label={isOn ? 'Desligar' : 'Ligar'}
          onPress={() => setEnabled($, !isOn)}
        />
      </Box>
    )
  })
}
