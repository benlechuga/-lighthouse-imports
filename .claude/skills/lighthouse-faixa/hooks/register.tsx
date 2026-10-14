import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { describe, take } from './snap'

const snap = atom({ plugin: 'lighthouse-faixa', key: 'snap' } as const, null)
const isHidden = atom({ plugin: 'lighthouse-faixa', key: 'isHidden' } as const, false)

const WRITES = new Set(['Bash', 'Edit', 'Write', 'MultiEdit', 'NotebookEdit'])

async function refresh($: EngineInterface): Promise<void> {
  const fresh = await take($)
  await update($, snap, () => fresh)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'faixa',
      description: 'Mostra ou esconde a faixa de status do site Lighthouse Imports acima do prompt',
    })
    void refresh($)
    $.clock.every(10_000, () => refresh($))

    return next(e)
  })

  on('command.run', { command: 'faixa' }, async $ => {
    const hidden = await update($, isHidden, was => !was)
    if (!hidden) await refresh($)

    return { text: hidden ? 'Faixa escondida. Use /faixa de novo para mostrar.' : 'Faixa visível.' }
  })

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (WRITES.has(String(e.tool))) void refresh($)

    return ran
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const current = await read($, snap)
    const isQuiet = e.props.hasSurvey || current === null || (await read($, isHidden))
    if (isQuiet) return next(e)

    const { Box, Button, Text } = $.ui.resolve(e)
    const { text, isClean } = describe(current)

    return (
      <Box gap={1}>
        <Text color={isClean ? 'green' : 'yellow'} wrap="truncate-end">
          {text}
        </Text>
        <Button key="hide" plain dimColor label="esconder" onPress={() => update($, isHidden, () => true)} />
      </Box>
    )
  })
}
