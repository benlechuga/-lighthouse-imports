/**
 * Rules that look at one prompt and say whether it is a simple task.
 *
 * `simple`: a cheap, fast model can handle it (rename a file, format text,
 * summarize something short, a git command). `complex`: keep the main model.
 * `unsure`: the rules found neither mark; a model classifier may decide.
 */
export type Verdict =
  | { kind: 'simple'; reason: string }
  | { kind: 'complex'; reason: string }
  | { kind: 'unsure'; reason: string }

/** Past this many characters a prompt is not "something short". */
const SHORT_PROMPT = 600
/** A summary request may carry the text to summarize; past this it is not short. */
const SHORT_SUMMARY = 3000

/** Lowercase, accents stripped, whitespace collapsed. */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

const COMPLEX = [
  // building, changing or reasoning about code
  /\b(refator\w*|refactor\w*|implement\w*|implementa\w*|arquitet\w*|architect\w*)\b/,
  /\b(debug\w*|depur\w*|investig\w*|diagnos\w*|analis\w*|analys\w*|analyz\w*)\b/,
  /\b(corrig\w*|conserta\w*|arruma\w*|fix(es|ed|ing)?|bug|erro|error|exception|stack ?trace|quebr\w*|broken|failing|falhando)\b/,
  /\b(test\w*|cobertura|coverage|migra\w*|deploy\w*|segurança|seguranca|security|otimiz\w*|optimi[sz]\w*|performance|desempenho)\b/,
  /\b(planej\w*|plan(s|ning)?|design\w*|desenha\w*|revis\w*|review\w*|audit\w*|compar\w*)\b/,
  /\b(explica\w*|explain\w*|por que|porque|why|como funciona|how does|entend\w*|understand\w*)\b/,
  /\b(cria\w*|create|build\w*|constr[ou]\w*|escreve\w*|write|adiciona\w*|add) (um |uma |a |an |o |os |as |the )?(mod|plugin|feature|funcionalidade|endpoint|api|componente|component|servi[cç]o|service|app|site|pagina|page|teste|test|script|hook|classe|class|modulo|module|fun[cç][aã]o|function)\b/,
  // several steps in one ask
  /\b(e depois|e tambem|depois disso|em seguida|and then|then also|also|alem disso|besides)\b/,
  // merge/rebase style git work can need judgement on conflicts
  /\b(rebase|cherry-?pick|bisect|resolve\w* (os |the )?conflit\w*|conflict\w*)\b/,
]

const SIMPLE: ReadonlyArray<{ reason: string; test: (n: string, raw: string) => boolean }> = [
  {
    reason: 'renomear arquivo',
    test: n =>
      /\b(renomei\w*|renome\w*|rename|mv)\b/.test(n) &&
      /(\.[a-z0-9]{1,8}\b|\barquivo\b|\bfile\b|\bpasta\b|\bfolder\b|\bdiret[oó]rio\b|\bdirectory\b)/.test(n),
  },
  {
    reason: 'mover arquivo',
    test: n =>
      /\b(mov[ea]\w*|move)\b/.test(n) &&
      /(\.[a-z0-9]{1,8}\b|\barquivo\b|\bfile\b|\bpasta\b|\bfolder\b)/.test(n) &&
      /\b(para|pra|to|into)\b/.test(n),
  },
  {
    reason: 'formatar texto',
    test: n =>
      /\b(format\w*|indent\w*|prettier|alinha\w*|align|reindent\w*|tabula\w*|coloca\w* em (lista|tabela|bullets?|topicos)|turn\w* into (a )?(list|table|bullets?))\b/.test(n),
  },
  {
    reason: 'resumo curto',
    test: (n, raw) =>
      /\b(resum\w*|summari[sz]\w*|summary|tl;?dr|sintetiz\w*|sumariz\w*)\b/.test(n) &&
      raw.length <= SHORT_SUMMARY,
  },
  {
    reason: 'comando de git',
    test: n =>
      /^(\s*(faz|faça|fazer|da|dá|roda|rode|rodar|run|executa|execute|manda|mande|me (faz|da|dá|mostra)|mostra|show|cria|crie|create|abre|abra|troca|troque|muda|mude|volta|volte|lista|liste|list)\s+(um |uma |a |an |o |os |as |the |pro |pra |para |no |na |ao |à )?)?(git\s+\w+|commit\w*|commita\w*|push\w*|pull\w*|stash\w*|checkout|branch\w*|fetch\w*|git diff|diff\w*|status|git log|log|tag\w*|amend\w*|unstage|stage\w*|desfaz\w* (o )?(ultimo |último )?commit|undo (the )?(last )?commit)\b/.test(n) ||
      /\b(git (status|log|diff|add|commit|push|pull|fetch|stash|checkout|switch|branch|tag|restore|reset --soft|show|blame|remote))\b/.test(n),
  },
  {
    reason: 'mensagem curta',
    test: n =>
      /^(oi|ola|olá|hey|hi|hello|bom dia|boa tarde|boa noite|obrigad[oa]|valeu|thanks|thank you|brigad[oa]|ok|okay|beleza|show|top|perfeito|perfect|legal|nice|great|otimo|ótimo|tchau|bye)[!. ]*$/.test(n),
  },
]

export function classify(text: string): Verdict {
  const raw = text.trim()
  const n = normalize(raw)

  if (n === '') return { kind: 'complex', reason: 'pedido vazio' }
  if (/```/.test(raw)) return { kind: 'complex', reason: 'tem bloco de código' }

  for (const rule of COMPLEX) {
    if (rule.test(n)) return { kind: 'complex', reason: 'pede raciocínio ou vários passos' }
  }

  const wantsSummary = /\b(resum\w*|summari[sz]\w*|summary|tl;?dr)\b/.test(n)
  if (raw.length > (wantsSummary ? SHORT_SUMMARY : SHORT_PROMPT)) {
    return { kind: 'complex', reason: 'pedido longo' }
  }

  for (const rule of SIMPLE) {
    if (rule.test(n, raw)) return { kind: 'simple', reason: rule.reason }
  }

  return { kind: 'unsure', reason: 'nenhuma regra bateu' }
}

/** `claude-haiku-4-5-20251001` → `haiku-4-5`; `us.anthropic.claude-opus-5-5-v1:0` → `opus-5-5`. */
export function shortModel(id: string | undefined): string {
  if (!id) return '?'
  return id
    .replace(/^.*?claude-/, '')
    .replace(/-\d{8}$/, '')
    .replace(/-v\d+(:\d+)?$/, '')
    .replace(/\[.*\]$/, '')
}
