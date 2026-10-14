import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { DuoKind, DuoMessage, DuoPeer, DuoRole } from '../types'

// duo: two Claude Code sessions on one machine, a planner and a builder.
//
// Each session picks a role (`/duo planner`, `/duo builder`, or the env var
// CLAUDE_DUO_ROLE) and announces its session id in a small registry file
// under ~/.claude/duo/<role>.json. A message to the other side is sent with
// `$.session.send({ to: { sessionId } })`, the same channel the SendMessage
// tool uses, and arrives there through `session.receive`, where this mod
// logs it for the pane and frames it for the model. The model sends with
// the `mcp__duo__send` tool; `/duo auto` forwards every answer by itself.

const PANE = 'duo'
const TOOL = 'mcp__duo__send'
const HEADER = /^\[duo:(plan|result|note) from (planner|builder)\]\n?/

const role = atom({ plugin: 'duo', key: 'role' } as const, null)
const messages = atom({ plugin: 'duo', key: 'messages' } as const, [])
const peer = atom({ plugin: 'duo', key: 'peer' } as const, null)
const isAuto = atom({ plugin: 'duo', key: 'isAuto' } as const, false)

const otherOf = (r: DuoRole): DuoRole => (r === 'planner' ? 'builder' : 'planner')

const isRole = (s: string): s is DuoRole => s === 'planner' || s === 'builder'

const isKind = (s: unknown): s is DuoKind => s === 'plan' || s === 'result' || s === 'note'

const labelOf = (r: DuoRole | 'unknown' | null) =>
  r === 'planner' ? 'planejador' : r === 'builder' ? 'construtor' : 'desconhecido'

const kindLabel = (k: DuoKind) => (k === 'plan' ? 'plano' : k === 'result' ? 'resultado' : 'nota')

const pad = (n: number) => String(n).padStart(2, '0')

