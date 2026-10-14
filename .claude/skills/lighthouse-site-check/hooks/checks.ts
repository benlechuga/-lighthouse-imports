/** O que as verificações precisam do mundo: ler, ver se existe, checar sintaxe JS. */
export type Site = {
  read: (path: string) => Promise<string | null>
  exists: (path: string) => Promise<boolean>
  checkJs?: (path: string) => Promise<string | null>
}

export type Level = 'ok' | 'aviso' | 'erro'
export type Finding = { level: Level; text: string }

const SKIP = /^(https?:)?\/\/|^(mailto|tel|data|javascript):|^#/i

/** Os caminhos locais que o HTML referencia em href, src, content (og:image) e manifest. */
export function localRefs(html: string): string[] {
  const refs = new Set<string>()
  const re = /\b(?:href|src|content)\s*=\s*["']([^"']+)["']/gi
  for (const match of html.matchAll(re)) {
    const raw = (match[1] ?? '').trim()
    if (raw === '' || SKIP.test(raw)) continue
    if (/\s/.test(raw) && !raw.includes('/')) continue
    const path = raw.replace(/[?#].*$/, '').replace(/^\.?\//, '')
    if (path === '' || !/\.[a-z0-9]{2,12}$/i.test(path)) continue
    refs.add(path)
  }
  return [...refs]
}

export function sitemapLocs(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map(m => m[1] ?? '')
}

async function checkIndex(site: Site, out: Finding[]): Promise<void> {
  const html = await site.read('index.html')
  if (html === null) {
    out.push({ level: 'erro', text: 'index.html não encontrado' })
    return
  }
  const want: [RegExp, string][] = [
    [/<html[^>]*\blang=/i, 'atributo lang no <html>'],
    [/<meta[^>]*name=["']viewport["']/i, 'meta viewport'],
    [/<title>\s*\S[^<]*<\/title>/i, '<title> preenchido'],
    [/<meta[^>]*name=["']description["'][^>]*content=["'][^"']+["']/i, 'meta description'],
    [/<link[^>]*rel=["']canonical["']/i, 'link canonical'],
    [/<meta[^>]*property=["']og:title["']/i, 'og:title'],
    [/<meta[^>]*property=["']og:image["']/i, 'og:image'],
    [/<link[^>]*rel=["']manifest["']/i, 'link para o manifest'],
  ]
  for (const [re, name] of want) {
    out.push(re.test(html) ? { level: 'ok', text: name } : { level: 'aviso', text: `falta ${name}` })
  }

  const refs = localRefs(html)
  const missing: string[] = []
  for (const ref of refs) if (!(await site.exists(ref))) missing.push(ref)
  out.push(
    missing.length === 0
      ? { level: 'ok', text: refs.length === 1 ? '1 arquivo local referenciado, existe' : `${refs.length} arquivos locais referenciados, todos existem` }
      : { level: 'erro', text: `referência quebrada: ${missing.join(', ')}` },
  )
}

async function checkSitemap(site: Site, out: Finding[]): Promise<void> {
  const xml = await site.read('sitemap.xml')
  if (xml === null) {
    out.push({ level: 'aviso', text: 'sitemap.xml não encontrado' })
    return
  }
  const locs = sitemapLocs(xml)
  if (locs.length === 0) out.push({ level: 'erro', text: 'sitemap.xml sem nenhuma <loc>' })
  else {
    const bad = locs.filter(l => !/^https:\/\//.test(l))
    out.push(
      bad.length === 0
        ? { level: 'ok', text: `sitemap com ${locs.length} URL${locs.length === 1 ? '' : 's'}, todas https` }
        : { level: 'aviso', text: `sitemap com URL sem https: ${bad.join(', ')}` },
    )
  }
}

async function checkRobots(site: Site, out: Finding[]): Promise<void> {
  const txt = await site.read('robots.txt')
  if (txt === null) out.push({ level: 'aviso', text: 'robots.txt não encontrado' })
  else if (!/^\s*sitemap:\s*https?:\/\//im.test(txt)) out.push({ level: 'aviso', text: 'robots.txt não aponta para o sitemap' })
  else if (/^\s*disallow:\s*\/\s*$/im.test(txt)) out.push({ level: 'erro', text: 'robots.txt bloqueia o site inteiro (Disallow: /)' })
  else out.push({ level: 'ok', text: 'robots.txt aponta para o sitemap' })
}

async function checkJson(site: Site, out: Finding[], path: string): Promise<unknown> {
  const txt = await site.read(path)
  if (txt === null) {
    out.push({ level: 'aviso', text: `${path} não encontrado` })
    return undefined
  }
  try {
    const value: unknown = JSON.parse(txt)
    out.push({ level: 'ok', text: `${path} é JSON válido` })
    return value
  } catch (error) {
    out.push({ level: 'erro', text: `${path} não é JSON válido: ${error instanceof Error ? error.message : String(error)}` })
    return undefined
  }
}

async function checkManifest(site: Site, out: Finding[]): Promise<void> {
  const manifest = await checkJson(site, out, 'site.webmanifest')
  if (typeof manifest !== 'object' || manifest === null) return
  const icons = (manifest as { icons?: { src?: string }[] }).icons ?? []
  const missing: string[] = []
  for (const icon of icons) {
    const src = (icon.src ?? '').replace(/^\.?\//, '')
    if (src !== '' && !(await site.exists(src))) missing.push(src)
  }
  if (icons.length === 0) out.push({ level: 'aviso', text: 'manifest sem ícones' })
  else if (missing.length > 0) out.push({ level: 'erro', text: `ícone do manifest não existe: ${missing.join(', ')}` })
  else out.push({ level: 'ok', text: `${icons.length} ícone${icons.length === 1 ? '' : 's'} do manifest existem` })
}

async function checkScript(site: Site, out: Finding[]): Promise<void> {
  if (!(await site.exists('script.js'))) {
    out.push({ level: 'aviso', text: 'script.js não encontrado' })
    return
  }
  if (site.checkJs === undefined) return
  const problem = await site.checkJs('script.js')
  out.push(problem === null ? { level: 'ok', text: 'script.js passa na checagem de sintaxe' } : { level: 'erro', text: `script.js com erro de sintaxe: ${problem}` })
}

export async function checkSite(site: Site): Promise<Finding[]> {
  const out: Finding[] = []
  await checkIndex(site, out)
  await checkSitemap(site, out)
  await checkRobots(site, out)
  await checkManifest(site, out)
  await checkJson(site, out, 'vercel.json')
  await checkScript(site, out)
  return out
}

const MARK: Record<Level, string> = { ok: '✅', aviso: '⚠️', erro: '❌' }

export function report(findings: Finding[]): string {
  const errors = findings.filter(f => f.level === 'erro').length
  const warnings = findings.filter(f => f.level === 'aviso').length
  const head =
    errors === 0 && warnings === 0
      ? '**Site OK**: nada quebrado.'
      : `**${errors} erro${errors === 1 ? '' : 's'}, ${warnings} aviso${warnings === 1 ? '' : 's'}**`
  const order: Level[] = ['erro', 'aviso', 'ok']
  const lines = order.flatMap(level => findings.filter(f => f.level === level).map(f => `${MARK[level]} ${f.text}`))

  return [`## /site-check · Lighthouse Imports`, '', head, '', ...lines].join('\n')
}
