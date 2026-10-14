import type { Register } from 'claude-code'

import { judge } from './rules'

const PREFIX = 'Guardião Lighthouse'

export const register: Register = on => {
  on('tool.call', { tool: 'Bash' }, ($, e, next) => {
    const why = judge(e.command)
    if (why === undefined) return next(e)

    $.ui.toast(`🛡️ Bloqueado: ${why}`)
    return {
      deny:
        `${PREFIX} bloqueou este comando: ${why}. ` +
        'Explique ao usuário o que você queria fazer e peça confirmação explícita antes de tentar de outro jeito. ' +
        'Não contorne o bloqueio.',
    }
  }).catch(($, e, next) => (next.called ? next(e) : { deny: `${PREFIX}: a verificação falhou, comando não executado.` }))
}