const clock = (at: number) => {
  const d = new Date(at)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** The registry folder: ~/.claude/duo. */
async function registryDir($: EngineInterface): Promise<string> {
  const home = (await $.env.get('HOME')) ?? (await $.env.get('USERPROFILE')) ?? '.'
  return `${home}/.claude/duo`
}

/** Writes this session's id under its role so the other side can find it. */
async function announce($: EngineInterface, r: DuoRole): Promise<void> {
  const entry: DuoPeer = {
    role: r,
    sessionId: await $.session.id(),
    cwd: await $.session.cwd(),
    at: await $.clock.now(),
  }
  await $.fs.write(`${await registryDir($)}/${r}.json`, JSON.stringify(entry, null, 2))
}

/** Reads the other role's registry entry, or null when none is announced. */
async function findPeer($: EngineInterface, r: DuoRole): Promise<DuoPeer | null> {
  const path = `${await registryDir($)}/${otherOf(r)}.json`
  if (!(await $.fs.exists(path))) return null
  try {
    const parsed = JSON.parse(await $.fs.read(path)) as Partial<DuoPeer>
    if (typeof parsed.sessionId !== 'string' || parsed.sessionId === '') return null
    return {
      role: otherOf(r),
      sessionId: parsed.sessionId,
      cwd: typeof parsed.cwd === 'string' ? parsed.cwd : '',
      at: typeof parsed.at === 'number' ? parsed.at : 0,
    }
  } catch {
    return null
  }
}

async function remember($: EngineInterface, message: DuoMessage): Promise<void> {
  await update($, messages, list => [...list, message].slice(-200))
}

/** What the model on the other side reads around the body. */
function frameFor(kind: DuoKind, from: DuoRole, body: string): string {
  if (kind === 'plan') {
    return (
      `A sessão planejadora mandou um plano. Implemente este plano agora. ` +
      `Quando terminar, devolva o resultado com a ferramenta mcp__duo__send (kind: "result"), ` +
      `resumindo o que foi feito, o que foi testado e o que ficou pendente.\n\n${body}`
    )
  }
  if (kind === 'result') {
    return (
      `A sessão construtora devolveu o resultado da última etapa. Revise, ` +
      `e então mande a próxima etapa do plano com mcp__duo__send (kind: "plan"), ` +
      `ou avise a pessoa se tudo já estiver concluído.\n\n${body}`
    )
  }
  return `Nota da sessão ${from === 'planner' ? 'planejadora' : 'construtora'}:\n\n${body}`
}

/** Sends `text` to the other role; logs the attempt either way. */
async function sendToPeer(
  $: EngineInterface,
  kind: DuoKind,
  text: string,
): Promise<{ isDelivered: boolean; reason?: string }> {
  const mine = await read($, role)
  if (mine === null) {
    return { isDelivered: false, reason: 'Esta sessão ainda não tem papel: use /duo planner ou /duo builder.' }
  }
  const body = text.trim()
  if (body === '') return { isDelivered: false, reason: 'Mensagem vazia.' }

  await announce($, mine)
  const found = await findPeer($, mine)
  await update($, peer, () => found)

  const base: DuoMessage = {
    id: crypto.randomUUID(),
    at: await $.clock.now(),
    direction: 'out',
    kind,
    from: mine,
    text: body,
  }

  if (found === null) {
    const reason = `Nenhuma sessão ${labelOf(otherOf(mine))} anunciada. Na outra sessão rode /duo ${otherOf(mine)}.`
    await remember($, { ...base, isDelivered: false, reason })
    $.ui.toast(`duo: ${reason}`)
    return { isDelivered: false, reason }
  }

  const sent = await $.session.send({
    to: { sessionId: found.sessionId },
    text: `[duo:${kind} from ${mine}]\n${body}`,
  })
  await remember($, {
    ...base,
    isDelivered: sent.isDelivered,
    ...(sent.isDelivered ? {} : { reason: sent.reason }),
  })
  if (!sent.isDelivered) $.ui.toast(`duo: não entregue (${sent.reason})`)
  else $.ui.status(`duo: ${kindLabel(kind)} enviado ao ${labelOf(otherOf(mine))}`)
  return sent.isDelivered ? { isDelivered: true } : { isDelivered: false, reason: sent.reason }
}

async function openPane($: EngineInterface): Promise<void> {
  const mine = await read($, role)
  await $.ui.open({ id: PANE, title: mine ? `duo · ${labelOf(mine)}` : 'duo', columns: 48 })
}

async function takeRole($: EngineInterface, r: DuoRole): Promise<string> {
  await update($, role, () => r)
  await announce($, r)
  const found = await findPeer($, r)
  await update($, peer, () => found)
  await $.ui.invalidate('prompt.section')
  await openPane($)
  const peerLine = found
    ? `Outra sessão (${labelOf(found.role)}) encontrada: ${found.sessionId}.`
    : `A sessão ${labelOf(otherOf(r))} ainda não se anunciou: rode /duo ${otherOf(r)} lá.`
  return `Esta sessão agora é a ${labelOf(r)}. ${peerLine}`
}

const HELP =
  'Uso: /duo planner | /duo builder | /duo off | /duo auto [on|off] | /duo send <texto> | /duo clear | /duo'

export const register: Register = on => {
  // Set while the model sent through the tool in the running turn, so an
  // `auto` forward does not send the same answer twice.
  let sentThisTurn = false

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'duo',
      description: 'Liga duas sessões (planejador e construtor) e abre o painel de mensagens',
      argumentHint: 'planner|builder|auto|send <texto>|clear|off',
    })
    await $.tool.register({
      name: 'send',
      description:
        'Manda uma mensagem para a outra sessão do Claude Code neste computador (o planejador manda planos ao construtor; o construtor devolve resultados ao planejador). kind: "plan" para uma etapa planejada, "result" para o resultado de uma etapa construída, "note" para qualquer outra coisa.',
      inputSchema: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['plan', 'result', 'note'] },
          text: { type: 'string', description: 'A mensagem completa, em texto simples ou markdown.' },
        },
        required: ['kind', 'text'],
      },
      isDeferred: false,
    })

    let mine = await read($, role)
    if (mine === null) {
      const fromEnv = (await $.env.get('CLAUDE_DUO_ROLE')) ?? ''
      if (isRole(fromEnv)) {
        await update($, role, () => fromEnv)
        mine = fromEnv
      }
    }
    if (mine !== null) {
      await announce($, mine)
      const found = await findPeer($, mine)
      await update($, peer, () => found)
      void openPane($)
    }

    return next(e)
  })

  on('session.end', async ($, e, next) => {
    const mine = await read($, role)
    if (mine !== null && e.reason !== 'clear') {
      const path = `${await registryDir($)}/${mine}.json`
      try {
        const held = JSON.parse(await $.fs.read(path)) as Partial<DuoPeer>
        if (held.sessionId === e.sessionId) {
          await $.fs.write(path, JSON.stringify({ role: mine, sessionId: '', endedAt: await $.clock.now() }))
        }
      } catch {
        // nothing announced under this role: nothing to clear
      }
    }
    return next(e)
  })

  on('command.run', { command: 'duo' }, async ($, e) => {
    const args = e.args.trim()
    const [head = '', ...rest] = args.split(/\s+/)
    const tail = args.slice(head.length).trim()

    if (head === '') {
      await openPane($)
      const mine = await read($, role)
      const found = await read($, peer)
      const auto = await read($, isAuto)
      return {
        text:
          `duo: papel ${mine ? labelOf(mine) : 'nenhum'}; ` +
          `outra sessão ${found ? `${labelOf(found.role)} (${found.sessionId})` : 'não encontrada'}; ` +
          `auto ${auto ? 'ligado' : 'desligado'}.\n${HELP}`,
      }
    }
    if (isRole(head)) return { text: await takeRole($, head) }
    if (head === 'off') {
      await update($, role, () => null)
      await update($, peer, () => null)
      await $.ui.invalidate('prompt.section')
      return { text: 'duo: esta sessão não tem mais papel.' }
    }
    if (head === 'auto') {
      const want = rest[0] === 'on' ? true : rest[0] === 'off' ? false : !(await read($, isAuto))
      await update($, isAuto, () => want)
      return {
        text: want
          ? 'duo auto ligado: cada resposta desta sessão é enviada à outra (plano se planejador, resultado se construtor).'
          : 'duo auto desligado: o modelo envia só quando chama mcp__duo__send.',
      }
    }
    if (head === 'send') {
      const sent = await sendToPeer($, 'note', tail)
      return { text: sent.isDelivered ? 'duo: nota enviada.' : `duo: não enviada. ${sent.reason ?? ''}` }
    }
    if (head === 'clear') {
      await update($, messages, () => [])
      return { text: 'duo: painel limpo.' }
    }
    return { text: HELP }
  })

  on('turn.start', ($, e, next) => {
    if (e.agentId === undefined) sentThisTurn = false
    return next(e)
  })

  on('tool.call', { tool: TOOL }, async ($, e) => {
    const input = e as unknown as Record<string, unknown>
    const kind = isKind(input.kind) ? input.kind : 'note'
    const text = typeof input.text === 'string' ? input.text : ''
    const sent = await sendToPeer($, kind, text)
    if (e.agentId === undefined) sentThisTurn = true
    const mine = await read($, role)
    return {
      result: sent.isDelivered
        ? `Entregue à sessão ${mine ? labelOf(otherOf(mine)) : 'parceira'}. Ela responde quando terminar; aguarde a mensagem dela.`
        : `Não entregue: ${sent.reason ?? 'motivo desconhecido'}`,
    }
  }).catch(($, e, next) =>
    next.called ? next(e) : { deny: 'duo: o envio falhou antes de chegar à outra sessão; tente de novo.' },
  )

  on('session.receive', async ($, e, next) => {
    if (e.agentId !== undefined) return next(e)
    if (e.origin.kind !== 'peer' && e.origin.kind !== 'peer-send-message') return next(e)
    const mine = await read($, role)
    if (mine === null) return next(e)

    const match = HEADER.exec(e.text)
    const kind: DuoKind = match && isKind(match[1]) ? match[1] : 'note'
    const from: DuoRole | 'unknown' = match && isRole(match[2] ?? '') ? (match[2] as DuoRole) : 'unknown'
    const body = match ? e.text.slice(match[0].length) : e.text

    await remember($, {
      id: crypto.randomUUID(),
      at: await $.clock.now(),
      direction: 'in',
      kind,
      from,
      text: body,
    })
    $.ui.toast(`duo: ${kindLabel(kind)} recebido do ${labelOf(from)}`)

    if (from === 'unknown') return next(e)
    return next({ ...e, text: frameFor(kind, from, body) })
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    if (e.agentId !== undefined || e.reason !== 'answer' || e.answer.trim() === '') return next(e)
    if (sentThisTurn || !(await read($, isAuto))) return next(e)
    const mine = await read($, role)
    if (mine === null) return next(e)
    await sendToPeer($, mine === 'planner' ? 'plan' : 'result', e.answer)
    return next(e)
  })

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    const mine = await read($, role)
    if (mine === null) return composed
    const text =
      mine === 'planner'
        ? 'Você é a sessão PLANEJADORA de uma dupla (plugin duo). Outra sessão do Claude Code, a CONSTRUTORA, roda neste computador e implementa o que você planeja. ' +
          'Trabalhe por etapas: planeje uma etapa pequena e verificável, escreva o plano completo (arquivos, mudanças, critérios de pronto) e envie com a ferramenta mcp__duo__send (kind: "plan"). ' +
          'Depois pare e espere: a construtora devolve o resultado como uma mensagem de outra sessão. Ao recebê-lo, revise, e mande a próxima etapa ou diga à pessoa que acabou. Não implemente você mesma o que cabe à construtora.'
        : 'Você é a sessão CONSTRUTORA de uma dupla (plugin duo). Outra sessão do Claude Code, a PLANEJADORA, roda neste computador e manda planos por etapa como mensagens de outra sessão. ' +
          'Ao receber um plano, implemente-o por completo, rode os testes e verificações que couberem, e devolva o resultado com a ferramenta mcp__duo__send (kind: "result"): o que foi feito, o que foi verificado, o que ficou pendente e dúvidas para a planejadora. ' +
          'Se o plano estiver ambíguo, pergunte à planejadora com mcp__duo__send (kind: "note") em vez de adivinhar.'
    return { sections: [...composed.sections, { id: 'duo:role', text, scope: 'session' }] }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const table = $.ui.resolve(e)
    const { Box, Text, Button } = table
    const Input = 'Input' in table ? table.Input : undefined
    const mine = await read($, role)
    const found = await read($, peer)
    const auto = await read($, isAuto)
    const list = await read($, messages)
    const columns = Math.max(20, e.props.bodyColumns)
    const shown = list.slice(-30)

    const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, Math.max(0, n - 1))}…` : s)

    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="column">
          <Text>
            Papel: <Text weight="bold">{mine ? labelOf(mine) : 'nenhum (/duo planner ou /duo builder)'}</Text>
          </Text>
          <Text dimColor>
            {found
              ? `Outro lado: ${labelOf(found.role)} · ${cut(found.sessionId, columns - 20)}`
              : mine
                ? `Outro lado: ainda não anunciado (/duo ${otherOf(mine)} lá)`
                : 'Outro lado: —'}
          </Text>
          <Box gap={1}>
            <Button key="auto" plain onPress={() => update($, isAuto, v => !v)}>
              [{auto ? 'x' : ' '}] auto-enviar respostas
            </Button>
            <Button key="clear" plain onPress={() => update($, messages, () => [])}>
              limpar
            </Button>
          </Box>
        </Box>

        <Box flexDirection="column">
          {shown.length === 0 && <Text dimColor>Nenhuma mensagem trocada ainda.</Text>}
          {shown.map((m, i) => {
            const isLast = i === shown.length - 1
            const lines = m.text.split('\n').filter(l => l.trim() !== '')
            const keep = isLast ? 12 : 2
            const arrow = m.direction === 'out' ? '→' : '←'
            const who = m.direction === 'out' ? labelOf(otherOf(m.from === 'unknown' ? (mine ?? 'planner') : m.from)) : labelOf(m.from)
            const color = m.isDelivered === false ? 'red' : m.kind === 'plan' ? 'cyan' : m.kind === 'result' ? 'green' : 'yellow'
            return (
              <Box key={m.id} flexDirection="column" marginBottom={isLast ? 0 : 1}>
                <Text>
                  <Text color={color} weight="bold">
                    {arrow} {kindLabel(m.kind)}
                  </Text>
                  <Text dimColor>
                    {' '}
                    {m.direction === 'out' ? 'para' : 'de'} {who} · {clock(m.at)}
                    {m.isDelivered === false ? ' · não entregue' : ''}
                  </Text>
                </Text>
                {lines.slice(0, keep).map((l, j) => (
                  <Text key={`${m.id}-${j}`} dimColor={!isLast}>
                    {'  '}
                    {cut(l, columns - 2)}
                  </Text>
                ))}
                {lines.length > keep && (
                  <Text dimColor>
                    {'  '}(+{lines.length - keep} linhas)
                  </Text>
                )}
                {m.isDelivered === false && m.reason && (
                  <Text color="red">
                    {'  '}
                    {cut(m.reason, columns - 2)}
                  </Text>
                )}
              </Box>
            )
          })}
        </Box>

        {Input && (
          <Input
            key="compose"
            placeholder={mine ? `nota para o ${labelOf(otherOf(mine))}…` : 'defina um papel primeiro'}
            submitLabel="enviar"
            onSubmit={(value: string) => {
              void sendToPeer($, 'note', value)
            }}
          />
        )}
      </Box>
    )
  })
}
