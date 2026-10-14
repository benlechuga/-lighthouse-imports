import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { probe } from './git'

const PANE = 'lighthouse-painel'
const TITLE = 'Lighthouse Imports'
const info = atom({ plugin: 'lighthouse-painel', key: 'info' } as const, null)

const WRITES = new Set(['Bash', 'Edit', 'Write', 'MultiEdit', 'NotebookEdit'])

const PUBLISH_PROMPT =
  'Publique o site da Lighthouse Imports: revise as mudanças pendentes com git status e git diff, ' +
  'faça um commit com uma mensagem clara em português e envie com git push para a branch atual. ' +
  'Se não houver nada para commitar mas houver commits locais, apenas faça o push. Me diga o que foi publicado.'

async function refresh($: EngineInterface): Promise<void> {
  const fresh = await probe($)
  await update($, info, () => fresh)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'painel',
      description: 'Abre o painel do site Lighthouse Imports (branch, mudanças, último commit)',
    })
    void $.ui.open({ id: PANE, title: TITLE })
    void refresh($)
    $.clock.every(15_000, () => refresh($))

    return next(e)
  })

  on('command.run', { command: 'painel' }, async $ => {
    await $.ui.open({ id: PANE, title: TITLE, focus: true })
    await refresh($)

    return { text: 'Painel da Lighthouse Imports aberto.' }
  })

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (WRITES.has(String(e.tool))) void refresh($)

    return ran
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const site = await read($, info)
    const room = Math.max(3, (e.viewport?.rows ?? 24) - 9)

    if (site === null) {
      return (
        <Box flexDirection="column">
          <Text bold>⚓ {TITLE}</Text>
          <Text dimColor>Lendo o repositório…</Text>
        </Box>
      )
    }

    const pending = site.changes.length
    const unpushed = site.ahead ?? 0
    const isClean = pending === 0 && unpushed === 0
    const status = isClean
      ? '✅ Tudo publicado'
      : `⏳ ${pending} mudança${pending === 1 ? '' : 's'} pendente${pending === 1 ? '' : 's'}` +
        (unpushed > 0 ? ` · ${unpushed} commit${unpushed === 1 ? '' : 's'} sem push` : '')

    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="column">
          <Text bold>⚓ {TITLE}</Text>
          <Text>
            <Text dimColor>branch </Text>
            <Text color="cyan">{site.branch}</Text>
            {site.behind ? <Text color="yellow"> ({site.behind} atrás do remoto)</Text> : null}
          </Text>
          <Text color={isClean ? 'green' : 'yellow'}>{status}</Text>
        </Box>

        <Box flexDirection="column">
          <Text dimColor>Mudanças no site</Text>
          {pending === 0 && <Text dimColor>  nenhuma</Text>}
          {site.changes.slice(0, room).map(change => (
            <Text>
              <Text color={change.kind === 'apagado' ? 'red' : change.kind === 'novo' ? 'green' : 'yellow'}>
                {'  ' + change.kind.padEnd(10)}
              </Text>
              {change.path}
            </Text>
          ))}
          {pending > room && <Text dimColor>  … e mais {pending - room}</Text>}
        </Box>

        <Box flexDirection="column">
          <Text dimColor>Último commit</Text>
          <Text wrap="truncate-end">  {site.lastCommit}</Text>
        </Box>

        <Box gap={1}>
          <Button key="refresh" label="Atualizar" hotkey="a" onPress={() => refresh($)} />
          {!isClean && (
            <Button
              key="publish"
              label="Publicar"
              hotkey="p"
              variant="primary"
              onPress={() => $.prompt.submit({ text: PUBLISH_PROMPT })}
            />
          )}
          <Button key="close" label="Fechar" role="dismiss" onPress={() => $.ui.close({ id: PANE })} />
        </Box>
      </Box>
    )
  })
}
