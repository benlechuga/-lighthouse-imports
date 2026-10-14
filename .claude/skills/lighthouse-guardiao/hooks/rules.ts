/** Arquivos que formam o site publicado: apagá-los pelo shell é bloqueado. */
export const SITE_FILES =
  /(^|[\s/'"])(index\.html|styles\.css|script\.js|vercel\.json|sitemap\.xml|robots\.txt|site\.webmanifest|favicon\.(png|svg)|apple-touch-icon\.png|icon-(192|512)\.png|og-image\.(png|svg))(?=$|[\s'"])/

type Rule = { test: (command: string) => boolean; why: string }

const has = (re: RegExp) => (command: string) => re.test(command)

/** Um `rm` recursivo ou forçado cujo alvo não está em /tmp. */
function isDestructiveRm(command: string): boolean {
  for (const piece of command.split(/\s*(?:&&|\|\||;|\|)\s*/)) {
    const words = piece.trim().split(/\s+/)
    if (words[0] !== 'rm' && !(words[0] === 'sudo' && words[1] === 'rm')) continue
    const flags = words.filter(w => w.startsWith('-')).join(' ')
    const targets = words.slice(1).filter(w => !w.startsWith('-'))
    const isRecursive = /-[a-zA-Z]*[rR]|--recursive/.test(flags)
    const isForced = /-[a-zA-Z]*f|--force/.test(flags)
    if (!isRecursive && !isForced) continue
    if (targets.length > 0 && targets.every(t => t.startsWith('/tmp/'))) continue
    return true
  }
  return false
}

export const RULES: Rule[] = [
  {
    test: has(/\bgit\s+push\b[^\n;&|]*\s(--force\b|-f\b|--force-with-lease\b)/),
    why: 'push forçado reescreve o histórico já publicado',
  },
  { test: has(/\bgit\s+reset\s+--hard\b/), why: 'git reset --hard descarta mudanças sem volta' },
  { test: has(/\bgit\s+checkout\s+(--\s+)?\.(\s|$)/), why: 'git checkout . descarta todas as mudanças locais' },
  { test: has(/\bgit\s+restore\s+(--\s+)?\.(\s|$)/), why: 'git restore . descarta todas as mudanças locais' },
  { test: has(/\bgit\s+clean\s+-[a-zA-Z]*f/), why: 'git clean -f apaga arquivos não rastreados' },
  { test: has(/\bgit\s+branch\s+-D\b/), why: 'git branch -D apaga uma branch sem checar se foi mesclada' },
  { test: isDestructiveRm, why: 'rm recursivo ou forçado fora de /tmp' },
  {
    test: command => /(^|[\s;&|])rm\s/.test(command) && SITE_FILES.test(command),
    why: 'apagaria um arquivo do site publicado',
  },
  {
    test: command => /(^|[\s;&|])git\s+rm\s/.test(command) && SITE_FILES.test(command),
    why: 'removeria um arquivo do site do repositório',
  },
]

/** O motivo do bloqueio, ou undefined quando o comando pode seguir. */
export function judge(command: string): string | undefined {
  return RULES.find(rule => rule.test(command))?.why
}
