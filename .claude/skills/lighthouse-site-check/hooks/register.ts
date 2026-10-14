import type { EngineInterface, Register } from 'claude-code'

import { checkSite, report } from './checks'
import type { Site } from './checks'

function siteOf($: EngineInterface): Site {
  return {
    read: async path => {
      try {
        return await $.fs.read(path)
      } catch {
        return null
      }
    },
    exists: path => $.fs.exists(path),
    checkJs: async path => {
      try {
        const ran = await $.process.run(['node', '--check', path], { timeoutMs: 15_000 })
        return ran.exitCode === 0 ? null : ran.stderr.trim().split('\n').slice(0, 3).join(' ')
      } catch (error) {
        return error instanceof Error ? error.message : String(error)
      }
    },
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'site-check',
      description: 'Valida index.html, links, sitemap, robots, manifest e script.js do site Lighthouse Imports',
    })

    return next(e)
  })

  on('command.run', { command: 'site-check' }, async $ => {
    const findings = await checkSite(siteOf($))
    const errors = findings.filter(f => f.level === 'erro').length
    $.ui.toast(errors === 0 ? '✅ /site-check: nada quebrado' : `❌ /site-check: ${errors} erro${errors === 1 ? '' : 's'}`)

    return { text: report(findings) }
  })
}
